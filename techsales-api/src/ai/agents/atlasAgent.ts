/**
 * Phase 4 (M3) — Atlas: the agentic copilot for sales agents.
 *
 * Forked from chatAgent.ts; the differences are:
 *   - Tools = `atlasTools` (vertical-slice 6 — getMyPipeline, searchLeads,
 *     getLeadDetails, searchPlans, draftFollowUpEmail, navigateTo).
 *   - System prompt = `buildAtlasSystemPrompt` returning a CACHED prefix
 *     (Anthropic ephemeral prompt-caching) + a per-turn dynamic block.
 *   - Translates a few tool result shapes into their own SSE event types:
 *       proposalId → 'proposal_created' (write tools)
 *       navigate   → 'navigate'         (navigateTo)
 *     so the FE can route them without re-parsing tool_end payloads.
 *   - Audit row written with `kind: 'atlas'`, including `userId`.
 */
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { getChatModel } from '../llm/chatModel.js';
import { AuditCallbackHandler } from '../llm/callbacks.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  atlasTools,
  getMyPipelineTool,
  searchLeadsTool,
  getLeadDetailsTool,
  searchPlansTool,
  draftFollowUpEmailTool,
  navigateToTool,
} from '../tools/index.js';
import {
  buildAtlasSystemPrompt,
  type AtlasPromptInput,
} from '../prompts/atlasSystemPrompt.js';
import type { AtlasChatMessage } from '../../models/aiChatSession.model.js';

/**
 * Stream-event union emitted by `streamAtlasAgent`. Mirror of the frontend
 * `AtlasStreamEvent`.
 */
export type AtlasStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: unknown; latencyMs: number }
  | {
      type: 'proposal_created';
      proposalId: string;
      kind: 'email' | 'status' | 'drug' | 'lead_update' | 'note';
      preview: unknown;
    }
  | { type: 'navigate'; route: string; reason: string }
  /** Rich-chat upgrade — a tool result the FE renders as a purpose-built card. */
  | { type: 'display_card'; card: AtlasCardType; tool: string; data: unknown }
  | { type: 'final'; content: string; interactionId: string }
  | { type: 'error'; error: string };

export type AtlasCardType =
  | 'comparison'
  | 'lead_list'
  | 'pacing'
  | 'eligibility'
  | 'plan_results'
  | 'enrollments'
  | 'appointments'
  | 'savings';

/**
 * Server-side tool→card registry. Deliberately NOT a tag on tool outputs:
 * the extractor already knows the tool name, and keeping outputs untouched
 * means zero extra ReAct-observation tokens.
 */
const CARD_TOOL_MAP: Record<string, AtlasCardType> = {
  search_plans: 'plan_results',
  compare_plans: 'comparison',
  search_leads: 'lead_list',
  get_my_pipeline: 'lead_list',
  get_my_targets: 'pacing',
  check_eligibility: 'eligibility',
  get_enrollments: 'enrollments',
  get_appointments: 'appointments',
  calc_savings: 'savings',
};

export interface StreamAtlasAgentInput {
  userId: string;
  userMessage: string;
  history: AtlasChatMessage[];
  context: AtlasPromptInput;
}

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

