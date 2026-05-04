/**
 * `compare_plans` — fetches 2-4 plan summaries side by side. For each plan we
 * pull the canonical record from Qdrant `medhub-plans` (scroll by `planId`
 * filter) and a top-K=10 set of benefits from `medhub-benefits` via the
 * hybrid retriever (filtered to the plan).
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getQdrantClient } from '../vectorstore/qdrantClient.js';
import { COLLECTIONS, type PlanPayload, type BenefitPayload } from '../vectorstore/collections.js';
import { hybridSearch } from '../vectorstore/hybridRetriever.js';

const inputSchema = z.object({
  planIds: z
    .array(z.string().min(1))
    .min(2)
    .max(4)
    .describe('Two to four plan ids to compare side-by-side.'),
});

type ToolInput = z.infer<typeof inputSchema>;

interface BenefitSummary {
  category: string;
  isAvailable?: boolean;
}

interface PlanSummary {
  planId: string;
  planName?: string;
  carrier?: string;
  premium?: number;
  planType?: string;
  benefits: BenefitSummary[];
}

async function fetchPlan(planId: string): Promise<PlanPayload | null> {
  const client = getQdrantClient();
  const res = await client.scroll(COLLECTIONS.plans.name, {
    limit: 1,
    with_payload: true,
    with_vector: false,
    filter: {
      must: [{ key: 'planId', match: { value: planId } }],
    },
  });
  const pt = res.points[0];
  if (!pt || !pt.payload) return null;
  return pt.payload as PlanPayload;
}

async function fetchBenefits(planId: string): Promise<BenefitSummary[]> {
  // Use a generic broad query — the hybrid retriever will rank by RRF, but we
  // only need surface diversity over benefit categories.
  const hits = await hybridSearch({
    collection: 'benefits',
    query: 'benefits coverage',
    topK: 10,
    filter: { planId },
  });
  return hits.map((h) => {
    const p = h.payload as BenefitPayload;
    return {
      category: p.category,
      ...(p.isAvailable !== undefined ? { isAvailable: p.isAvailable } : {}),
    };
  });
}

export const comparePlansTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      const out: PlanSummary[] = [];
      for (const planId of input.planIds) {
        const plan = await fetchPlan(planId);
        if (!plan) {
          out.push({ planId, benefits: [] });
          continue;
        }
        const benefits = await fetchBenefits(planId);
        out.push({
          planId: plan.planId,
          ...(plan.planName !== undefined ? { planName: plan.planName } : {}),
          ...(plan.carrier !== undefined ? { carrier: plan.carrier } : {}),
          ...(typeof plan.premium === 'number' ? { premium: plan.premium } : {}),
          ...(plan.planType !== undefined ? { planType: plan.planType } : {}),
          benefits,
        });
      }
      return JSON.stringify(out);
    } catch (err) {
      return JSON.stringify({ ok: false, error: String(err) });
    }
  },
  {
    name: 'compare_plans',
    description:
      'Side-by-side comparison of 2-4 plans. Returns each plan\'s name, carrier, ' +
      'monthly premium, plan type, and a top-10 list of benefit categories with ' +
      'availability flags.',
    schema: inputSchema,
  },
);
