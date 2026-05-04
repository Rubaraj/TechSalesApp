/**
 * Phase 5 — Member Chat agent.
 *
 * A conversational ReAct agent that talks directly to a Medicare beneficiary
 * inside the member portal. Unlike the lead-side recommend / explain agents
 * this one streams its output in real time over SSE so the UI can render
 * tokens as they arrive and surface tool calls in a side-trace panel.
 *
 * Available tools (chat-safe subset — `getLeadDetails` is intentionally NOT
 * exposed; the chat is for the member, not for an agent looking at a lead):
 *   - search_plans
 *   - check_drug_coverage
 *   - compare_plans
 *   - calc_savings
 *   - get_member_plan
 *
 * Streaming contract — see `ChatStreamEvent` below. We translate LangGraph's
 * `streamEvents` into a small, frontend-friendly union: token deltas,
 * tool_start / tool_end, a final assistant message, and an error event.
 *
 * Carrier labels in any prompt / fallback string are sanitized as
 * "Carrier 1"…"Carrier 7" — never invent real carrier brand names.
 */
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getChatModel } from '../llm/chatModel.js';
import { AuditCallbackHandler } from '../llm/callbacks.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  searchPlansTool,
  checkDrugCoverageTool,
  comparePlansTool,
  calcSavingsTool,
  getMemberPlanTool,
} from '../tools/index.js';
import type { ChatMessage } from '../types.js';

/**
 * Stream-event union emitted by `streamChatAgent`. Mirror of the frontend
 * `ChatStreamEvent` in `techsales-app/src/types/ai.ts`.
 */
export type ChatStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: unknown; latencyMs: number }
  | { type: 'final'; content: string; interactionId: string }
  | { type: 'error'; error: string };

export interface StreamChatAgentInput {
  memberId: string;
  planId: string;
  history: ChatMessage[];
  userMessage: string;
  userId?: string;
}

const buildSystemPrompt = (memberId: string, planId: string): string =>
  [
    'You are a friendly Medicare plan assistant chatting with a beneficiary.',
    `The member's id is ${memberId}. They are currently enrolled in plan ${planId}.`,
    'Use simple, plain English (6th-grade level). Keep sentences short.',
    'Use tools to look up real data — never make up benefits, premiums, or coverage.',
    'When formulary or drug coverage data is involved, mention that it is based on',
    "simulated pilot data and recommend verifying with the official formulary.",
    'Carrier names are anonymized as "Carrier 1"…"Carrier 7" — use the labels as given.',
    'Never invent real carrier brand names.',
    'Available tools:',
    '  - get_member_plan: fetch the member\'s current plan record.',
    '  - search_plans: search the plan catalogue with simple filters.',
    '  - check_drug_coverage: look up whether a given plan covers a given drug.',
    '  - compare_plans: side-by-side benefits comparison between 2-4 plans.',
    '  - calc_savings: estimate annual cost / savings versus the current plan.',
    'Prefer one or two tool calls when you need facts; otherwise just answer.',
    'End every response with a one-line reminder that the member should verify',
    'plan details against the official Summary of Benefits before making changes.',
  ].join('\n');

/**
 * Concatenate string content from a Claude message-chunk (handles array form).
 * Token deltas often arrive as `{ content: [{ type: 'text', text: '...' }] }`.
 */
function chunkText(content: unknown): string {
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
      .join('');
  }
  return '';
}

/**
 * Convert the persisted history into LangChain message instances. We keep
 * only `user` and `assistant` turns (system is injected by the agent itself)
 * and trim to the last 30 messages to bound prompt cost.
 */
function historyToMessages(
  history: ChatMessage[],
): Array<HumanMessage | AIMessage> {
  const trimmed = history.slice(-30).filter((m) => m.role === 'user' || m.role === 'assistant');
  return trimmed.map((m) =>
    m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
  );
}

interface PendingTool {
  name: string;
  input: unknown;
  startedAt: number;
}

/**
 * Stream the chat agent's events as a frontend-shaped async iterable. The
 * caller (SSE controller) pipes each event straight to the wire.
 *
 * The function:
 *   1. Builds the agent (createReactAgent) with the chat-safe tool subset.
 *   2. Calls `streamEvents` with the assembled message list.
 *   3. Translates LangGraph events into our small union (tokens, tool starts /
 *      ends, errors).
 *   4. After the stream drains, flushes one audit row and yields a `final`
 *      event carrying the full assistant text + interactionId.
 *
 * Aborts cleanly when `signal` fires — we propagate the signal into
 * `streamEvents` so LangGraph can cancel any in-flight LLM call.
 */
