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
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { hybridSearch, type HybridFilter } from '../vectorstore/hybridRetriever.js';
import type { PlanPayload } from '../vectorstore/collections.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';

interface ZipArea {
  stateAbbr: string;
  county: string;
  state: string;
  city: string;
}

/** zip → area, loaded once (same module-cache pattern as findPharmaciesNear). */
let zipIndex: Map<string, ZipArea> | null = null;
async function resolveZipArea(zipCode: string): Promise<ZipArea | null> {
  if (!zipIndex) {
    try {
      const raw = await readFile(
        path.join(BOOTSTRAP_PATHS.lookupDir, 'zipStateCounty.json'),
        'utf8',
      );
      const rows = JSON.parse(raw) as Array<
        { zipCode: string; stateAbbr: string; county: string; state: string; city: string }
      >;
      zipIndex = new Map(
        rows.map((r) => [
          r.zipCode,
          { stateAbbr: r.stateAbbr, county: r.county, state: r.state, city: r.city },
        ]),
      );
    } catch {
      zipIndex = new Map();
    }
  }
  return zipIndex.get(zipCode) ?? null;
}

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Natural-language description of what the user wants in a plan.'),
  topK: z.number().int().min(1).max(20).default(5),
  zipCode: z
    .string()
    .regex(/^\d{5}$/)
    .optional()
    .describe(
      "The caller's 5-digit zip code. Preferred over `state` — it narrows to the plans actually sold in their county.",
    ),
  state: z
    .string()
    .length(2)
    .optional()
    .describe('Two-letter US state filter (e.g. "FL", "CA"). Ignored when zipCode is given.'),
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
    // A zip is what callers actually give us; it resolves to the county the
    // plan has to serve. Falls back to the state filter when the zip isn't in
    // the lookup, so an unknown zip degrades instead of returning nothing.
    const area = input.zipCode ? await resolveZipArea(input.zipCode) : null;
    if (area) {
      filter.counties = `${area.stateAbbr}/${area.county}`;
    } else if (input.state) {
      filter.states = input.state.toUpperCase();
    }
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

    // Envelope (rich-chat upgrade): object wrapper so the side-channel
    // extractor and FE cards get a stable `{total, plans}` shape.
    return JSON.stringify({ total: out.length, plans: out });
  },
  {
    name: 'search_plans',
    description:
      'Semantic + keyword search over the Medicare plan catalog. Use when the user is exploring plans by attribute (state, premium, plan type, dental coverage, etc.). Returns top matching plans with carrier, premium, plan type, and a relevance score.',
    schema: inputSchema,
  },
);
