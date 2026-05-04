/**
 * Deterministic synthetic formulary generator.
 *
 * For every (plan, drug) pair in the seed lookup data, derives a stable
 * `(tier, priorAuth, stepTherapy, qtyLimit)` tuple from a SHA-256 of
 * `${planId}|${drugId}`. Same input → same output every run, no random seed
 * to manage.
 *
 * Output: `techsales-api/data/formulary-synthetic.json` — flat array of
 * `{ planId, drugId, tier, priorAuth, stepTherapy, qtyLimit }` records.
 *
 * The carrier-sanitized seed data is NOT real formulary data. The Phase 3+
 * UI will surface a "Simulated formulary — pilot data" banner above any
 * surface that consumes this file.
 *
 * CLI:
 *   tsx src/scripts/build-formulary.ts
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(process.cwd());
const PLAN_PATH = path.join(REPO_ROOT, 'data', 'sample', 'lookup', 'planInformation.json');
const DRUG_PATH = path.join(REPO_ROOT, 'data', 'sample', 'lookup', 'drugData.json');
const OUT_PATH = path.join(REPO_ROOT, 'data', 'formulary-synthetic.json');

interface PlanRow {
  planId: string;
  isDeleted?: boolean;
}

interface DrugRow {
  drugId: string;
}

interface FormularyRow {
  planId: string;
  drugId: string;
  tier: number;
  priorAuth: boolean;
  stepTherapy: boolean;
  qtyLimit: number;
}

const TIER_CHOICES = [1, 2, 3, 4] as const;
const QTY_CHOICES = [30, 60, 90] as const;

function hashBytes(planId: string, drugId: string): Buffer {
  return createHash('sha256').update(`${planId}|${drugId}`).digest();
}

function deriveRow(planId: string, drugId: string): FormularyRow {
  const h = hashBytes(planId, drugId);
  // Use distinct byte positions so each property doesn't share entropy.
  const tier = TIER_CHOICES[h[0] % TIER_CHOICES.length] as number;
  const priorAuth = h[1] % 4 === 0; // ~25%
  const stepTherapy = h[2] % 5 === 0; // ~20%
  const qtyLimit = QTY_CHOICES[h[3] % QTY_CHOICES.length] as number;
  return { planId, drugId, tier, priorAuth, stepTherapy, qtyLimit };
}

async function main(): Promise<void> {
  const [plansRaw, drugsRaw] = await Promise.all([
    fs.readFile(PLAN_PATH, 'utf8'),
    fs.readFile(DRUG_PATH, 'utf8'),
  ]);
  const plans = JSON.parse(plansRaw) as PlanRow[];
  const drugs = JSON.parse(drugsRaw) as DrugRow[];

  const activePlans = plans.filter((p) => !p.isDeleted);
  const rows: FormularyRow[] = [];
  for (const p of activePlans) {
    for (const d of drugs) {
      rows.push(deriveRow(p.planId, d.drugId));
    }
  }

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(rows, null, 2), 'utf8');

  // eslint-disable-next-line no-console
  console.log(
    `[formulary] wrote ${rows.length} rows ` +
      `(plans=${activePlans.length} × drugs=${drugs.length}) → ${OUT_PATH}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[formulary] build failed', err);
  process.exit(1);
});
