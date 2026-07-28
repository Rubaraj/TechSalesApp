/**
 * AI call screening — save the caller's lead DURING the call (the
 * assistant's `save_lead` function), rather than only at teardown.
 *
 * Server-side is the source of truth: the LeadForm's submit handler is
 * gated on a real button click, so a bridge can't drive it. The browser
 * mirrors the write instead — `fill_field` actions populate the open form
 * as details arrive, and a navigate event opens the saved lead.
 *
 * A caller already in the system is ENRICHED, never duplicated: blank and
 * placeholder fields are filled from what the assistant heard, and a note
 * for this call is appended. Values a human typed are never overwritten.
 */
import { logger } from '../../config/logger.js';
import { repos } from '../../repositories/registry.js';
import { publish } from '../../services/callBus.js';
import { resolveZipGeo } from '../rules/entityExtractor.js';
import { setScreeningLeadId } from './screeningState.js';
import type { ExtractedEntities } from '../types/call.types.js';
import type { Lead } from '../../types/index.js';

const PLACEHOLDER_DOB = '1900-01-01';
const PLACEHOLDER_LAST_NAME = 'Caller';
const PLACEHOLDER_FIRST_NAME = 'Unknown';
const PLACEHOLDER_GEO = 'Unknown';
const PLACEHOLDER_ZIP = '00000';

/** What the assistant must gather before a lead can be written. */
const REQUIRED_FIELDS = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'gender',
  'email',
  'zipCode',
] as const;

/** Spoken labels — these go straight back to the voice model. */
const FIELD_LABELS: Record<(typeof REQUIRED_FIELDS)[number], string> = {
  firstName: 'first name',
  lastName: 'last name',
  dateOfBirth: 'date of birth',
  gender: 'gender',
  email: 'email address',
  zipCode: 'zip code',
};

export interface SaveScreeningLeadInput {
  callSid: string;
  agentUserId: string;
  entities: ExtractedEntities;
  callerNumber?: string;
  /** Reason / callback lines captured by save_caller_details. */
  noteLines?: string[];
  /** Lead already written earlier in this call → update it. */
  existingLeadId?: string;
}

export interface SaveScreeningLeadResult {
  saved: boolean;
  leadId?: string;
  created?: boolean;
  /** Spoken labels of what the assistant still needs to ask for. */
  missing?: string[];
  error?: string;
}

/** Placeholder values count as "blank" when enriching. */
function isBlank(value: unknown, placeholder?: string): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (placeholder && trimmed === placeholder) return true;
  return trimmed.startsWith('screening+') && trimmed.endsWith('@placeholder.local');
}

function callNoteBlock(noteLines: string[] | undefined, created: boolean): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return [
    `[AI screening ${stamp}] ${created ? 'Lead opened' : 'Updated'} by the automated assistant during the call.`,
    ...(noteLines ?? []),
  ].join('\n');
}

/**
 * Write (or enrich) the caller's lead. Returns `missing` instead of
 * writing when the assistant hasn't gathered the required set yet, so the
 * voice model knows exactly what to ask next. Never throws.
 */
