/**
 * Phase 4 — Multi-plan Comparison agent.
 *
 * Pipeline:
 *   1) For each planId (2-4), fetch the canonical plan payload from
 *      `medhub-plans` and a top-10 ranked benefit set from `medhub-benefits`
 *      (mirrors the logic embedded in `comparePlans.tool`, but called
 *      directly here so we have a typed object instead of stringified JSON).
 *   2) Pass the structured comparison payload to Claude (no tools) and ask
 *      for a 200-300 word narrative diff.
 *   3) Audit row flushed via `AuditCallbackHandler.flush('compare', ...)`.
 *
 * Carrier names are pre-anonymized in the corpus; we instruct Claude to keep
 * the labels exactly as-is.
 */
import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getChatModel } from '../llm/chatModel.js';
import { AuditCallbackHandler } from '../llm/callbacks.js';
import { getQdrantClient } from '../vectorstore/qdrantClient.js';
import { hybridSearch } from '../vectorstore/hybridRetriever.js';
import {
  COLLECTIONS,
  type PlanPayload,
  type BenefitPayload,
} from '../vectorstore/collections.js';
import { logger } from '../../config/logger.js';
import type { AIComparison, AIComparisonPlan } from '../types.js';

const InputSchema = z.object({
  planIds: z.array(z.string().min(1)).min(2).max(4),
  userId: z.string().min(1).optional(),
});

export type RunCompareInput = z.infer<typeof InputSchema>;

export interface RunCompareResult {
  result: AIComparison;
  interactionId?: string;
}

const SYSTEM_PROMPT = [
  'You compare 2-4 Medicare plans side-by-side for a licensed sales agent.',
  'You will receive a JSON block with each plan\'s headline fields (name,',
  'carrier, premium, planType) and a top-10 benefit category list.',
  '',
  'Write a 200-300 word narrative diff. Use plain prose (no Markdown headers',
  'required). Highlight where one plan wins on price vs another, where',
  'benefit coverage diverges, and any obvious trade-offs (e.g. lower premium',
  'vs richer dental). Cite numbers from the input when relevant.',
  '',
  'Carrier labels are anonymized as "Carrier 1"…"Carrier 7"; preserve them',
  'exactly. Never invent benefits not present in the input.',
].join('\n');

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (
          part &&
          typeof part === 'object' &&
          'text' in part &&
          typeof (part as { text: unknown }).text === 'string'
        ) {
          return (part as { text: string }).text;
        }
        return '';
      })
      .filter(Boolean)
      .join('')
      .trim();
  }
  return '';
}

async function fetchPlan(planId: string): Promise<PlanPayload | null> {
  const client = getQdrantClient();
  const res = await client.scroll(COLLECTIONS.plans.name, {
    limit: 1,
    with_payload: true,
    with_vector: false,
    filter: { must: [{ key: 'planId', match: { value: planId } }] },
  });
  const pt = res.points[0];
  if (!pt || !pt.payload) return null;
  return pt.payload as PlanPayload;
}

async function fetchTopBenefits(
  planId: string,
): Promise<Array<{ category: string; isAvailable?: boolean }>> {
  try {
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
  } catch (err) {
    logger.warn({ err, planId }, 'compareAgent: benefit fetch failed; using empty list');
    return [];
  }
}

export async function runCompareAgent(input: RunCompareInput): Promise<RunCompareResult> {
  const validated = InputSchema.parse(input);
  const auditCb = new AuditCallbackHandler();
  const llm = getChatModel({ premium: false });

  let agentError: string | undefined;
  let narrative = '';

  // Build the structured comparison first; fail fast if no plans resolve.
  const plans: AIComparisonPlan[] = [];
  for (const planId of validated.planIds) {
    const plan = await fetchPlan(planId);
    if (!plan) {
      plans.push({ planId, benefits: [] });
      continue;
    }
    const benefits = await fetchTopBenefits(planId);
    plans.push({
      planId: plan.planId,
      ...(plan.planName !== undefined ? { planName: plan.planName } : {}),
      ...(plan.carrier !== undefined ? { carrier: plan.carrier } : {}),
      ...(typeof plan.premium === 'number' ? { premium: plan.premium } : {}),
      ...(plan.planType !== undefined ? { planType: plan.planType } : {}),
      benefits,
    });
  }

  // Need at least 2 plans with data to write a meaningful diff. We still try.
  try {
    const userPrompt = `Compare these plans:\n${JSON.stringify({ plans }, null, 2)}`;
    const res = await llm.invoke(
      [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(userPrompt)],
      { callbacks: [auditCb] },
    );
    narrative = stringifyContent(res.content);
  } catch (err) {
    agentError = err instanceof Error ? err.message : String(err);
    logger.error({ err, planIds: validated.planIds }, 'compareAgent failed');
  }

  if (!narrative) {
    const interactionId = await auditCb.flush({
      kind: 'compare',
      ...(input.userId ? { userId: input.userId } : {}),
      input: { planIds: validated.planIds },
      output: { plans },
      error: agentError ?? 'Empty narrative returned',
    });
    void interactionId;
    throw new Error(agentError ?? 'Compare agent returned an empty narrative.');
  }

  const result: AIComparison = {
    planIds: validated.planIds,
    comparison: { plans },
    narrative,
    generatedAt: new Date().toISOString(),
  };

  const interactionId = await auditCb.flush({
    kind: 'compare',
    ...(input.userId ? { userId: input.userId } : {}),
    input: { planIds: validated.planIds },
    output: result,
  });

  return {
    result,
    ...(interactionId ? { interactionId } : {}),
  };
}