function historyToMessages(
  history: AtlasChatMessage[],
): Array<HumanMessage | AIMessage> {
  const trimmed = history
    .slice(-20)
    // Card-only assistant turns persist with content: '' — the Anthropic API
    // rejects empty text blocks, so one such turn in history would 400 every
    // later turn of the session. Filter them out of the model's view.
    .filter(
      (m) =>
        (m.role === 'user' || m.role === 'assistant') &&
        m.content.trim().length > 0,
    );
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
 * Extract structured payloads from a tool's JSON output for dedicated SSE
 * event types. Shared by the real ReAct path AND the stub path (previously
 * two divergent copies). Returns an array — a single tool output can carry
 * a display card alongside future shapes.
 *
 *   - `{ navigate: {route, reason} }`          → 'navigate'
 *   - `{ proposalId, kind, preview }`          → 'proposal_created'
 *   - toolName in CARD_TOOL_MAP + clean object → 'display_card'
 */
function extractSideChannelEvents(
  toolName: string,
  output: unknown,
): AtlasStreamEvent[] {
  if (!output || typeof output !== 'object') return [];
  const obj = output as Record<string, unknown>;
  const events: AtlasStreamEvent[] = [];

  // Navigation
  if (obj.navigate && typeof obj.navigate === 'object') {
    const nav = obj.navigate as { route?: unknown; reason?: unknown };
    if (typeof nav.route === 'string' && typeof nav.reason === 'string') {
      events.push({ type: 'navigate', route: nav.route, reason: nav.reason });
    }
  }

  // Proposal (write tool)
  if (
    typeof obj.proposalId === 'string' &&
    typeof obj.kind === 'string' &&
    (obj.kind === 'email' || obj.kind === 'status' || obj.kind === 'drug' ||
      obj.kind === 'lead_update' || obj.kind === 'note')
  ) {
    events.push({
      type: 'proposal_created',
      proposalId: obj.proposalId,
      kind: obj.kind,
      preview: obj.preview ?? null,
    });
  }

  // Display card — registry lookup; skip error envelopes (every card tool
  // self-catches to `{error}` / `{ok:false, error}`).
  const cardType = CARD_TOOL_MAP[toolName];
  if (cardType && !Array.isArray(obj) && obj.error === undefined) {
    events.push({ type: 'display_card', card: cardType, tool: toolName, data: obj });
  }

  return events;
}

export async function* streamAtlasAgent(
  input: StreamAtlasAgentInput,
  signal?: AbortSignal,
): AsyncIterable<AtlasStreamEvent> {
  // Stub path — used when AI_LLM_PROVIDER=stub. Pattern-matches the user
  // message to pick ONE tool, calls it directly, and streams a canned
  // response. Zero LLM cost. The shape of the SSE event stream is identical
  // to the real ReAct path so the FE doesn't need a separate consumer.
  if (env.AI_LLM_PROVIDER === 'stub') {
    yield* runStubAtlas(input, signal);
    return;
  }

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
    tools: [...atlasTools],
  });

  const prompt = buildAtlasSystemPrompt(input.context);

  // Anthropic allows ONE system message. We send the cached prefix and the
  // per-turn dynamic block as two content parts of a single system message;
  // only the prefix block carries `cache_control: ephemeral`. LangChain's
  // `@langchain/anthropic` forwards block-level cache_control to the API.
  // Hit rate ~95% on a normal session → 90% input-token discount on the
  // cached prefix. The type cast is necessary because LangChain's TS
  // surface for content blocks doesn't expose `cache_control`.
  const systemMessage = new SystemMessage({
    content: [
      {
        type: 'text',
        text: prompt.cachedPrefix,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: prompt.dynamic,
      },
    ] as unknown as string,
  });

  const messages = [
    systemMessage,
    ...historyToMessages(input.history),
    new HumanMessage(input.userMessage),
  ];

  const pendingTools = new Map<string, PendingTool>();
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
          userId: input.userId,
        },
      },
    );

    for await (const event of eventStream) {
      if (signal?.aborted) break;
      const ev = event.event;
      const data = event.data ?? {};

      if (ev === 'on_chat_model_stream') {
        const chunk = (data as { chunk?: { content?: unknown } }).chunk;
        const piece = chunkText(chunk?.content);
        if (piece) {
          finalText += piece;
          yield { type: 'token', content: piece };
        }
        continue;
      }

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
        // LangGraph streamEvents wraps tool results in a ToolMessage whose
        // `content` holds the tool's raw string return. Unwrap it, or the
        // side-channel extraction below never sees `navigate`/`proposalId`
        // and Assist-mode cards silently never render.
        if (
          output &&
          typeof output === 'object' &&
          'content' in output &&
          typeof (output as { content: unknown }).content === 'string'
        ) {
          output = (output as { content: string }).content;
        }
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
        // Side-channel: surface special tool results as their own event types.
        for (const side of extractSideChannelEvents(name, output)) {
          yield side;
        }
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
      logger.debug({ userId: input.userId }, 'atlasAgent stream aborted by client');
    } else {
      agentError = err instanceof Error ? err.message : String(err);
      logger.error({ err, userId: input.userId }, 'atlasAgent stream failed');
      yield { type: 'error', error: agentError };
    }
  }

  const interactionId = await auditCb.flush({
    kind: 'atlas',
    userId: input.userId,
    input: {
      userMessage: input.userMessage,
      historyLength: input.history.length,
      route: input.context.page?.route,
      mode: input.context.mode,
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

// ---------------------------------------------------------------------------
// Stub path — LLM-free demo mode.
// ---------------------------------------------------------------------------

interface StubIntent {
  /** Tool to invoke. Null = no tool, just a canned reply. */
  tool: typeof getMyPipelineTool | null;
  args: Record<string, unknown>;
  /** Pre-streamed assistant text that intros the tool call. */
  intro: string;
  /** Closing line streamed AFTER the tool result. */
  outro: string;
}

/**
 * Naive intent picker for the stub path. Keyword matching only — no LLM.
 * Order matters: the first match wins.
 */
function pickStubIntent(
  userMessage: string,
  context: AtlasPromptInput,
): StubIntent {
  const msg = userMessage.toLowerCase();
  const firstName = context.user.firstName;

  // Email draft → write tool + Approval Card demo
  if (/(draft|write|compose).*(email|follow.?up|message)/i.test(userMessage)) {
    const leadId = context.page?.leadId ?? 'LEAD-001';
    return {
      tool: draftFollowUpEmailTool as unknown as typeof getMyPipelineTool,
      args: { userId: context.user.userId, leadId, tone: 'warm' },
      intro: `Drafting a follow-up email for that lead, ${firstName}…\n\n`,
      outro: `\n\nI've put together a draft above — review it and click **Approve & Send** when you're happy, or reject if it needs more work.`,
    };
  }

  // Navigation → opens a screen
  if (/(open|show me|navigate to|take me to).*(lead|plan|dashboard)/i.test(userMessage)) {
    const leadId = context.page?.leadId;
    const route = leadId ? `/leads/${leadId}` : '/leads';
    return {
      tool: navigateToTool as unknown as typeof getMyPipelineTool,
      args: { route, reason: `Opening ${route}` },
      intro: `Opening ${route} for you…\n\n`,
      outro: '',
    };
  }

  // Plan search
  if (/(find|search|show).*(plan|coverage|medicare advantage)/i.test(userMessage)) {
    const zipMatch = userMessage.match(/\b(\d{5})\b/);
    return {
      tool: searchPlansTool as unknown as typeof getMyPipelineTool,
      // search_plans' schema REQUIRES `query` — the old {zipCode}/{} args
      // failed zod validation, so stub plan search always errored (rich-chat
      // review finding). Pass the user message as the query.
      args: { query: userMessage, topK: 5 },
      intro: `Looking up plans${zipMatch ? ` in ${zipMatch[1]}` : ''}, ${firstName}…\n\n`,
      outro: `\n\nLet me know if you want me to compare benefits or check drug coverage on any of these.`,
    };
  }

  // Lead drill-in
  if (
    /(tell me about|details on|info on|who is|profile of)\s*lead/i.test(userMessage) ||
    /^lead[- ]?\d+/i.test(userMessage)
  ) {
    const idMatch = userMessage.match(/lead[- ]?(\d+)/i);
    const leadId = idMatch ? `LEAD-${idMatch[1].padStart(3, '0')}` : context.page?.leadId ?? 'LEAD-001';
    return {
      tool: getLeadDetailsTool as unknown as typeof getMyPipelineTool,
      args: { leadId },
      intro: `Pulling ${leadId}'s record now…\n\n`,
      outro: `\n\nAnything specific you want to dig into — drug coverage, plan options, or status changes?`,
    };
  }

  // Pipeline / my leads
  if (
    /(my pipeline|my leads|my book|how many leads|my (florida|fl|california|ca|tx|texas) leads)/i.test(
      userMessage,
    ) ||
    /how am i doing/i.test(userMessage)
  ) {
    const stateMatch = userMessage.match(/\bin\s+([A-Z][a-z]+|[A-Z]{2})\b/);
    const stateMap: Record<string, string> = {
      florida: 'FL', fl: 'FL', california: 'CA', ca: 'CA',
      texas: 'TX', tx: 'TX', newyork: 'NY', ny: 'NY',
    };
    const stateKey = stateMatch?.[1]?.toLowerCase();
    const state = stateKey ? stateMap[stateKey] ?? stateMatch?.[1]?.toUpperCase() : undefined;
    return {
      tool: getMyPipelineTool,
      args: { userId: context.user.userId, ...(state ? { state } : {}) },
      intro: `Pulling your pipeline${state ? ` in ${state}` : ''}…\n\n`,
      outro: `\n\nWhich one do you want to work on next, ${firstName}?`,
    };
  }

  // General lead search
  if (/(find|search|look up|locate).*lead/i.test(userMessage)) {
    const term = userMessage.replace(/.*(find|search|look up|locate)/i, '').trim();
    return {
      tool: searchLeadsTool as unknown as typeof getMyPipelineTool,
      args: term ? { searchTerm: term } : {},
      intro: `Searching the lead book…\n\n`,
      outro: `\n\nClick any leadId to drill in, ${firstName}.`,
    };
  }

  // No tool — canned helpful response
  return {
    tool: null,
    args: {},
    intro: '',
    outro:
      `Hey ${firstName} — I'm running in stub mode right now (no LLM credit), so I can ` +
      `handle a focused set of agentic flows: **show me my pipeline**, **find ` +
      `leads in FL**, **open LEAD-001**, **find HMO plans in 33101**, or **draft a ` +
      `follow-up email for John**. Once the Anthropic key has credit, I'll be able ` +
      `to answer free-form questions too.`,
  };
}

async function streamText(text: string, chunkMs = 18): Promise<AsyncIterable<string>> {
  // Slice into ~3-char chunks for a typed-out feel.
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + 3));
    i += 3;
  }
  async function* gen(): AsyncIterable<string> {
    for (const c of chunks) {
      await new Promise((r) => setTimeout(r, chunkMs));
      yield c;
    }
  }
  return gen();
}

