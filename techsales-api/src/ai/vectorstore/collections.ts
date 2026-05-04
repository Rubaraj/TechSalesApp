/**
 * Central registry for the Qdrant collections used by the AI pipeline.
 *
 * Each entry pins the dimension (matched to `nomic-embed-text` = 768) and the
 * distance metric (Cosine — `OllamaEmbeddings` returns un-normalized vectors,
 * Cosine handles that correctly).
 *
 * For each collection we also expose a `payloadToSearchText(payload)` helper.
 * It produces the natural-language string that gets fed to the embedder AND
 * indexed by the BM25-side of the hybrid retriever, so the two halves of the
 * hybrid score look at the same surface text.
 *
 * Payload shapes (kept loose at the type level — we don't fail indexing if a
 * field is missing):
 *
 *   plans:     { planId, planName, carrier, planType, productType, category,
 *                contractYear, market, region, marketingName, legalEntity,
 *                premium?, annualOopMax?, drugDeductible?, snpType?, minAge?,
 *                maxAge?, isDeleted? }
 *
 *   benefits:  { benefitId, planId, contractYear, contractNumber, pbp,
 *                category, categoryData, categoryGroup, isAvailable? }
 *
 *   drugs:     { drugId, brandName, genericName, drugClass, dosageForm,
 *                strength, isBrand, isGeneric, route?, therapeuticCategory? }
 *
 *   formulary: { planId, drugId, tier, priorAuth, stepTherapy, qtyLimit }
 *
 *   faqs:      { faqId, question, source }
 *              (Phase 2 ships zero FAQs — collection is created empty so the
 *               retriever doesn't need to special-case "missing collection".)
 */
import { getQdrantClient } from './qdrantClient.js';
import { logger } from '../../config/logger.js';

export type Distance = 'Cosine' | 'Euclid' | 'Dot' | 'Manhattan';

export interface CollectionDef {
  /** Qdrant collection name. */
  name: string;
  /** Vector dimension — must match the embedder. */
  dim: number;
  /** Distance metric. */
  distance: Distance;
}

