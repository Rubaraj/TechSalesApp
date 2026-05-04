/**
 * `check_drug_coverage` — looks up (planId, drugId) pairs in the synthetic
 * formulary table and returns coverage flags + tier/PA/step-therapy/qty
 * fields. Reads `data/formulary-synthetic.json` once on first use and caches
 * a fast lookup map in module memory.
 *
 * NOTE: synthetic / pilot data — do NOT present these results as authoritative.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';

interface FormularyRow {
  planId: string;
  drugId: string;
  tier: number;
  priorAuth: boolean;
  stepTherapy: boolean;
  qtyLimit: number;
}

let lookup: Map<string, FormularyRow> | null = null;

const here = path.dirname(fileURLToPath(import.meta.url));
// dist/ai/tools/* and src/ai/tools/* both sit three levels under the package
// root — climb up to the package root and into data/.
const FORMULARY_PATH = path.resolve(here, '..', '..', '..', 'data', 'formulary-synthetic.json');

function loadFormulary(): Map<string, FormularyRow> {
  if (lookup) return lookup;
  const raw = readFileSync(FORMULARY_PATH, 'utf-8');
  const rows = JSON.parse(raw) as FormularyRow[];
  const map = new Map<string, FormularyRow>();
  for (const r of rows) {
    map.set(`${r.planId}::${r.drugId}`, r);
  }
  lookup = map;
  return map;
}

const inputSchema = z.object({
  planIds: z
    .array(z.string().min(1))
    .min(1)
    .describe('Plan ids to check coverage on, e.g. ["PLAN-001", "PLAN-002"].'),
  drugIds: z
    .array(z.string().min(1))
    .min(1)
    .describe('Drug ids to check, e.g. ["DRUG-001"].'),
});

type ToolInput = z.infer<typeof inputSchema>;

interface CoverageRow {
  planId: string;
  drugId: string;
  tier: number;
  priorAuth: boolean;
  stepTherapy: boolean;
  qtyLimit: number;
  isCovered: true;
}
interface UncoveredRow {
  planId: string;
  drugId: string;
  isCovered: false;
}

export const checkDrugCoverageTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      const map = loadFormulary();
      const coverage: CoverageRow[] = [];
      const uncovered: UncoveredRow[] = [];
      for (const planId of input.planIds) {
        for (const drugId of input.drugIds) {
          const row = map.get(`${planId}::${drugId}`);
          if (row) {
            coverage.push({
              planId: row.planId,
              drugId: row.drugId,
              tier: row.tier,
              priorAuth: row.priorAuth,
              stepTherapy: row.stepTherapy,
              qtyLimit: row.qtyLimit,
              isCovered: true,
            });
          } else {
            uncovered.push({ planId, drugId, isCovered: false });
          }
        }
      }
      return JSON.stringify({ coverage, uncovered });
    } catch (err) {
      return JSON.stringify({ ok: false, error: String(err) });
    }
  },
  {
    name: 'check_drug_coverage',
    description:
      'Check whether each (planId, drugId) pair is on the plan\'s formulary. ' +
      'Returns matched rows with tier (1-5), priorAuth, stepTherapy, qtyLimit; ' +
      'pairs with no match are returned in `uncovered`. ' +
      'NOTE: synthetic / pilot data — verify with official formulary documents.',
    schema: inputSchema,
  },
);
