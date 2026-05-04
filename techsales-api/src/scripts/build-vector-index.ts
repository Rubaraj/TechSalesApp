/**
 * Canonical re-embedder: reads the carrier-sanitized seed lookup JSON +
 * synthetic formulary, derives searchable text, embeds via Ollama, upserts
 * to Qdrant.
 *
 * Idempotent. Each upserted point has a deterministic UUIDv5 id derived from
 * its business key, so re-running on top of an existing collection updates
 * in-place rather than duplicating.
 *
 * CLI flags:
 *   --reset                 Drop + recreate every collection before indexing
 *   --collection=plans      Only index one collection (alias for --only)
 *   --only=plans,benefits   Comma-separated list of collections
 *
 * Usage:
 *   tsx src/scripts/build-vector-index.ts                # incremental upsert
 *   tsx src/scripts/build-vector-index.ts --reset        # full rebuild
 *   tsx src/scripts/build-vector-index.ts --only=plans   # one collection
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  COLLECTIONS,
  ensureCollection,
  payloadToSearchText,
  type CollectionKey,
  type PlanPayload,
  type BenefitPayload,
  type DrugPayload,
  type FormularyPayload,
} from '../ai/vectorstore/collections.js';
import { getEmbedder } from '../ai/embeddings/ollamaEmbedder.js';
import { getQdrantClient } from '../ai/vectorstore/qdrantClient.js';
import { logger } from '../config/logger.js';

const REPO_ROOT = path.resolve(process.cwd());
const LOOKUP_DIR = path.join(REPO_ROOT, 'data', 'sample', 'lookup');
const FORMULARY_PATH = path.join(REPO_ROOT, 'data', 'formulary-synthetic.json');

const BATCH_SIZE = 32;

// Stable UUIDv5 namespace for the AI pipeline. Generated once
// (`uuidgen -v4`-style) and pinned here so ids are reproducible across
// machines.
const NAMESPACE_HEX = 'b2c3a1d4f0e84a5dac3a4b9d8e2f1c0a';

/** Pure-Node UUIDv5 (sha1 + namespace), avoids the @types/uuid devdep. */
function uuidV5(name: string, namespaceHex: string): string {
  const ns = Buffer.from(namespaceHex, 'hex');
  if (ns.length !== 16) throw new Error('UUIDv5 namespace must be 16 bytes');
  const hash = createHash('sha1');
  hash.update(ns);
  hash.update(name);
  const bytes = hash.digest().subarray(0, 16);
  // Set version (5) and variant bits per RFC 4122.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  bytes[6] = ((bytes[6]! & 0x0f) | 0x50) & 0xff;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  bytes[8] = ((bytes[8]! & 0x3f) | 0x80) & 0xff;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

interface IndexRecord {
  id: string;
  payload: Record<string, unknown>;
  searchText: string;
}

interface CliOptions {
  reset: boolean;
  only: CollectionKey[] | null;
}

function parseArgs(argv: string[]): CliOptions {
  let reset = false;
  let only: CollectionKey[] | null = null;
  for (const a of argv.slice(2)) {
    if (a === '--reset') {
      reset = true;
    } else if (a.startsWith('--collection=') || a.startsWith('--only=')) {
      const raw = a.split('=', 2)[1] ?? '';
      const list = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const valid: CollectionKey[] = [];
      for (const k of list) {
        if (k in COLLECTIONS) valid.push(k as CollectionKey);
        else throw new Error(`Unknown collection: ${k}`);
      }
      only = valid;
    } else {
      throw new Error(`Unknown CLI arg: ${a}`);
    }
  }
  return { reset, only };
}

// ---- per-collection record builders ----

interface RawPlan {
  planId: string;
  planName: string;
  product?: string;
  planType?: string;
  category?: string;
  contractYear?: number;
  market?: string;
  region?: string;
  marketingName?: string;
  legalEntity?: string;
  snpType?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  isDeleted?: boolean;
}

interface RawBenefit {
  benefitId: string;
  planId: string;
  contractYear?: number;
  contractNumber?: string;
  pbp?: string;
  category: string;
  categoryData: string;
  categoryGroup?: string;
  isDeleted?: boolean;
}

interface RawDrug {
  drugId: string;
  brandName?: string;
  genericName?: string;
  drugClass?: string;
  dosageForm?: string;
  strength?: string;
  isBrand?: boolean;
  isGeneric?: boolean;
}

interface RawPremium {
  planId: string;
  premium?: number;
}

interface RawZip {
  zipCode: string;
  stateAbbr: string;
  state: string;
  market?: string;
  region?: string;
  brand?: string;
}

interface RawFormulary {
  planId: string;
  drugId: string;
  tier: number;
  priorAuth: boolean;
  stepTherapy: boolean;
  qtyLimit: number;
}

async function loadJson<T>(p: string): Promise<T> {
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw) as T;
}

