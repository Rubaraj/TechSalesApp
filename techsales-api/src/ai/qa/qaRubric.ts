/**
 * Gap 9 — admin-editable QA rubric loader (60s-TTL cache + seed-on-empty,
 * the same pattern as complianceCheck/proactiveCoach rule loaders).
 *
 * `loadQaRubric()` returns the ACTIVE dimensions + disclosures sorted by
 * sortOrder. Safety rails:
 *   - the DEFAULT_RUBRIC seeds only when the whole collection is empty
 *     (first boot) — deliberate deletions are respected;
 *   - if zero dimensions are active, the reviewer falls back to the
 *     in-memory defaults (never written to DB) — a QA review must never
 *     run with an empty rubric.
 */
import { logger } from '../../config/logger.js';
import { repos } from '../../repositories/registry.js';
import type { QaRubricItem } from '../../types/index.js';

const CACHE_TTL_MS = 60_000;

export interface QaRubric {
  dimensions: QaRubricItem[];
  disclosures: QaRubricItem[];
}

let cache: { rubric: QaRubric; at: number } | null = null;
let seeding: Promise<void> | null = null;

/** Call after any rubric mutation so the next review reloads immediately. */
export function invalidateQaRubricCache(): void {
  cache = null;
}

/**
 * Load the active rubric (TTL-cached). Never throws — on repo failure
 * returns the last cached rubric (or the in-memory defaults).
 */
export async function loadQaRubric(): Promise<QaRubric> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rubric;
  try {
    let all = await repos.qaRubricItem.findAll(false);
    if (all.length === 0) {
      if (!seeding) seeding = seedDefaultRubric();
      await seeding;
      seeding = null;
      all = await repos.qaRubricItem.findAll(false);
    }
    const bySort = (a: QaRubricItem, b: QaRubricItem) => a.sortOrder - b.sortOrder;
    let dimensions = all
      .filter((r) => r.kind === 'dimension' && r.isActive && r.key)
      .sort(bySort);
    const disclosures = all.filter((r) => r.kind === 'disclosure' && r.isActive).sort(bySort);
    if (dimensions.length === 0) {
      // Never run a review with no dimensions — in-memory fallback only.
      logger.warn('qaRubric: zero active dimensions — using built-in defaults');
      dimensions = defaultItems('dimension');
    }
    const rubric: QaRubric = { dimensions, disclosures };
    cache = { rubric, at: Date.now() };
    return rubric;
  } catch (err) {
    logger.error({ err }, 'qaRubric: load failed — using stale/default rubric');
    return (
      cache?.rubric ?? {
        dimensions: defaultItems('dimension'),
        disclosures: defaultItems('disclosure'),
      }
    );
  }
}

/** In-memory default rows materialized as full items (never persisted). */
function defaultItems(kind: 'dimension' | 'disclosure'): QaRubricItem[] {
  return DEFAULT_RUBRIC.filter((r) => r.kind === kind).map((r, i) => ({
    ...r,
    itemId: `DEFAULT-${kind}-${i}`,
    createdAt: '',
  }));
}

/**
 * Derive the immutable structured-output key from a dimension label:
 * camelCase, alphanumeric only, starts with a letter, ≤40 chars.
 * `existingKeys` enforces case-insensitive uniqueness (dim2-style suffix).
 */
export function slugifyDimensionKey(label: string, existingKeys: string[]): string {
  const words = label
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let slug = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
    .slice(0, 40);
  if (!slug || !/^[a-zA-Z]/.test(slug)) slug = `dim${slug}`;
  const taken = new Set(existingKeys.map((k) => k.toLowerCase()));
  if (!taken.has(slug.toLowerCase())) return slug;
  let n = 2;
  while (taken.has(`${slug}${n}`.toLowerCase())) n += 1;
  return `${slug}${n}`;
}

// --- Default rubric (the previously hardcoded prompt content) ---------------

type SeedItem = Omit<QaRubricItem, 'itemId' | 'createdAt'>;

const DEFAULT_RUBRIC: SeedItem[] = [
  {
    kind: 'dimension',
    key: 'compliance',
    label: 'Compliance',
    description:
      'CMS marketing rules. No superlatives ("best plan"), no absolute claims ' +
      '("completely free", "guaranteed"), no pressure tactics, required ' +
      'disclaimers when discussing benefits. Rule-based flags detected during ' +
      'the call are listed under TAGS — verify them and look for anything they missed.',
    weight: 5,
    sortOrder: 1,
    isActive: true,
  },
  {
    kind: 'dimension',
    key: 'discovery',
    label: 'Discovery',
    description:
      "Did the agent learn the prospect's situation — zip/county, current " +
      'coverage, medications, pharmacy, doctors, budget, eligibility?',
    weight: 3,
    sortOrder: 2,
    isActive: true,
  },
  {
    kind: 'dimension',
    key: 'communication',
    label: 'Communication',
    description:
      'Clarity, pacing, listening (see talk-ratio metric), professionalism, ' +
      'plain-language explanations of Medicare concepts.',
    weight: 3,
    sortOrder: 3,
    isActive: true,
  },
  {
    kind: 'dimension',
    key: 'nextSteps',
    label: 'Next steps',
    description:
      'Clear outcome — follow-up scheduled, enrollment step set, expectations established.',
    weight: 3,
    sortOrder: 4,
    isActive: true,
  },
  {
    kind: 'disclosure',
    label: 'Agent identified themselves and the purpose of the call',
    sortOrder: 1,
    isActive: true,
  },
  {
    kind: 'disclosure',
    label: 'No superlative or absolute claims about plans',
    sortOrder: 2,
    isActive: true,
  },
  {
    kind: 'disclosure',
    label: 'Costs/benefits stated accurately with appropriate qualifiers',
    sortOrder: 3,
    isActive: true,
  },
  {
    kind: 'disclosure',
    label: 'Prospect consent/willingness to continue was respected',
    sortOrder: 4,
    isActive: true,
  },
  {
    kind: 'disclosure',
    label: 'Clear next step or close was established',
    sortOrder: 5,
    isActive: true,
  },
];

async function seedDefaultRubric(): Promise<void> {
  try {
    for (const item of DEFAULT_RUBRIC) {
      await repos.qaRubricItem.create(item);
    }
    logger.info({ count: DEFAULT_RUBRIC.length }, 'qaRubric: seeded default rubric');
  } catch (err) {
    logger.error({ err }, 'qaRubric: default seed failed');
  }
}