export async function* streamChatAgent(
  input: StreamChatAgentInput,
  signal?: AbortSignal,
): AsyncIterable<ChatStreamEvent> {
  const auditCb = new AuditCallbackHandler();

  let llm;
  try {
    llm = getChatModel({ premium: false });
  } catch (err) {
    yield { type: 'error', error: err instanceof Error ? err.message : String(err) };
    return;
  }

  const agent = createReactAgent({
    llm,
    tools: [
      getMemberPlanTool,
      searchPlansTool,
      checkDrugCoverageTool,
      comparePlansTool,
      calcSavingsTool,
    ],
  });

  const messages = [
    new SystemMessage(buildSystemPrompt(input.memberId, input.planId)),
    ...historyToMessages(input.history),
    new HumanMessage(input.userMessage),
  ];

  // Tracks tool runs so we can compute latency on tool_end events. Indexed
  // by the runId LangGraph hands us — each tool call gets a unique one.
  const pendingTools = new Map<string, PendingTool>();

  // We accumulate the final assistant text from the tokens we emit so we
  // never have to re-walk the agent state at the end.
  let finalText = '';
  let agentError: string | undefined;

  try {
    const eventStream = agent.streamEvents(
      { messages },
      {
        version: 'v2' as const,
        callbacks: [auditCb],
        recursionLimit: env.AI_MAX_TOOL_STEPS * 2,
        ...(signal ? { signal } : {}),
        configurable: {
          ...(input.userId ? { userId: input.userId } : {}),
        },
      },
    );

    for await (const event of eventStream) {
      if (signal?.aborted) break;
      const ev = event.event;
      const data = event.data ?? {};

      // Chat-model token deltas — the only LLM events we forward to the FE.
      if (ev === 'on_chat_model_stream') {
        const chunk = (data as { chunk?: { content?: unknown } }).chunk;
        const piece = chunkText(chunk?.content);
        if (piece) {
          finalText += piece;
          yield { type: 'token', content: piece };
        }
        continue;
      }

      // Tool invocation lifecycle. LangGraph fires on_tool_start / _end for
      // every DynamicStructuredTool call our ReAct agent makes.
      if (ev === 'on_tool_start') {
        const name = event.name || 'tool';
        pendingTools.set(event.run_id, {
          name,
          input: (data as { input?: unknown }).input,
          startedAt: Date.now(),
        });
        yield { type: 'tool_start', tool: name, input: (data as { input?: unknown }).input };
        continue;
      }

      if (ev === 'on_tool_end') {
        const pending = pendingTools.get(event.run_id);
        const name = event.name || pending?.name || 'tool';
        const startedAt = pending?.startedAt ?? Date.now();
        pendingTools.delete(event.run_id);
        let output: unknown = (data as { output?: unknown }).output;
        // DynamicStructuredTool tools return JSON-encoded strings — try to
        // parse so the FE gets structured data, fall back to the raw string.
        if (typeof output === 'string') {
          try {
            output = JSON.parse(output);
          } catch {
            // leave as string
          }
        }
        yield {
          type: 'tool_end',
          tool: name,
          output,
          latencyMs: Date.now() - startedAt,
        };
        continue;
      }

      if (ev === 'on_tool_error') {
        const pending = pendingTools.get(event.run_id);
        const name = event.name || pending?.name || 'tool';
        const startedAt = pending?.startedAt ?? Date.now();
        pendingTools.delete(event.run_id);
        const err = (data as { error?: unknown }).error;
        const errMsg = err instanceof Error ? err.message : String(err ?? 'tool error');
        yield {
          type: 'tool_end',
          tool: name,
          output: { error: errMsg },
          latencyMs: Date.now() - startedAt,
        };
        continue;
      }
    }
  } catch (err) {
    if (signal?.aborted) {
      // Caller-initiated abort; treat as a clean shutdown.
      logger.debug({ memberId: input.memberId }, 'chatAgent stream aborted by client');
    } else {
      agentError = err instanceof Error ? err.message : String(err);
      logger.error({ err, memberId: input.memberId }, 'chatAgent stream failed');
      yield { type: 'error', error: agentError };
    }
  }

  // Flush a single audit row regardless of outcome.
  const interactionId = await auditCb.flush({
    kind: 'chat',
    ...(input.userId ? { userId: input.userId } : {}),
    memberId: input.memberId,
    input: {
      memberId: input.memberId,
      planId: input.planId,
      userMessage: input.userMessage,
      historyLength: input.history.length,
    },
    output: { content: finalText },
    error: agentError,
  });

  if (!agentError && !signal?.aborted) {
    yield {
      type: 'final',
      content: finalText,
      interactionId: interactionId ?? '',
    };
  }
}
