/**
 * `search_plans` — first real LangChain tool. Wraps the hybrid retriever for
 * the `plans` collection with a structured zod schema so an LLM (or a
 * test harness) can invoke it with typed arguments.
 *
 * Returns a JSON-stringified array of `{ planId, planName, carrier, premium,
 * planType, score, rationale }`. The string return shape is intentional —
 * LangChain ReAct agents pass tool outputs back as text, and a stable
 * machine-readable JSON envelope makes it easy for Claude to summarize.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { hybridSearch, type HybridFilter } from '../vectorstore/hybridRetriever.js';
import type { PlanPayload } from '../vectorstore/collections.js';

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Natural-language description of what the user wants in a plan.'),
  topK: z.number().int().min(1).max(20).default(5),
  state: z
    .string()
    .length(2)
    .optional()
    .describe('Two-letter US state filter (e.g. "FL", "CA").'),
  carrier: z
    .string()
    .optional()
    .describe('Exact carrier label, e.g. "Carrier 1".'),
  planType: z
    .string()
    .optional()
    .describe('One of HMO | PPO | POS | RPPO | PDP | DSNP | CSNP | ISNP | Medigap.'),
  maxPremium: z
    .number()
    .nonnegative()
    .optional()
    .describe('Hard upper bound on monthly premium (USD).'),
});

type ToolInput = z.infer<typeof inputSchema>;

interface ToolHit {
  planId: string;
  planName: string;
  carrier?: string;
  planType?: string;
  premium?: number;
  states?: string[];
  score: number;
  rationale: string;
}

function buildRationale(payload: PlanPayload, sources: { vector?: number; bm25?: number }): string {
  const parts: string[] = [];
  if (payload.planType) parts.push(`${payload.planType}`);
  if (payload.carrier) parts.push(`${payload.carrier}`);
  if (typeof payload.premium === 'number') parts.push(`$${payload.premium}/mo`);
  if (sources.vector !== undefined && sources.bm25 !== undefined) {
    parts.push('matched both semantic + keyword');
  } else if (sources.vector !== undefined) {
    parts.push('semantic match');
  } else if (sources.bm25 !== undefined) {
    parts.push('keyword match');
  }
  return parts.join(' · ');
}

export const searchPlansTool = tool(
  async (input: ToolInput): Promise<string> => {
    const filter: HybridFilter = {};
    if (input.state) filter.states = input.state.toUpperCase();
    if (input.carrier) filter.carrier = input.carrier;
    if (input.planType) filter.planType = input.planType;

    // Pull a wider window when we need to post-filter on premium (Qdrant
    // can't apply numeric range constraints from a HybridFilter without
    // extending the type — we apply it client-side).
    const widen = input.maxPremium !== undefined ? Math.max(input.topK * 3, 15) : input.topK;
    const hits = await hybridSearch({
      collection: 'plans',
      query: input.query,
      topK: widen,
      ...(Object.keys(filter).length > 0 ? { filter } : {}),
    });

    let filtered = hits;
    if (input.maxPremium !== undefined) {
      filtered = hits.filter(
        (h) =>
          typeof h.payload.premium === 'number' && h.payload.premium <= (input.maxPremium ?? Infinity),
      );
    }
    filtered = filtered.slice(0, input.topK);

    const out: ToolHit[] = filtered.map((h) => {
      const p = h.payload;
      return {
        planId: p.planId,
        planName: p.planName,
        ...(p.carrier !== undefined ? { carrier: p.carrier } : {}),
        ...(p.planType !== undefined ? { planType: p.planType } : {}),
        ...(typeof p.premium === 'number' ? { premium: p.premium } : {}),
        ...(p.states && p.states.length > 0 ? { states: p.states } : {}),
        score: Number(h.score.toFixed(6)),
        rationale: buildRationale(p, h.sources),
      };
    });

    return JSON.stringify(out);
  },
  {
    name: 'search_plans',
    description:
      'Semantic + keyword search over the Medicare plan catalog. Use when the user is exploring plans by attribute (state, premium, plan type, dental coverage, etc.). Returns top matching plans with carrier, premium, plan type, and a relevance score.',
    schema: inputSchema,
  },
);