export async function saveScreeningLead(
  input: SaveScreeningLeadInput,
): Promise<SaveScreeningLeadResult> {
  const { callSid, agentUserId, entities, callerNumber } = input;
  try {
    const phone = entities.phone ?? callerNumber ?? '';
    if (!phone) {
      return { saved: false, missing: ['a phone number we can reach you on'] };
    }

    const missing = REQUIRED_FIELDS.filter((f) => !entities[f]).map((f) => FIELD_LABELS[f]);
    if (missing.length > 0) return { saved: false, missing };

    const zip = entities.zipCode ?? '';
    const geo = zip ? await resolveZipGeo(zip) : null;

    // Same call, second save → update the row we already wrote.
    const existing = input.existingLeadId
      ? await repos.lead.findById(input.existingLeadId)
      : await repos.lead.findByPhone(phone);

    if (existing) {
      // Enrich: only fill what's blank or still a placeholder. A value the
      // agent typed always wins over what the assistant heard.
      const patch: Partial<Lead> = {};
      if (isBlank(existing.firstName, PLACEHOLDER_FIRST_NAME) && entities.firstName) {
        patch.firstName = entities.firstName;
      }
      if (isBlank(existing.lastName, PLACEHOLDER_LAST_NAME) && entities.lastName) {
        patch.lastName = entities.lastName;
      }
      if (isBlank(existing.dob, PLACEHOLDER_DOB) && entities.dateOfBirth) {
        patch.dob = entities.dateOfBirth;
      }
      if (isBlank(existing.email) && entities.email) patch.email = entities.email;
      if (isBlank(existing.zipCode, PLACEHOLDER_ZIP) && zip) {
        patch.zipCode = zip;
        if (geo?.state) patch.state = geo.state;
        if (geo?.county) patch.county = geo.county;
        if (geo?.city) patch.city = geo.city;
      } else {
        if (isBlank(existing.state, PLACEHOLDER_GEO) && geo?.state) patch.state = geo.state;
        if (isBlank(existing.county, PLACEHOLDER_GEO) && geo?.county) patch.county = geo.county;
        if (isBlank(existing.city, PLACEHOLDER_GEO) && geo?.city) patch.city = geo.city;
      }
      if (isBlank(existing.medicareNumber) && entities.medicareNumber) {
        patch.medicareNumber = entities.medicareNumber;
      }
      if (isBlank(existing.medicaidId) && entities.medicaidNumber) {
        patch.medicaidId = entities.medicaidNumber;
      }
      patch.notes = [existing.notes, callNoteBlock(input.noteLines, false)]
        .filter(Boolean)
        .join('\n');
      patch.updatedBy = 'AI-SCREENING';

      const updated = await repos.lead.update(existing.leadId, patch);
      const leadId = updated?.leadId ?? existing.leadId;
      setScreeningLeadId(callSid, leadId);
      logger.info(
        { callSid, leadId, fields: Object.keys(patch).length },
        'screening lead: existing lead enriched',
      );
      publishLeadSaved(callSid, leadId, false);
      return { saved: true, leadId, created: false };
    }

    const lead: Lead = {
      leadId: '', // repo generates a real LEAD- id on falsy
      firstName: entities.firstName!,
      lastName: entities.lastName!,
      dob: entities.dateOfBirth!,
      gender: entities.gender!,
      email: entities.email!,
      phone,
      address1: '',
      // Mongoose `required` rejects empty strings — geo needs a non-empty
      // fallback when the zip isn't in the lookup table.
      zipCode: zip || PLACEHOLDER_ZIP,
      state: geo?.state || PLACEHOLDER_GEO,
      county: geo?.county || PLACEHOLDER_GEO,
      city: geo?.city || PLACEHOLDER_GEO,
      ...(entities.medicareNumber ? { medicareNumber: entities.medicareNumber } : {}),
      ...(entities.medicaidNumber ? { medicaidId: entities.medicaidNumber } : {}),
      leadStatus: 'New Lead',
      source: 'Call',
      permissionToContact: true,
      existingCarrier1Member: false,
      tobaccoUsage: false,
      taggedPharmacies: [],
      taggedDrugs: [],
      taggedProviders: [],
      notes: callNoteBlock(input.noteLines, true),
      assignedTo: agentUserId,
      createdAt: new Date().toISOString(),
      // The agent owns the lead: the Leads list scopes an agent's book by
      // createdBy, so crediting 'AI-SCREENING' here would hide the record
      // from the very person who has to work it. Provenance lives in
      // createdVia and the "[AI screening]" note line.
      createdBy: agentUserId,
      createdVia: 'AI-SCREENING',
    };

    const created = await repos.lead.create(lead);
    setScreeningLeadId(callSid, created.leadId);
    logger.info({ callSid, leadId: created.leadId }, 'screening lead: created live');
    publishLeadSaved(callSid, created.leadId, true);
    return { saved: true, leadId: created.leadId, created: true };
  } catch (err) {
    logger.error({ err, callSid }, 'screening lead: save failed (call unaffected)');
    return { saved: false, error: 'The file could not be saved right now.' };
  }
}

/** Open the saved lead in the watching agent's browser + log a feed card. */
function publishLeadSaved(callSid: string, leadId: string, created: boolean): void {
  publish(callSid, {
    type: 'actions',
    actions: [
      {
        type: 'show_info',
        topic: `lead:${leadId}`,
        title: `AI assistant — lead ${created ? 'created' : 'updated'}`,
        content: `${leadId} saved from this call.`,
      },
    ],
  });
  publish(callSid, {
    type: 'navigate',
    route: `/leads/${leadId}`,
    reason: `Lead ${leadId} ${created ? 'created' : 'updated'} by the AI assistant`,
  });
}

/**
 * Teardown — finalize a lead written during the call. Appends the
 * post-call note lines; never creates (that's `createLeadFromScreening`'s
 * job when no live lead exists).
 */
export async function finalizeScreeningLead(
  leadId: string,
  noteLines: string[],
): Promise<void> {
  if (noteLines.length === 0) return;
  try {
    const existing = await repos.lead.findById(leadId);
    if (!existing) return;
    await repos.lead.update(leadId, {
      notes: [existing.notes, noteLines.join('\n')].filter(Boolean).join('\n'),
      updatedBy: 'AI-SCREENING',
    });
  } catch (err) {
    logger.error({ err, leadId }, 'screening lead: finalize failed');
  }
}
