/**
 * Phase 3 — Lead-triggered Plan Recommendation agent.
 *
 * Pipeline:
 *   1) Caller passes `{ leadId, userId? }` → we build a one-shot user message.
 *   2) The ReAct agent calls `get_lead_details`, `search_plans`,
 *      `check_drug_coverage`, `calc_savings`, optionally `compare_plans`,
 *      and produces a final assistant message with a JSON block.
 *   3) We parse the JSON, validate against `RecommendationSchema`. If the
 *      first parse fails we ask Claude to reformat once. On second failure
 *      we throw — the controller maps the error to a 500.
 *   4) Audit row flushed via `AuditCallbackHandler.flush('recommend', ...)`.
 *
 * Carrier names in any prompts / fallbacks MUST stay sanitized
 * ("Carrier 1"…"Carrier 7"); the indexed corpus is already sanitized so the
 * LLM will receive correct labels through the tools.
 */
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { getChatModel } from '../llm/chatModel.js';
import { AuditCallbackHandler } from '../llm/callbacks.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  searchPlansTool,
  getLeadDetailsTool,
  checkDrugCoverageTool,
  calcSavingsTool,
  comparePlansTool,
} from '../tools/index.js';
import type { AIRecommendation } from '../types.js';

export const RecommendationSchema = z.object({
  recommendations: z
    .array(
      z.object({
        planId: z.string(),
        planName: z.string(),
        carrier: z.string(),
        matchScore: z.number().min(0).max(100),
        monthlyPremium: z.number().nonnegative(),
        estimatedAnnualCost: z.number().nonnegative(),
        drugCoveragePercent: z.number().min(0).max(100),
        rationale: z.string(),
        keyHighlights: z.array(z.string()).max(5),
      }),
    )
    .min(1)
    .max(10),
  generatedAt: z.string(),
});

export type RecommendationParsed = z.infer<typeof RecommendationSchema>;

const SYSTEM_PROMPT = [
  'You are a Medicare plan recommendation specialist for licensed sales agents.',
  'The user will give you a leadId. Your job:',
  '  1) Call get_lead_details to fetch the lead profile (state, county, Medicaid id, tagged drugs).',
  '  2) Call search_plans to find plans matching their state, age, and any obvious needs',
  '     (DSNP if Medicaid eligible, MAPD/PDP otherwise; consider tagged-drug coverage).',
  '  3) Call check_drug_coverage on the top candidate plans against the lead\'s tagged drugs.',
  '  4) Call calc_savings on the top candidates to attach commission + annual cost figures.',
  '  5) Optionally call compare_plans for the final shortlist.',
  '  6) Return the top 5 plans ranked by overall fit.',
  '',
  'Be concise. Carrier labels in your output must be of the form "Carrier 1" through',
  '"Carrier 7" — do not invent real carrier brand names.',
  '',
  'End your final assistant message with a single JSON block on its own and nothing after it,',
  'matching this exact shape:',
  '{"recommendations":[{"planId":"...","planName":"...","carrier":"Carrier N",',
  '"matchScore":0-100,"monthlyPremium":0,"estimatedAnnualCost":0,"drugCoveragePercent":0-100,',
  '"rationale":"...","keyHighlights":["...", "..."]}],"generatedAt":"<ISO timestamp>"}',
].join('\n');

export interface RunRecommendInput {
  leadId: string;
  userId?: string;
}

export interface RunRecommendResult {
  result: AIRecommendation;
  interactionId?: string;
}

/**
 * Best-effort extraction of the trailing JSON block from an assistant
 * message. We scan from the last `}` backwards for the matching `{` so the
 * agent can still write prose before the JSON.
 */
function extractJsonBlock(text: string): string | null {
  const lastClose = text.lastIndexOf('}');
  if (lastClose === -1) return null;
  let depth = 0;
  for (let i = lastClose; i >= 0; i--) {
    const ch = text[i];
    if (ch === '}') depth++;
    else if (ch === '{') {
      depth--;
      if (depth === 0) {
        return text.slice(i, lastClose + 1);
      }
    }
  }
  return null;
}

const stringifyContent = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  return '';
};

function parseRecommendation(rawText: string): RecommendationParsed | null {
  const block = extractJsonBlock(rawText);
  if (!block) return null;
  let data: unknown;
  try {
    data = JSON.parse(block);
  } catch {
    return null;
  }
  const result = RecommendationSchema.safeParse(data);
  return result.success ? result.data : null;
}

export async function runRecommendAgent(
  input: RunRecommendInput,
): Promise<RunRecommendResult> {
  const auditCb = new AuditCallbackHandler();
  const llm = getChatModel({ premium: false });
  const agent = createReactAgent({
    llm,
    tools: [
      getLeadDetailsTool,
      searchPlansTool,
      checkDrugCoverageTool,
      calcSavingsTool,
      comparePlansTool,
    ],
  });

  const userPrompt = `Recommend Medicare plans for lead ${input.leadId}.`;
  const initialMessages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  let agentError: string | undefined;
  let parsed: RecommendationParsed | null = null;
  let lastText = '';

  try {
    const state = await agent.invoke(
      { messages: initialMessages },
      {
        callbacks: [auditCb],
        recursionLimit: env.AI_MAX_TOOL_STEPS * 2,
        configurable: {
          ...(input.userId ? { userId: input.userId } : {}),
        },
      },
    );

    const messages = (state as { messages: Array<{ content: unknown }> }).messages ?? [];
    const last = messages[messages.length - 1];
    lastText = stringifyContent(last?.content);
    parsed = parseRecommendation(lastText);

    // One retry: ask Claude to reformat as a single JSON block.
    if (!parsed) {
      logger.warn(
        { leadId: input.leadId, snippet: lastText.slice(0, 200) },
        'recommendAgent: first JSON parse failed, retrying with reformat instruction',
      );
      const retryState = await agent.invoke(
        {
          messages: [
            ...initialMessages,
            { role: 'assistant' as const, content: lastText },
            new HumanMessage(
              'Reformat that as a single valid JSON block matching the schema, no prose.',
            ),
          ],
        },
        {
          callbacks: [auditCb],
          recursionLimit: env.AI_MAX_TOOL_STEPS * 2,
          configurable: {
            ...(input.userId ? { userId: input.userId } : {}),
          },
        },
      );
      const retryMessages = (retryState as { messages: Array<{ content: unknown }> }).messages ?? [];
      const retryLast = retryMessages[retryMessages.length - 1];
      lastText = stringifyContent(retryLast?.content);
      parsed = parseRecommendation(lastText);
    }
  } catch (err) {
    agentError = err instanceof Error ? err.message : String(err);
    logger.error({ err, leadId: input.leadId }, 'recommendAgent failed');
  }

  if (!parsed) {
    const interactionId = await auditCb.flush({
      kind: 'recommend',
      ...(input.userId ? { userId: input.userId } : {}),
      input: { leadId: input.leadId },
      output: { rawText: lastText },
      error: agentError ?? 'failed to parse recommendation JSON',
    });
    void interactionId;
    throw new Error(
      agentError ?? 'Recommend agent did not return a valid JSON recommendation block.',
    );
  }

  const interactionId = await auditCb.flush({
    kind: 'recommend',
    ...(input.userId ? { userId: input.userId } : {}),
    input: { leadId: input.leadId },
    output: parsed,
  });

  return {
    result: parsed,
    ...(interactionId ? { interactionId } : {}),
  };
}