async function* runStubAtlas(
  input: StreamAtlasAgentInput,
  signal?: AbortSignal,
): AsyncIterable<AtlasStreamEvent> {
  const intent = pickStubIntent(input.userMessage, input.context);
  let finalText = '';
  let stubCardEmitted = false;

  // 1. Stream the intro line.
  if (intent.intro) {
    const introStream = await streamText(intent.intro);
    for await (const piece of introStream) {
      if (signal?.aborted) return;
      finalText += piece;
      yield { type: 'token', content: piece };
    }
  }

  // 2. Call the tool (if any).
  let toolOutput: unknown = null;
  if (intent.tool) {
    const toolName = (intent.tool as { name?: string }).name ?? 'tool';
    const startedAt = Date.now();
    yield { type: 'tool_start', tool: toolName, input: intent.args };
    try {
      // LangChain DynamicStructuredTool exposes `.invoke(args)` returning the
      // raw string output.
      const rawOutput = await (intent.tool as unknown as {
        invoke: (args: unknown) => Promise<string>;
      }).invoke(intent.args);
      try {
        toolOutput = JSON.parse(rawOutput);
      } catch {
        toolOutput = rawOutput;
      }
    } catch (err) {
      toolOutput = { error: err instanceof Error ? err.message : String(err) };
    }
    yield {
      type: 'tool_end',
      tool: toolName,
      output: toolOutput,
      latencyMs: Date.now() - startedAt,
    };
    // Side-channel events (proposal_created, navigate, display_card) —
    // unified extractor shared with the real ReAct path.
    for (const side of extractSideChannelEvents(toolName, toolOutput)) {
      yield side;
      if (side.type === 'display_card') stubCardEmitted = true;
    }
  }

  // 3. Stream a short summary of the result. Skipped for proposal/navigate
  //    AND when a display card was emitted — the card renders the rows;
  //    repeating them as a text list would duplicate content.
  if (toolOutput && typeof toolOutput === 'object') {
    const obj = toolOutput as Record<string, unknown>;
    const isProposalOrNav = !!obj.proposalId || !!obj.navigate;
    if (!isProposalOrNav && !stubCardEmitted) {
      const summary = summarizeStubOutput(toolOutput, input.userMessage);
      if (summary) {
        const summaryStream = await streamText(summary);
        for await (const piece of summaryStream) {
          if (signal?.aborted) return;
          finalText += piece;
          yield { type: 'token', content: piece };
        }
      }
    }
  }

  // 4. Stream the outro.
  if (intent.outro) {
    const outroStream = await streamText(intent.outro);
    for await (const piece of outroStream) {
      if (signal?.aborted) return;
      finalText += piece;
      yield { type: 'token', content: piece };
    }
  }

  logger.info({ userId: input.userId, hadTool: !!intent.tool }, 'Atlas: stub turn complete');
  yield { type: 'final', content: finalText, interactionId: '' };
}

