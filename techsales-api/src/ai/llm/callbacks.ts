/**
 * Per-request audit callback handler. Captures token usage, latency, model
 * name, and the full tool-call trace from a LangChain run, then `flush()`-es
 * an `aiInteraction` document. One instance per request — DO NOT share
 * across requests.
 *
 * The shape of LLM/tool callback events is loosely typed in @langchain/core
 * (much of it is `unknown` / `Record<string, unknown>`), so we narrow
 * defensively at the boundary and drop fields we don't recognize.
 */
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import type { Serialized } from '@langchain/core/load/serializable';
import { repos } from '../../repositories/registry.js';
import { logger } from '../../config/logger.js';
import { getActiveProvider, getActiveModel } from './chatModel.js';

export type AiInteractionKind =
  | 'echo'
  | 'recommend'
  | 'explain'
  | 'search'
  | 'compare'
  | 'drug-coverage'
  | 'chat'
  /** Phase 3a — written by callAnalysisAgent (stub provider) for each
   *  notable event during a live call (compliance flag, info card surfaced,
   *  entities extracted). Phase 3d's post-call summary aggregates these. */
  | 'call_analysis'
  /** Phase 4 — Atlas agentic copilot conversations. One audit row per agent
   *  turn (user message → tool calls → final assistant message). Carries the
   *  `userId` (agent) and prompt-cache token counts. */
  | 'atlas'
  /** QA pipeline — one row per on-demand call QA review (userId = the
   *  supervisor who requested it; input carries the callSid). */
  | 'call_qa';

export interface ToolCallTrace {
  name: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
}

export interface AuditFlushInput {
  kind: AiInteractionKind;
  userId?: string;
  memberId?: string;
  /** What the controller received from the client. */
  input: unknown;
  /** What the controller will return to the client. May be partial on errors. */
  output: unknown;
  /** Set when the agent itself errored (separate from per-tool errors which are absorbed). */
  error?: string;
  /** Force the provider — defaults to the active `AI_LLM_PROVIDER`. Set `'stub'` from a test path if needed. */
  provider?: 'anthropic' | 'ollama' | 'stub';
}

interface PendingTool {
  name: string;
  input: unknown;
  startedAt: number;
}

/**
 * Mongoose / JSON write-target. Defined locally to avoid a circular import
 * with the model file at the top of the AI module tree.
 */
export interface AiInteractionRecord {
  interactionId?: string;
  kind: AiInteractionKind;
  userId?: string;
  memberId?: string;
  provider: 'anthropic' | 'ollama' | 'stub';
  model: string;
  input: unknown;
  output: unknown;
  tokensIn: number;
  tokensOut: number;
  cachedInputTokens: number;
  cachedReadTokens: number;
  latencyMs: number;
  toolCalls: ToolCallTrace[];
  error?: string;
  createdAt: string;
}

/** Pull `usage_metadata` (LangChain-normalized) out of an LLMResult, with fallbacks. */
const extractUsage = (
  output: LLMResult,
): {
  tokensIn: number;
  tokensOut: number;
  cachedInputTokens: number;
  cachedReadTokens: number;
  model: string | undefined;
} => {
  let tokensIn = 0;
  let tokensOut = 0;
  let cachedInputTokens = 0;
  let cachedReadTokens = 0;
  let model: string | undefined;

  // generations is Generation[][]; usage often lives on each generation's
  // `message.usage_metadata` (chat models) or in `llmOutput`.
  const generations = output.generations ?? [];
  for (const batch of generations) {
    for (const gen of batch) {
      const message = (gen as { message?: { usage_metadata?: Record<string, unknown> } }).message;
      const usage = message?.usage_metadata;
      if (usage && typeof usage === 'object') {
        const ti = Number(usage.input_tokens);
        const to = Number(usage.output_tokens);
        if (Number.isFinite(ti)) tokensIn += ti;
        if (Number.isFinite(to)) tokensOut += to;
        const detail = (usage.input_token_details as Record<string, unknown> | undefined) ?? {};
        const created = Number(detail.cache_creation);
        const read = Number(detail.cache_read);
        if (Number.isFinite(created)) cachedInputTokens += created;
        if (Number.isFinite(read)) cachedReadTokens += read;
      }
    }
  }

  // Fallback to llmOutput when usage_metadata isn't present on the generation
  // (some providers / older versions wire it differently).
  const llmOutput = output.llmOutput as Record<string, unknown> | undefined;
  if (llmOutput) {
    if (tokensIn === 0 && tokensOut === 0) {
      const tokenUsage = llmOutput.tokenUsage as Record<string, unknown> | undefined;
      if (tokenUsage) {
        const ti = Number(tokenUsage.promptTokens ?? tokenUsage.prompt_tokens);
        const to = Number(tokenUsage.completionTokens ?? tokenUsage.completion_tokens);
        if (Number.isFinite(ti)) tokensIn = ti;
        if (Number.isFinite(to)) tokensOut = to;
      }
    }
    const m = llmOutput.model_name ?? llmOutput.model;
    if (typeof m === 'string') model = m;
  }
  return { tokensIn, tokensOut, cachedInputTokens, cachedReadTokens, model };
};

export class AuditCallbackHandler extends BaseCallbackHandler {
  override name = 'AuditCallbackHandler';

  // Accumulators — the agent may invoke the LLM multiple times (one per
  // ReAct loop step), and tools fire interleaved.
  private tokensIn = 0;
  private tokensOut = 0;
  private cachedInputTokens = 0;
  private cachedReadTokens = 0;
  private model = '';
  private toolCalls: ToolCallTrace[] = [];
  private pendingTools = new Map<string, PendingTool>();

