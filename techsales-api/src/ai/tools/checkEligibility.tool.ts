/**
 * Phase C — `check_eligibility`. READ tool. Looks a person up in the LIS
 * (Low Income Subsidy) and Medicaid eligibility registries — the same
 * seed registries the eligibility screens use — matched by Medicare number
 * first, then name + DOB.
 *
 * Registry files are committed under data/sample/lookup (they are reference
 * registries, not seeded into Mongo — the tool reads them directly and
 * caches in module scope).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/ai/tools → techsales-api root
const SAMPLE_LOOKUP_DIR = path.resolve(__dirname, '..', '..', '..', 'data', 'sample', 'lookup');

interface LisRecord {
  eligibilityId: string;
  firstName: string;
  lastName: string;
  dob: string;
  medicareNumber: string;
  isEligible: boolean;
  lisLevel?: number;
  eligibilityDate?: string;
  expirationDate?: string;
}

interface MedicaidRecord extends Omit<LisRecord, 'lisLevel'> {
  medicaidId?: string;
  medicaidState?: string;
  benefitType?: string;
}

let registries: { lis: LisRecord[]; medicaid: MedicaidRecord[] } | null = null;

async function loadRegistries(): Promise<NonNullable<typeof registries>> {
  if (registries) return registries;
  const [lisRaw, medRaw] = await Promise.all([
    fs.readFile(path.join(SAMPLE_LOOKUP_DIR, 'lisEligibility.json'), 'utf8'),
    fs.readFile(path.join(SAMPLE_LOOKUP_DIR, 'medicaidEligibility.json'), 'utf8'),
  ]);
  registries = { lis: JSON.parse(lisRaw), medicaid: JSON.parse(medRaw) };
  return registries;
}

const normalizeMbi = (s: string | undefined): string =>
  (s ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();

const inputSchema = z.object({
  leadId: z
    .string()
    .optional()
    .describe('Look up eligibility for this lead (uses their Medicare number / name / DOB).'),
  medicareNumber: z
    .string()
    .optional()
    .describe('Or look up directly by Medicare number (MBI).'),
});

type ToolInput = z.infer<typeof inputSchema>;

export const checkEligibilityTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      if (!input.leadId && !input.medicareNumber) {
        return JSON.stringify({ error: 'Provide leadId or medicareNumber.' });
      }

      let mbi = normalizeMbi(input.medicareNumber);
      let name: { first: string; last: string; dob: string } | null = null;
      if (input.leadId) {
        const lead = await repos.lead.findById(input.leadId);
        if (!lead) return JSON.stringify({ error: 'Lead not found', leadId: input.leadId });
        if (!mbi) mbi = normalizeMbi(lead.medicareNumber);
        name = { first: lead.firstName.toLowerCase(), last: lead.lastName.toLowerCase(), dob: lead.dob };
      }

      const { lis, medicaid } = await loadRegistries();
      const match = <T extends LisRecord | MedicaidRecord>(rows: T[]): T | undefined =>
        rows.find((r) => mbi && normalizeMbi(r.medicareNumber) === mbi) ??
        (name
          ? rows.find(
              (r) =>
                r.firstName.toLowerCase() === name!.first &&
                r.lastName.toLowerCase() === name!.last &&
                r.dob === name!.dob,
            )
          : undefined);

      const lisHit = match(lis);
      const medHit = match(medicaid);

      return JSON.stringify({
        matchBasis: mbi ? 'medicareNumber' : 'name+dob',
        lis: lisHit
          ? { found: true, isEligible: lisHit.isEligible, lisLevel: lisHit.lisLevel, expirationDate: lisHit.expirationDate }
          : { found: false },
        medicaid: medHit
          ? {
              found: true,
              isEligible: medHit.isEligible,
              benefitType: medHit.benefitType,
              medicaidState: medHit.medicaidState,
              expirationDate: medHit.expirationDate,
            }
          : { found: false },
        isDualEligible: !!(lisHit?.isEligible && medHit?.isEligible),
        note: 'Registry lookup on pilot seed data — verify with SSA/state before advising the beneficiary.',
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'check_eligibility',
    description:
      'LIS (Low Income Subsidy / Extra Help) and Medicaid eligibility registry lookup for a ' +
      'lead or a Medicare number. Returns per-program eligibility, LIS level, Medicaid benefit ' +
      'type, and dual-eligible flag. Use for "is he LIS eligible", "does she qualify for ' +
      'Medicaid / Extra Help", "is Joshua dual eligible".',
    schema: inputSchema,
  },
);