export const COLLECTIONS = {
  plans: { name: 'medhub-plans', dim: 768, distance: 'Cosine' as const },
  benefits: { name: 'medhub-benefits', dim: 768, distance: 'Cosine' as const },
  drugs: { name: 'medhub-drugs', dim: 768, distance: 'Cosine' as const },
  formulary: { name: 'medhub-formulary', dim: 768, distance: 'Cosine' as const },
  faqs: { name: 'medhub-faqs', dim: 768, distance: 'Cosine' as const },
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;

// ---- payload types (advisory; not enforced at runtime) ----

export interface PlanPayload {
  planId: string;
  planName: string;
  carrier?: string;
  planType?: string;
  productType?: string;
  category?: string;
  contractYear?: number;
  market?: string;
  region?: string;
  marketingName?: string;
  legalEntity?: string;
  premium?: number;
  annualOopMax?: number;
  drugDeductible?: number;
  snpType?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  isDeleted?: boolean;
  // Optional aggregated benefit highlights (helps NL search across "dental"
  // queries even when the user is searching the plans collection directly).
  benefitHighlights?: string[];
  // State coverage hint, derived from zipStateCounty mapping during indexing.
  states?: string[];
  [key: string]: unknown;
}

export interface BenefitPayload {
  benefitId: string;
  planId: string;
  contractYear?: number;
  contractNumber?: string;
  pbp?: string;
  category: string;
  categoryData: string;
  categoryGroup?: string;
  isAvailable?: boolean;
  [key: string]: unknown;
}

export interface DrugPayload {
  drugId: string;
  brandName?: string;
  genericName?: string;
  drugClass?: string;
  dosageForm?: string;
  strength?: string;
  isBrand?: boolean;
  isGeneric?: boolean;
  route?: string;
  therapeuticCategory?: string;
  [key: string]: unknown;
}

export interface FormularyPayload {
  planId: string;
  drugId: string;
  tier: number;
  priorAuth: boolean;
  stepTherapy: boolean;
  qtyLimit: number;
  // Convenience copies of the joined fields, set at index time so retrieval
  // results don't need a second lookup.
  drugName?: string;
  planName?: string;
  [key: string]: unknown;
}

export interface FaqPayload {
  faqId: string;
  question: string;
  source?: string;
  [key: string]: unknown;
}

export type PayloadByKey = {
  plans: PlanPayload;
  benefits: BenefitPayload;
  drugs: DrugPayload;
  formulary: FormularyPayload;
  faqs: FaqPayload;
};

// ---- payload → searchable text ----

const compact = (parts: Array<string | undefined | null | number | boolean>): string =>
  parts
    .filter((p) => p !== undefined && p !== null && p !== '' && p !== false)
    .map((p) => String(p))
    .join(' ');

export function planSearchText(p: PlanPayload): string {
  return compact([
    p.planName,
    p.marketingName,
    p.carrier,
    p.planType,
    p.productType,
    p.category,
    p.market,
    p.region,
    p.snpType ?? undefined,
    p.legalEntity,
    p.premium !== undefined ? `premium $${p.premium}` : undefined,
    p.annualOopMax !== undefined ? `annual out of pocket $${p.annualOopMax}` : undefined,
    p.drugDeductible !== undefined ? `drug deductible $${p.drugDeductible}` : undefined,
    p.benefitHighlights && p.benefitHighlights.length > 0
      ? p.benefitHighlights.slice(0, 30).join(' ')
      : undefined,
    p.states && p.states.length > 0 ? `states ${p.states.join(' ')}` : undefined,
  ]);
}

export function benefitSearchText(b: BenefitPayload): string {
  return compact([b.category, b.categoryGroup, b.categoryData, `plan ${b.planId}`]);
}

export function drugSearchText(d: DrugPayload): string {
  return compact([
    d.brandName,
    d.genericName,
    d.drugClass,
    d.therapeuticCategory,
    d.dosageForm,
    d.strength,
    d.route,
    d.isBrand ? 'brand' : undefined,
    d.isGeneric ? 'generic' : undefined,
  ]);
}

export function formularySearchText(f: FormularyPayload): string {
  return compact([
    f.drugName,
    f.planName,
    `tier ${f.tier}`,
    f.priorAuth ? 'prior authorization required' : 'no prior authorization',
    f.stepTherapy ? 'step therapy required' : 'no step therapy',
    `quantity limit ${f.qtyLimit}`,
  ]);
}

export function faqSearchText(f: FaqPayload): string {
  return compact([f.question, f.source]);
}

/**
 * Type-safe dispatcher — returns the right text-extractor for a collection
 * key. The returned function is `(payload: unknown) => string` so callers
 * (indexer, BM25 corpus loader) don't need to switch on key shape.
 */
export function payloadToSearchText(key: CollectionKey): (payload: unknown) => string {
  switch (key) {
    case 'plans':
      return (p) => planSearchText(p as PlanPayload);
    case 'benefits':
      return (p) => benefitSearchText(p as BenefitPayload);
    case 'drugs':
      return (p) => drugSearchText(p as DrugPayload);
    case 'formulary':
      return (p) => formularySearchText(p as FormularyPayload);
    case 'faqs':
      return (p) => faqSearchText(p as FaqPayload);
    default: {
      const exhaustive: never = key;
      throw new Error(`Unhandled collection key: ${String(exhaustive)}`);
    }
  }
}

// ---- Qdrant lifecycle ----

/**
 * Idempotently make sure a Qdrant collection exists with the right shape.
 *
 * - When `recreate=true`, drops + recreates the collection (data loss).
 * - When `recreate=false` (default), creates only if missing; if present, does
 *   nothing (we don't validate the existing dim/distance — Phase 2 trusts the
 *   `--reset` path to refresh on schema bumps).
 *
 * Returns `true` if the collection was (re)created, `false` if it already
 * existed and we left it alone.
 */
export async function ensureCollection(key: CollectionKey, recreate = false): Promise<boolean> {
  const def = COLLECTIONS[key];
  const client = getQdrantClient();

  const existing = await client.getCollections();
  const exists = existing.collections.some((c) => c.name === def.name);

  if (exists && !recreate) {
    logger.info({ collection: def.name }, 'Qdrant collection already exists — skipping create');
    return false;
  }

  if (exists && recreate) {
    logger.info({ collection: def.name }, 'Qdrant collection exists — deleting before recreate');
    await client.deleteCollection(def.name);
  }

  logger.info(
    { collection: def.name, dim: def.dim, distance: def.distance },
    'Creating Qdrant collection',
  );
  await client.createCollection(def.name, {
    vectors: { size: def.dim, distance: def.distance },
  });
  return true;
}