/** Carrier name lives at the start of the planName (e.g. "Carrier 1 Medicare ..."). */
function extractCarrier(planName: string): string | undefined {
  const m = planName.match(/^(Carrier\s+\d+)/i);
  return m ? m[1] : undefined;
}

async function buildPlanRecords(): Promise<IndexRecord[]> {
  const [plans, premiums, benefits, zips] = await Promise.all([
    loadJson<RawPlan[]>(path.join(LOOKUP_DIR, 'planInformation.json')),
    loadJson<RawPremium[]>(path.join(LOOKUP_DIR, 'premiumInformation.json')),
    loadJson<RawBenefit[]>(path.join(LOOKUP_DIR, 'benefitData.json')),
    loadJson<RawZip[]>(path.join(LOOKUP_DIR, 'zipStateCounty.json')),
  ]);

  const premiumByPlan = new Map<string, number>();
  for (const p of premiums) {
    if (typeof p.premium === 'number') premiumByPlan.set(p.planId, p.premium);
  }

  const benefitsByPlan = new Map<string, RawBenefit[]>();
  for (const b of benefits) {
    if (b.isDeleted) continue;
    const arr = benefitsByPlan.get(b.planId) ?? [];
    arr.push(b);
    benefitsByPlan.set(b.planId, arr);
  }

  // Plans don't carry state coverage directly. The seed zipStateCounty data
  // associates a `brand` (≈ carrier) with each ZIP — use the carrier match
  // to annotate plans with the set of states the carrier operates in. This
  // gives the searchPlans tool a usable `state` filter without inventing new
  // schema.
  const statesByCarrier = new Map<string, Set<string>>();
  for (const z of zips) {
    if (!z.brand) continue;
    const set = statesByCarrier.get(z.brand) ?? new Set<string>();
    set.add(z.stateAbbr);
    statesByCarrier.set(z.brand, set);
  }

  const records: IndexRecord[] = [];
  const text = payloadToSearchText('plans');
  for (const p of plans) {
    if (p.isDeleted) continue;
    const carrier = extractCarrier(p.planName);
    const states = carrier ? Array.from(statesByCarrier.get(carrier) ?? []).sort() : [];
    const planBenefits = benefitsByPlan.get(p.planId) ?? [];
    const benefitHighlights = planBenefits
      .filter((b) => b.category && b.categoryData)
      .slice(0, 25)
      .map((b) => `${b.category}: ${b.categoryData}`);

    const payload: PlanPayload = {
      planId: p.planId,
      planName: p.planName,
      ...(carrier !== undefined ? { carrier } : {}),
      ...(p.planType !== undefined ? { planType: p.planType } : {}),
      ...(p.product !== undefined ? { productType: p.product } : {}),
      ...(p.category !== undefined ? { category: p.category } : {}),
      ...(p.contractYear !== undefined ? { contractYear: p.contractYear } : {}),
      ...(p.market !== undefined ? { market: p.market } : {}),
      ...(p.region !== undefined ? { region: p.region } : {}),
      ...(p.marketingName !== undefined ? { marketingName: p.marketingName } : {}),
      ...(p.legalEntity !== undefined ? { legalEntity: p.legalEntity } : {}),
      ...(premiumByPlan.has(p.planId) ? { premium: premiumByPlan.get(p.planId) } : {}),
      snpType: p.snpType ?? null,
      ...(p.minAge !== undefined ? { minAge: p.minAge } : {}),
      ...(p.maxAge !== undefined ? { maxAge: p.maxAge } : {}),
      isDeleted: false,
      benefitHighlights,
      states,
    };
    records.push({
      id: uuidV5(`plan:${p.planId}`, NAMESPACE_HEX),
      payload,
      searchText: text(payload),
    });
  }
  return records;
}

async function buildBenefitRecords(): Promise<IndexRecord[]> {
  const benefits = await loadJson<RawBenefit[]>(path.join(LOOKUP_DIR, 'benefitData.json'));
  const text = payloadToSearchText('benefits');
  const records: IndexRecord[] = [];
  for (const b of benefits) {
    if (b.isDeleted) continue;
    const payload: BenefitPayload = {
      benefitId: b.benefitId,
      planId: b.planId,
      ...(b.contractYear !== undefined ? { contractYear: b.contractYear } : {}),
      ...(b.contractNumber !== undefined ? { contractNumber: b.contractNumber } : {}),
      ...(b.pbp !== undefined ? { pbp: b.pbp } : {}),
      category: b.category,
      categoryData: b.categoryData,
      ...(b.categoryGroup !== undefined ? { categoryGroup: b.categoryGroup } : {}),
      isAvailable: !b.isDeleted,
    };
    records.push({
      id: uuidV5(`benefit:${b.benefitId}`, NAMESPACE_HEX),
      payload,
      searchText: text(payload),
    });
  }
  return records;
}

