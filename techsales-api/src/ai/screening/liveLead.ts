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
import { resolveDrug, resolvePharmacy, resolveProvider } from './catalogResolver.js';
import type { ExtractedEntities } from '../types/call.types.js';
import type { Lead, TaggedDrug } from '../../types/index.js';

/** Per-lead tag caps enforced by the lead repository. */
const MAX_PHARMACIES = 3;
const MAX_PROVIDERS = 5;

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

function callNoteBlock(
  noteLines: string[] | undefined,
  created: boolean,
  clinicalNotes: string[] = [],
): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return [
    `[AI screening ${stamp}] ${created ? 'Lead opened' : 'Updated'} by the automated assistant during the call.`,
    ...(noteLines ?? []),
    ...clinicalNotes,
  ].join('\n');
}

/** Frequency → a sensible 30-day-ish quantity, mirroring the lead form. */
function deriveQuantity(frequency: string): number {
  const f = frequency.toLowerCase();
  if (f.includes('twice')) return 60;
  if (f.includes('three times')) return 90;
  if (f.includes('four times')) return 120;
  if (f.includes('every other')) return 15;
  if (f.includes('weekly')) return 4;
  if (f.includes('as needed')) return 30;
  return 30;
}

export interface ClinicalTags {
  taggedDrugs: TaggedDrug[];
  taggedPharmacies: string[];
  taggedProviders: string[];
  /** Human-readable lines for the lead's notes (mentions + catalog misses). */
  notes: string[];
}

/**
 * Turn what the caller said about medications / pharmacy / doctors into real
 * catalog tags, and describe the rest in the notes.
 *
 * `existing` lets the enrich path avoid re-tagging what's already on the
 * lead and keep the per-type caps (3 pharmacies, 5 providers) intact.
 */
export async function buildClinicalTags(
  entities: ExtractedEntities,
  zipCode: string | undefined,
  existing?: { taggedDrugs?: TaggedDrug[]; taggedPharmacies?: string[]; taggedProviders?: string[] },
): Promise<ClinicalTags> {
  const taggedDrugs = [...(existing?.taggedDrugs ?? [])];
  const taggedPharmacies = [...(existing?.taggedPharmacies ?? [])];
  const taggedProviders = [...(existing?.taggedProviders ?? [])];
  const notes: string[] = [];
  const unmatched: string[] = [];

  const drugMentions = entities.drugs ?? [];
  for (const d of drugMentions) {
    const hit = await resolveDrug(d.name, d.dosage);
    if (!hit) {
      unmatched.push(`${d.name}${d.dosage ? ` ${d.dosage}` : ''}`);
      continue;
    }
    if (taggedDrugs.some((t) => t.drugId === hit.drugId)) continue;
    // Mongoose requires dosage/quantity/frequency on the sub-document and
    // rejects empty strings, so every one of these needs a real value.
    const frequency = d.frequency ?? 'As directed';
    taggedDrugs.push({
      drugId: hit.drugId,
      drugName: hit.drugName,
      dosage: d.dosage || hit.strength || 'As directed',
      quantity: deriveQuantity(frequency),
      frequency,
      daysSupply: 30,
    });
  }
  if (drugMentions.length > 0) {
    notes.push(
      `Medications mentioned: ${drugMentions
        .map((d) => [d.name, d.dosage, d.frequency].filter(Boolean).join(' '))
        .join(', ')}`,
    );
  }

  const pharmacyMentions = entities.pharmacies ?? [];
  for (const p of pharmacyMentions) {
    const hit = await resolvePharmacy(p.name, zipCode);
    if (!hit) {
      unmatched.push(p.name);
      continue;
    }
    if (taggedPharmacies.includes(hit.pharmacyId)) continue;
    if (taggedPharmacies.length >= MAX_PHARMACIES) continue;
    taggedPharmacies.push(hit.pharmacyId);
  }
  if (pharmacyMentions.length > 0) {
    notes.push(`Pharmacy mentioned: ${pharmacyMentions.map((p) => p.name).join(', ')}`);
  }

  const providerMentions = entities.providers ?? [];
  for (const p of providerMentions) {
    const hit = await resolveProvider(p.name, zipCode);
    if (!hit) {
      unmatched.push(p.name);
      continue;
    }
    if (taggedProviders.includes(hit.providerId)) continue;
    if (taggedProviders.length >= MAX_PROVIDERS) continue;
    taggedProviders.push(hit.providerId);
  }
  if (providerMentions.length > 0) {
    notes.push(`Provider mentioned: ${providerMentions.map((p) => p.name).join(', ')}`);
  }

  if (unmatched.length > 0) {
    notes.push(`Not matched to catalog (verify on callback): ${unmatched.join(', ')}`);
  }
  return { taggedDrugs, taggedPharmacies, taggedProviders, notes };
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

    // The required set gates CREATING a record. When we already have one
    // (a later save in the same call, or the teardown sweep) we're only
    // enriching, so a field the caller never gave must not abort the write.
    if (!input.existingLeadId) {
      const missing = REQUIRED_FIELDS.filter((f) => !entities[f]).map((f) => FIELD_LABELS[f]);
      if (missing.length > 0) return { saved: false, missing };
    }

    const zip = entities.zipCode ?? '';
    const geo = zip ? await resolveZipGeo(zip) : null;

    // Same call, second save → update the row we already wrote.
    const existing = input.existingLeadId
      ? await repos.lead.findById(input.existingLeadId)
      : await repos.lead.findByPhone(phone);

    const clinical = await buildClinicalTags(entities, zip || undefined, existing ?? undefined);

    if (existing) {
      // Enrich: only fill what's blank or still a placeholder. A value the
      // agent typed always wins over what the assistant heard.
      const patch: Partial<Lead> = {};
      if (clinical.taggedDrugs.length > 0) patch.taggedDrugs = clinical.taggedDrugs;
      if (clinical.taggedPharmacies.length > 0) patch.taggedPharmacies = clinical.taggedPharmacies;
      if (clinical.taggedProviders.length > 0) patch.taggedProviders = clinical.taggedProviders;
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
      patch.notes = [existing.notes, callNoteBlock(input.noteLines, false, clinical.notes)]
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
      taggedPharmacies: clinical.taggedPharmacies,
      taggedDrugs: clinical.taggedDrugs,
      taggedProviders: clinical.taggedProviders,
      notes: callNoteBlock(input.noteLines, true, clinical.notes),
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
 * Teardown sweep for a lead written during the call.
 *
 * Anything the caller mentioned AFTER `save_lead` — a medication, their
 * pharmacy, a doctor — is only in the entity accumulator, and the tagging
 * that would put it on the record runs inside `saveScreeningLead`. So this
 * simply runs that enrich path once more against the final snapshot rather
 * than re-implementing it: catalog tagging, blank-filling and note append
 * all come along, and existing tags are deduped.
 *
 * Never creates — `existingLeadId` guarantees the enrich branch.
 */
export async function finalizeScreeningLead(input: {
  leadId: string;
  agentUserId: string;
  callSid: string;
  entities: ExtractedEntities;
  callerNumber?: string;
  noteLines: string[];
}): Promise<void> {
  try {
    await saveScreeningLead({
      callSid: input.callSid,
      agentUserId: input.agentUserId,
      entities: input.entities,
      existingLeadId: input.leadId,
      ...(input.callerNumber ? { callerNumber: input.callerNumber } : {}),
      ...(input.noteLines.length > 0 ? { noteLines: input.noteLines } : {}),
    });
  } catch (err) {
    logger.error({ err, leadId: input.leadId }, 'screening lead: finalize failed');
  }
}
