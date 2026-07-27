/**
 * AI call screening — auto-create a lead when a screened call ends
 * WITHOUT an agent takeover. Fire-and-forget from the call teardown; the
 * call path must never fail because of this write.
 *
 * Dedup (user decision): if the caller's phone matches an existing lead
 * (trailing-10-digit match), NO new lead is created — the call record
 * still persists normally.
 *
 * The Lead model has Mongoose-required fields the AI usually can't
 * gather (dob, gender, email, geo). Strategy: obviously-synthetic
 * sentinels, listed in the lead's notes, so agents know what to fix on
 * the callback. Real gathered info (reason, medications, pharmacy)
 * goes into the notes verbatim — no catalog-id tagging server-side.
 */
import { logger } from '../../config/logger.js';
import { repos } from '../../repositories/registry.js';
import { resolveZipGeo } from '../rules/entityExtractor.js';
import type { ExtractedEntities } from '../types/call.types.js';
import type { Lead } from '../../types/index.js';

const PLACEHOLDER_DOB = '1900-01-01';

export interface CreateLeadFromScreeningInput {
  callSid: string;
  entities: ExtractedEntities;
  callerNumber?: string;
  agentUserId: string;
  /** Post-call summary notes already generated for the record. */
  noteLines?: string[];
}

export async function createLeadFromScreening(
  input: CreateLeadFromScreeningInput,
): Promise<void> {
  const { callSid, entities, callerNumber, agentUserId } = input;
  try {
    const phone = entities.phone ?? callerNumber ?? '';
    if (!phone) {
      logger.info({ callSid }, 'screening auto-lead: no phone captured — skipped');
      return;
    }

    const existing = await repos.lead.findByPhone(phone);
    if (existing) {
      logger.info(
        { callSid, leadId: existing.leadId },
        'screening auto-lead: caller matches an existing lead — skipped (dedup)',
      );
      return;
    }

    const zip = entities.zipCode ?? '';
    const geo = zip ? await resolveZipGeo(zip) : null;
    const last10 = phone.replace(/\D/g, '').slice(-10) || 'unknown';

    const placeholders: string[] = [];
    const firstName = entities.firstName ?? (placeholders.push('first name'), 'Unknown');
    const lastName = entities.lastName ?? (placeholders.push('last name'), 'Caller');
    const dob = entities.dateOfBirth ?? (placeholders.push('date of birth'), PLACEHOLDER_DOB);
    placeholders.push('gender', 'email');
    if (!zip) placeholders.push('zip code');

    const noteParts = [
      '[AI screening] Lead captured by the automated assistant during call screening.',
      ...(input.noteLines ?? []),
      entities.drugs && entities.drugs.length > 0
        ? `Medications mentioned: ${entities.drugs
            .map((d) => [d.name, d.dosage, d.frequency].filter(Boolean).join(' '))
            .join(', ')}`
        : null,
      entities.pharmacies && entities.pharmacies.length > 0
        ? `Pharmacy mentioned: ${entities.pharmacies.map((p) => p.name).join(', ')}`
        : null,
      entities.providers && entities.providers.length > 0
        ? `Provider mentioned: ${entities.providers.map((p) => p.name).join(', ')}`
        : null,
      `Placeholder fields to verify on callback: ${placeholders.join(', ')}.`,
    ].filter((l): l is string => !!l);

    // leadId '' → the repo's create generates a real LEAD- id (falsy check).
    const lead: Lead = {
      leadId: '',
      firstName,
      lastName,
      dob,
      gender: 'Male', // placeholder — flagged in notes
      email: `screening+${last10}@placeholder.local`, // placeholder — flagged in notes
      phone,
      address1: '',
      // Mongoose `required` rejects empty strings — geo placeholders must
      // be non-empty when the zip wasn't captured or isn't in the lookup.
      zipCode: zip || '00000',
      state: geo?.state || 'Unknown',
      county: geo?.county || 'Unknown',
      city: geo?.city || 'Unknown',
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
      notes: noteParts.join('\n'),
      assignedTo: agentUserId,
      createdAt: new Date().toISOString(),
      createdBy: 'AI-SCREENING',
    };

    const created = await repos.lead.create(lead);
    logger.info(
      { callSid, leadId: created.leadId, phone: `…${last10.slice(-4)}` },
      'screening auto-lead: lead created',
    );
  } catch (err) {
    logger.error({ err, callSid }, 'screening auto-lead: creation failed (call unaffected)');
  }
}