async function buildDrugRecords(): Promise<IndexRecord[]> {
  const drugs = await loadJson<RawDrug[]>(path.join(LOOKUP_DIR, 'drugData.json'));
  const text = payloadToSearchText('drugs');
  const records: IndexRecord[] = [];
  for (const d of drugs) {
    const payload: DrugPayload = {
      drugId: d.drugId,
      ...(d.brandName !== undefined ? { brandName: d.brandName } : {}),
      ...(d.genericName !== undefined ? { genericName: d.genericName } : {}),
      ...(d.drugClass !== undefined ? { drugClass: d.drugClass } : {}),
      ...(d.dosageForm !== undefined ? { dosageForm: d.dosageForm } : {}),
      ...(d.strength !== undefined ? { strength: d.strength } : {}),
      ...(d.isBrand !== undefined ? { isBrand: d.isBrand } : {}),
      ...(d.isGeneric !== undefined ? { isGeneric: d.isGeneric } : {}),
    };
    records.push({
      id: uuidV5(`drug:${d.drugId}`, NAMESPACE_HEX),
      payload,
      searchText: text(payload),
    });
  }
  return records;
}

async function buildFormularyRecords(): Promise<IndexRecord[]> {
  const [formulary, plans, drugs] = await Promise.all([
    loadJson<RawFormulary[]>(FORMULARY_PATH),
    loadJson<RawPlan[]>(path.join(LOOKUP_DIR, 'planInformation.json')),
    loadJson<RawDrug[]>(path.join(LOOKUP_DIR, 'drugData.json')),
  ]);
  const planNameById = new Map(plans.map((p) => [p.planId, p.planName]));
  const drugLabelById = new Map(
    drugs.map((d) => [d.drugId, d.brandName ?? d.genericName ?? d.drugId]),
  );
  const text = payloadToSearchText('formulary');
  const records: IndexRecord[] = [];
  for (const f of formulary) {
    const payload: FormularyPayload = {
      planId: f.planId,
      drugId: f.drugId,
      tier: f.tier,
      priorAuth: f.priorAuth,
      stepTherapy: f.stepTherapy,
      qtyLimit: f.qtyLimit,
      ...(planNameById.has(f.planId) ? { planName: planNameById.get(f.planId) } : {}),
      ...(drugLabelById.has(f.drugId) ? { drugName: drugLabelById.get(f.drugId) } : {}),
    };
    records.push({
      id: uuidV5(`formulary:${f.planId}:${f.drugId}`, NAMESPACE_HEX),
      payload,
      searchText: text(payload),
    });
  }
  return records;
}

async function recordsForCollection(key: CollectionKey): Promise<IndexRecord[]> {
  switch (key) {
    case 'plans':
      return buildPlanRecords();
    case 'benefits':
      return buildBenefitRecords();
    case 'drugs':
      return buildDrugRecords();
    case 'formulary':
      return buildFormularyRecords();
    case 'faqs':
      return [];
    default: {
      const exhaustive: never = key;
      throw new Error(`Unhandled collection: ${String(exhaustive)}`);
    }
  }
}

// ---- main ----

async function indexCollection(key: CollectionKey, opts: CliOptions): Promise<number> {
  const def = COLLECTIONS[key];

  await ensureCollection(key, opts.reset);

  if (key === 'faqs') {
    logger.info({ collection: def.name }, 'faqs is empty in Phase 2 — collection ensured, skipping embed');
    return 0;
  }

  const records = await recordsForCollection(key);
  if (records.length === 0) {
    logger.info({ collection: def.name }, 'No records to index');
    return 0;
  }

  const embedder = getEmbedder();
  const client = getQdrantClient();

  let total = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const texts = batch.map((r) => r.searchText);
    const vectors = await embedder.embedDocuments(texts);
    const points = batch.map((r, idx) => ({
      id: r.id,
      vector: vectors[idx] as number[],
      payload: r.payload,
    }));
    await client.upsert(def.name, { wait: true, points });
    total += batch.length;
    logger.info(
      { collection: def.name, indexed: total, of: records.length },
      'Upserted batch',
    );
  }
  return total;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const keys: CollectionKey[] = opts.only ?? (Object.keys(COLLECTIONS) as CollectionKey[]);

  logger.info({ keys, reset: opts.reset }, 'Starting vector index build');
  const counts: Record<string, number> = {};
  for (const k of keys) {
    counts[k] = await indexCollection(k, opts);
  }
  logger.info({ counts }, 'Vector index build complete');
  // Also print a clean summary for the orchestrator to grep.
  // eslint-disable-next-line no-console
  console.log('[index] summary:', counts);
}

main().catch((err) => {
  logger.error({ err }, 'Vector index build failed');
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