/**
 * Render a tool's JSON output as a short markdown bullet list for the stub.
 * Pure deterministic — no LLM. Keeps the demo feeling alive.
 */
function summarizeStubOutput(output: unknown, _userMessage: string): string {
  if (!output || typeof output !== 'object') return '';
  const obj = output as Record<string, unknown>;

  if (obj.error) return `(${String(obj.error)})`;

  // getMyPipeline / searchLeads style
  if (Array.isArray(obj.leads)) {
    const leads = obj.leads as Array<{
      leadId: string;
      name: string;
      status: string;
      state?: string;
      phone?: string;
    }>;
    if (leads.length === 0) {
      return 'No matching leads.';
    }
    const counts = obj.countsByStatus as Record<string, number> | undefined;
    const lines: string[] = [];
    if (typeof obj.totalCount === 'number') {
      lines.push(`**${obj.totalCount} leads** total.`);
      if (counts) {
        const breakdown = Object.entries(counts)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ');
        lines.push(breakdown);
      }
      lines.push('');
    } else if (typeof obj.total === 'number') {
      lines.push(`Found **${obj.total}** matches:`);
      lines.push('');
    }
    for (const l of leads.slice(0, 5)) {
      lines.push(`- \`${l.leadId}\` — ${l.name} · ${l.status}${l.state ? ` · ${l.state}` : ''}`);
    }
    if (leads.length > 5) {
      lines.push(`- …and ${leads.length - 5} more`);
    }
    return lines.join('\n');
  }

  // getLeadDetails
  if (obj.leadId && obj.firstName && obj.lastName) {
    const l = obj as Record<string, unknown>;
    const lines = [
      `**${l.firstName} ${l.lastName}** (\`${l.leadId}\`)`,
      `- Status: ${l.leadStatus}`,
      `- Location: ${l.city}, ${l.state} ${l.zipCode}`,
    ];
    if (l.phone) lines.push(`- Phone: ${l.phone}`);
    if (l.email) lines.push(`- Email: ${l.email}`);
    if (Array.isArray(l.taggedDrugs) && l.taggedDrugs.length > 0) {
      lines.push(`- Drugs tagged: ${l.taggedDrugs.length}`);
    }
    return lines.join('\n');
  }

  // searchPlans
  if (Array.isArray(obj.plans)) {
    const plans = obj.plans as Array<{ planId?: string; planName?: string; premium?: number }>;
    if (plans.length === 0) return 'No plans found.';
    const lines = [`Found **${plans.length}** plans:`];
    for (const p of plans.slice(0, 5)) {
      lines.push(`- \`${p.planId}\` — ${p.planName}${p.premium !== undefined ? ` · $${p.premium}/mo` : ''}`);
    }
    return lines.join('\n');
  }

  return '';
}
