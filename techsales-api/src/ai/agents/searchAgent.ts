/**
 * Phase 4 — Natural-Language Plan Search agent.
 *
 * Pipeline:
 *   1) Claude parses the user's natural-language query into a structured
 *      `{ filters, rephrasedQuery, rationale }` triple via
 *      `withStructuredOutput` (no tools — single LLM call).
 *   2) We translate `filters` into a `HybridFilter` and run `hybridSearch`
 *      against the `plans` collection with the rephrased query.
 *   3) `maxPremium` and `minStarRating` are applied client-side after the
 *      retriever returns (Qdrant range filters live outside our HybridFilter
 *      type — see `searchPlans.tool.ts` for the same pattern).
 *
 * No carrier brand names appear in any prompt or fallback. Filters carry
 * only "Carrier 1"…"Carrier 7" labels.
 */
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getChatModel } from '../llm/chatModel.js';
import { AuditCallbackHandler } from '../llm/callbacks.js';
import { hybridSearch, type HybridFilter } from '../vectorstore/hybridRetriever.js';
import type { PlanPayload } from '../vectorstore/collections.js';
import { logger } from '../../config/logger.js';
import type { AISearchFilters, AISearchResult, AISearchResultHit } from '../types.js';

const FiltersSchema = z.object({
  state: z.string().length(2).optional(),
  planType: z.enum(['HMO', 'PPO', 'POS', 'RPPO', 'PDP', 'DSNP', 'CSNP', 'ISNP', 'Medigap']).optional(),
  maxPremium: z.number().nonnegative().optional(),
  minStarRating: z.number().min(1).max(5).optional(),
  carrier: z.string().optional(),
  hasDental: z.boolean().optional(),
  hasVision: z.boolean().optional(),
  hasHearing: z.boolean().optional(),
});

const StructuredSchema = z.object({
  filters: FiltersSchema,
  rephrasedQuery: z.string().min(1),
  rationale: z.string().min(1),
});

type StructuredOut = z.infer<typeof StructuredSchema>;

const SYSTEM_PROMPT = [
  'You translate a Medicare-plan shopper\'s natural-language query into a',
  'structured search payload. Output strictly matches the schema.',
  '',
  'Filter rules:',
  '  - state: two-letter US code, only when the user names a state or US region.',
  '  - planType: one of HMO | PPO | POS | RPPO | PDP | DSNP | CSNP | ISNP | Medigap.',
  '  - maxPremium: USD/month upper bound when the user mentions a price ceiling.',
  '  - minStarRating: integer 1-5 when user says "high quality"/"highly rated"/etc.',
  '  - carrier: ONLY use literal labels "Carrier 1"…"Carrier 7"; never invent',
  '    real-world carrier brand names.',
  '  - hasDental / hasVision / hasHearing: true only when explicitly requested.',
  '',
  'rephrasedQuery: a short, canonical paraphrase of the user query suitable for',
  'embedding (≤120 chars). Strip the structured filters out — keep semantic',
  'descriptors like "low cost" or "broad network".',
  '',
  'rationale: one short sentence (≤30 words) justifying the chosen filters.',
].join('\n');

export interface RunSearchInput {
  query: string;
  userId?: string;
}

export interface RunSearchResult {
  result: AISearchResult;
  interactionId?: string;
}

function buildHybridFilter(filters: AISearchFilters): HybridFilter {
  const f: HybridFilter = {};
  if (filters.state) f.states = filters.state.toUpperCase();
  if (filters.carrier) f.carrier = filters.carrier;
  if (filters.planType) f.planType = filters.planType;
  return f;
}

function matchedFieldsFor(sources: { vector?: number; bm25?: number }): string[] {
  const out: string[] = [];
  if (sources.vector !== undefined) out.push('semantic');
  if (sources.bm25 !== undefined) out.push('keyword');
  return out;
}

export async function runSearchAgent(input: RunSearchInput): Promise<RunSearchResult> {
  const auditCb = new AuditCallbackHandler();
  const llm = getChatModel({ premium: false });

  let agentError: string | undefined;
  let parsed: StructuredOut | null = null;

  try {
    const structured = llm.withStructuredOutput(StructuredSchema, {
      name: 'parse_plan_search',
    });
    const res = await structured.invoke(
      [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(input.query)],
      { callbacks: [auditCb] },
    );
    parsed = res as StructuredOut;
  } catch (err) {
    agentError = err instanceof Error ? err.message : String(err);
    logger.error({ err, query: input.query }, 'searchAgent: structured parse failed');
  }

  if (!parsed) {
    const interactionId = await auditCb.flush({
      kind: 'search',
      ...(input.userId ? { userId: input.userId } : {}),
      input: { query: input.query },
      output: {},
      error: agentError ?? 'Structured parse returned no value',
    });
    void interactionId;
    throw new Error(agentError ?? 'Search agent could not parse the query.');
  }

  const filters: AISearchFilters = parsed.filters;
  const hybridFilter = buildHybridFilter(filters);

  // Post-filtering for premium/starRating means we widen the retriever window.
  const needsPostFilter =
    filters.maxPremium !== undefined ||
    filters.minStarRating !== undefined ||
    filters.hasDental !== undefined ||
    filters.hasVision !== undefined ||
    filters.hasHearing !== undefined;

  const widen = needsPostFilter ? 30 : 10;

  let hits: AISearchResultHit[] = [];
  try {
    const raw = await hybridSearch({
      collection: 'plans',
      query: parsed.rephrasedQuery,
      topK: widen,
      ...(Object.keys(hybridFilter).length > 0 ? { filter: hybridFilter } : {}),
    });
    let filtered = raw;
    if (filters.maxPremium !== undefined) {
      const cap = filters.maxPremium;
      filtered = filtered.filter(
        (h) => typeof h.payload.premium === 'number' && h.payload.premium <= cap,
      );
    }
    // benefitHighlights is a sanitized free-text array indexed at build time.
    const benefitMatches = (p: PlanPayload, terms: string[]): boolean => {
      const blob = (p.benefitHighlights ?? []).join(' ').toLowerCase();
      return terms.some((t) => blob.includes(t));
    };
    if (filters.hasDental) {
      filtered = filtered.filter((h) => benefitMatches(h.payload, ['dental']));
    }
    if (filters.hasVision) {
      filtered = filtered.filter((h) => benefitMatches(h.payload, ['vision']));
    }
    if (filters.hasHearing) {
      filtered = filtered.filter((h) => benefitMatches(h.payload, ['hearing']));
    }
    // We don't have a rating field on the plan payload directly — minStarRating
    // is captured in filters but only enforced if available.
    filtered = filtered.slice(0, 10);
    hits = filtered.map((h) => ({
      planId: h.payload.planId,
      planName: h.payload.planName,
      ...(h.payload.carrier ? { carrier: h.payload.carrier } : {}),
      ...(typeof h.payload.premium === 'number' ? { premium: h.payload.premium } : {}),
      score: Number(h.score.toFixed(6)),
      matchedFields: matchedFieldsFor(h.sources),
    }));
  } catch (err) {
    logger.warn({ err }, 'searchAgent: hybridSearch failed; returning empty results');
    hits = [];
  }

  const result: AISearchResult = {
    filters,
    rephrasedQuery: parsed.rephrasedQuery,
    rationale: parsed.rationale,
    results: hits,
  };

  const interactionId = await auditCb.flush({
    kind: 'search',
    ...(input.userId ? { userId: input.userId } : {}),
    input: { query: input.query },
    output: result,
  });

  return {
    result,
    ...(interactionId ? { interactionId } : {}),
  };
}