  // Wall-clock latency (start at construction, not at first LLM call — the
  // controller measures the full request including agent setup).
  private readonly startedAt: number = Date.now();

  // Most recent LLM error message (non-fatal; we capture for the audit row).
  private llmErrorMessage?: string;

  override async handleLLMStart(
    llm: Serialized,
    _prompts: string[],
    _runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string,
  ): Promise<void> {
    // Capture the model id ASAP so we still log it on a downstream error.
    if (!this.model) {
      const candidate =
        (llm as { id?: string[] }).id?.join('.') ??
        runName ??
        '';
      this.model = candidate;
    }
  }

  override async handleLLMEnd(output: LLMResult): Promise<void> {
    const usage = extractUsage(output);
    this.tokensIn += usage.tokensIn;
    this.tokensOut += usage.tokensOut;
    this.cachedInputTokens += usage.cachedInputTokens;
    this.cachedReadTokens += usage.cachedReadTokens;
    if (usage.model) this.model = usage.model;
  }

  override async handleLLMError(err: Error): Promise<void> {
    this.llmErrorMessage = err.message;
  }

  override async handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string,
  ): Promise<void> {
    const name =
      runName ??
      (tool as { name?: string }).name ??
      (tool as { id?: string[] }).id?.at(-1) ??
      'unknown';
    let parsedInput: unknown = input;
    try {
      parsedInput = JSON.parse(input);
    } catch {
      // Tool inputs aren't always JSON — DynamicTool passes a raw string.
    }
    this.pendingTools.set(runId, {
      name,
      input: parsedInput,
      startedAt: Date.now(),
    });
  }

  override async handleToolEnd(output: unknown, runId: string): Promise<void> {
    const pending = this.pendingTools.get(runId);
    if (!pending) return;
    this.pendingTools.delete(runId);
    let parsedOutput: unknown = output;
    // LangGraph wraps tool results in a ToolMessage — unwrap so the audit
    // trace records the tool's actual payload, not the serialized wrapper.
    if (
      parsedOutput &&
      typeof parsedOutput === 'object' &&
      'content' in parsedOutput &&
      typeof (parsedOutput as { content: unknown }).content === 'string'
    ) {
      parsedOutput = (parsedOutput as { content: string }).content;
    }
    if (typeof parsedOutput === 'string') {
      try {
        parsedOutput = JSON.parse(parsedOutput);
      } catch {
        // leave as string
      }
    }
    this.toolCalls.push({
      name: pending.name,
      input: pending.input,
      output: parsedOutput,
      latencyMs: Date.now() - pending.startedAt,
    });
  }

  override async handleToolError(err: Error, runId: string): Promise<void> {
    const pending = this.pendingTools.get(runId);
    if (!pending) return;
    this.pendingTools.delete(runId);
    this.toolCalls.push({
      name: pending.name,
      input: pending.input,
      output: { error: err.message },
      latencyMs: Date.now() - pending.startedAt,
    });
  }

  /** Manually record a tool call (e.g. from outside the LangChain run tree). */
  recordToolCall(call: ToolCallTrace): void {
    this.toolCalls.push(call);
  }

  /** Returns the current accumulated trace, useful for the response payload. */
  snapshot(): {
    tokensIn: number;
    tokensOut: number;
    cachedInputTokens: number;
    cachedReadTokens: number;
    latencyMs: number;
    toolCalls: ToolCallTrace[];
    model: string;
  } {
    return {
      tokensIn: this.tokensIn,
      tokensOut: this.tokensOut,
      cachedInputTokens: this.cachedInputTokens,
      cachedReadTokens: this.cachedReadTokens,
      latencyMs: Date.now() - this.startedAt,
      toolCalls: [...this.toolCalls],
      model: this.model,
    };
  }

  /**
   * Persist the audit record. Returns the generated `interactionId` so the
   * controller can echo it to the client. Failures are logged but never
   * thrown — audit is best-effort, and we'd rather degrade gracefully than
   * hide a successful AI response behind a Mongo write failure.
   */
  async flush(input: AuditFlushInput): Promise<string | undefined> {
    const snap = this.snapshot();
    // Provider/model fall through to the active AI_LLM_PROVIDER + its
    // configured model id. This matters for Ollama runs where ChatOllama
    // does not reliably populate `llmOutput.model_name`, leaving snap.model
    // empty — without this fallback every Ollama row would log
    // `provider:'anthropic', model:'(unknown)'`.
    const record: AiInteractionRecord = {
      kind: input.kind,
      userId: input.userId,
      memberId: input.memberId,
      provider: input.provider ?? getActiveProvider(),
      model: snap.model || getActiveModel(),
      input: input.input,
      output: input.output,
      tokensIn: snap.tokensIn,
      tokensOut: snap.tokensOut,
      cachedInputTokens: snap.cachedInputTokens,
      cachedReadTokens: snap.cachedReadTokens,
      latencyMs: snap.latencyMs,
      toolCalls: snap.toolCalls,
      error: input.error ?? this.llmErrorMessage,
      createdAt: new Date().toISOString(),
    };
    try {
      const created = await repos.aiInteraction.create(record);
      return created.interactionId;
    } catch (err) {
      logger.error({ err, kind: input.kind }, 'aiInteraction audit write failed');
      return undefined;
    }
  }
}
