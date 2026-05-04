/**
 * Phase 4 — Plan Explainer agent.
 *
 * Two modes:
 *   - 'agent'  : technical, markdown-structured summary (~400-600 words).
 *   - 'member' : plain-English explainer at ~6th-grade reading level
 *                (~150-250 words), no jargon, friendly tone.
 *
 * Pipeline:
 *   1) Fetch the plan record from `medhub-plans` via Qdrant scroll (planId
 *      filter).
 *   2) Pull the top ~20 benefits via the hybrid retriever from
 *      `medhub-benefits` (planId filter).
 *   3) Render a single Claude call with mode-specific system prompt; the LLM
 *      receives plan + benefits as a structured JSON block in the user
 *      message.
 *   4) Audit row flushed via `AuditCallbackHandler.flush('explain', ...)`.
 *
 * Carrier names in the Qdrant corpus are already sanitized as "Carrier 1"…
 * "Carrier 7"; we instruct Claude to use the labels as-is.
 */
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
import type { AIExplanation } from '../types.js';

const AGENT_SYSTEM_PROMPT = [
  'You are a Medicare expert assistant supporting a licensed sales agent.',
  'Produce a structured, technical summary of the plan you are given.',
  'Use Markdown. Required top-level sections, in this order:',
  '  ## Overview',
  '  ## Key Benefits',
  '  ## Premium & Cost Sharing',
  '  ## Network',
  '  ## Star Rating',
  '  ## Trade-offs',
  'Aim for 400-600 words total. Be precise; cite numbers from the structured',
  'data when available. Carrier labels in the input are anonymized as',
  '"Carrier 1"…"Carrier 7" — preserve them exactly. Do NOT invent benefits',
  'that are not present in the input.',
].join('\n');

const MEMBER_SYSTEM_PROMPT = [
  'You are explaining a Medicare plan to the beneficiary themselves.',
  'Aim for a 6th-grade reading level: simple words, short sentences (≤15',
  'words), no insurance jargon. Friendly and reassuring tone.',
  'Cover, in this order:',
  '  - What this plan is.',
  '  - The top 5 things it covers.',
  '  - What it costs (premium and any obvious cost sharing).',
  '  - Who it is for.',
  'Aim for 150-250 words total. Carrier labels are already anonymized as',
  '"Carrier 1"…"Carrier 7" — use them exactly as given. Do NOT invent',
  'benefits not present in the structured data.',
].join('\n');

export interface RunExplainInput {
  planId: string;
  mode: 'agent' | 'member';
  userId?: string;
}

export interface RunExplainResult {
  result: AIExplanation;
  interactionId?: string;
}

/** Concatenate string content from a Claude message (handles array form). */
function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
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

async function fetchBenefits(planId: string): Promise<BenefitPayload[]> {
  const hits = await hybridSearch({
    collection: 'benefits',
    query: 'core covered benefits',
    topK: 20,
    filter: { planId },
  });
  return hits.map((h) => h.payload);
}

export async function runExplainAgent(input: RunExplainInput): Promise<RunExplainResult> {
  const auditCb = new AuditCallbackHandler();
  const llm = getChatModel({ premium: input.mode === 'member' ? false : true });

  let agentError: string | undefined;
  let markdown = '';
  let modelId = '';

  try {
    const plan = await fetchPlan(input.planId);
    if (!plan) {
      throw new Error(`Plan not found: ${input.planId}`);
    }
    const benefits = await fetchBenefits(input.planId);

    const compactPlan = {
      planId: plan.planId,
      planName: plan.planName,
      carrier: plan.carrier ?? null,
      planType: plan.planType ?? null,
      productType: plan.productType ?? null,
      category: plan.category ?? null,
      market: plan.market ?? null,
      region: plan.region ?? null,
      premium: typeof plan.premium === 'number' ? plan.premium : null,
      annualOopMax: typeof plan.annualOopMax === 'number' ? plan.annualOopMax : null,
      drugDeductible: typeof plan.drugDeductible === 'number' ? plan.drugDeductible : null,
      states: plan.states ?? [],
      snpType: plan.snpType ?? null,
    };

    const compactBenefits = benefits
      .slice(0, 20)
      .map((b) => ({
        category: b.category,
        categoryGroup: b.categoryGroup ?? null,
        categoryData: b.categoryData ?? null,
        isAvailable: b.isAvailable ?? null,
      }));

    const userPrompt = [
      `Plan record:\n${JSON.stringify(compactPlan, null, 2)}`,
      '',
      `Top benefits (up to 20, ranked by relevance):\n${JSON.stringify(compactBenefits, null, 2)}`,
      '',
      input.mode === 'agent'
        ? 'Write the technical Markdown summary now.'
        : 'Write the plain-English explanation now.',
    ].join('\n');

    const systemPrompt = input.mode === 'agent' ? AGENT_SYSTEM_PROMPT : MEMBER_SYSTEM_PROMPT;

    const res = await llm.invoke(
      [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)],
      { callbacks: [auditCb] },
    );

    markdown = stringifyContent(res.content);
    modelId = auditCb.snapshot().model || '';
  } catch (err) {
    agentError = err instanceof Error ? err.message : String(err);
    logger.error({ err, planId: input.planId, mode: input.mode }, 'explainAgent failed');
  }

  if (!markdown || agentError) {
    const interactionId = await auditCb.flush({
      kind: 'explain',
      ...(input.userId ? { userId: input.userId } : {}),
      input: { planId: input.planId, mode: input.mode },
      output: { markdown },
      error: agentError ?? 'Empty markdown returned',
    });
    void interactionId;
    throw new Error(agentError ?? 'Explain agent returned an empty response.');
  }

  const result: AIExplanation = {
    planId: input.planId,
    mode: input.mode,
    markdown,
    generatedAt: new Date().toISOString(),
    generatedBy: modelId || '(unknown)',
  };

  const interactionId = await auditCb.flush({
    kind: 'explain',
    ...(input.userId ? { userId: input.userId } : {}),
    input: { planId: input.planId, mode: input.mode },
    output: result,
  });

  return {
    result,
    ...(interactionId ? { interactionId } : {}),
  };
}
