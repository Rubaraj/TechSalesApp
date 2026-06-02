/**
 * LLM provider switch. Single chokepoint that every agent uses.
 *
 * - `AI_LLM_PROVIDER=ollama`     → ChatOllama running `OLLAMA_LLM_MODEL`
 *                                  (default qwen2.5:7b, free, local).
 * - `AI_LLM_PROVIDER=anthropic`  → ChatAnthropic running `AI_MODEL_DEFAULT`
 *                                  (default claude-sonnet-4-6, paid).
 *
 * The `premium` flag promotes to `AI_MODEL_PREMIUM` / `OLLAMA_LLM_PREMIUM_MODEL`.
 * The factory returns `BaseChatModel` so call sites are provider-agnostic;
 * LangGraph's `createReactAgent` accepts any `BaseChatModel` input.
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { env } from '../../config/env.js';
import { getAnthropicChatModel } from './providers/anthropic.js';
import { getOllamaChatModel } from './providers/ollama.js';

export interface GetChatModelOptions {
  /** Use the premium tier instead of the default. */
  premium?: boolean;
  /** Override temperature. Defaults to 0.2 — we want deterministic-ish outputs. */
  temperature?: number;
  /** Override per-request timeout (ms). Used by Anthropic; Ollama ignores it. */
  timeoutMs?: number;
}

export type AiProvider = 'ollama' | 'anthropic' | 'stub';

/**
 * Build a fresh chat model. We deliberately do NOT cache — the
 * AuditCallbackHandler is per-request, so each call site gets a fresh model
 * with its own callback list.
 *
 * Throws a clear error if the active provider is not configured properly
 * (e.g. anthropic + missing key). Lazy: doesn't fail at module-import time.
 */
export function getChatModel(opts: GetChatModelOptions = {}): BaseChatModel {
  switch (env.AI_LLM_PROVIDER) {
    case 'anthropic':
      return getAnthropicChatModel(opts);
    case 'ollama':
      return getOllamaChatModel(opts);
    case 'stub':
      // Phase 3a — rule-based path doesn't call any LLM. If something tries
      // to instantiate a chat model under the stub provider, fail loudly so
      // the misconfiguration surfaces immediately rather than at request time.
      throw new Error(
        'getChatModel() called while AI_LLM_PROVIDER=stub. ' +
          'The stub provider drives rule-based call analysis only — there is no LLM. ' +
          'Switch AI_LLM_PROVIDER to ollama or anthropic to use chat / explain / search / etc.',
      );
    default: {
      // exhaustiveness — env zod-enum makes this unreachable, but TS is happier.
      const x: never = env.AI_LLM_PROVIDER;
      throw new Error(`Unknown AI_LLM_PROVIDER: ${String(x)}`);
    }
  }
}

/** Read-only accessor for the active provider; mirrored to /api/health. */
export function getActiveProvider(): AiProvider {
  return env.AI_LLM_PROVIDER;
}

/** The model id the active provider WILL USE for a non-premium call. Used by
 * the audit logger so each `aiInteractions` row records the right model. */
export function getActiveModel(opts: { premium?: boolean } = {}): string {
  if (env.AI_LLM_PROVIDER === 'anthropic') {
    return opts.premium ? env.AI_MODEL_PREMIUM : env.AI_MODEL_DEFAULT;
  }
  if (env.AI_LLM_PROVIDER === 'stub') {
    return 'stub';
  }
  return opts.premium ? env.OLLAMA_LLM_PREMIUM_MODEL : env.OLLAMA_LLM_MODEL;
}

/**
 * Pre-flight check used by the controller. Returns `null` if the active
 * provider is ready to serve; otherwise an error message string for a
 * provider-aware 503 response.
 *
 * For `ollama` we additionally do a fast TCP/HTTP probe of `OLLAMA_URL`
 * (1.5s timeout) so a downed daemon surfaces an immediate, friendly 503
 * instead of the LangGraph call hanging until LangChain's internal retry
 * exhausts. The probe result is cached for 10s to avoid hammering Ollama
 * once it's confirmed up.
 */
const PROBE_TTL_MS = 10_000;
const PROBE_TIMEOUT_MS = 1_500;
let cachedProbeError: string | null = null;
let cachedProbeAt = 0;

async function probeOllama(): Promise<string | null> {
  const now = Date.now();
  if (now - cachedProbeAt < PROBE_TTL_MS) return cachedProbeError;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  let result: string | null = null;
  try {
    // /api/tags is a lightweight Ollama endpoint that returns the local
    // model catalogue. Any 2xx is a definitive "the daemon is up".
    const res = await fetch(`${env.OLLAMA_URL}/api/tags`, { signal: controller.signal });
    if (!res.ok) {
      result =
        `AI provider is "ollama" but ${env.OLLAMA_URL}/api/tags returned ${res.status}. ` +
        'Verify the Ollama container is healthy.';
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    result =
      `AI provider is "ollama" but ${env.OLLAMA_URL} is unreachable (${reason}). ` +
      `Start it with: docker start ollama && docker exec ollama ollama pull ${env.OLLAMA_LLM_MODEL}. ` +
      'Or change AI_LLM_PROVIDER=anthropic if you have an API key.';
  } finally {
    clearTimeout(timer);
  }
  cachedProbeError = result;
  cachedProbeAt = now;
  return result;
}

export async function getProviderReadinessError(): Promise<string | null> {
  if (env.AI_LLM_PROVIDER === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY.trim() === '') {
      return (
        'AI provider is "anthropic" but ANTHROPIC_API_KEY is not set on the server. ' +
        'Either set the key (https://console.anthropic.com/settings/keys), ' +
        'or change AI_LLM_PROVIDER=ollama for the free local path.'
      );
    }
    return null;
  }
  if (env.AI_LLM_PROVIDER === 'stub') {
    // Stub provider doesn't power chat/explain/etc. — return a clear error
    // so /api/ai/* endpoints that need a real LLM 503 with a friendly message.
    return (
      'AI provider is "stub" — chat/explain/search/compare/drug-coverage need a real LLM. ' +
      'Switch AI_LLM_PROVIDER to ollama or anthropic for those endpoints. ' +
      'callAnalysisAgent (live-call analysis) works under stub via rule-based extraction.'
    );
  }
  // ollama
  return probeOllama();
}

/** Test-only: drop the cached probe result so the next call re-probes. */
export function __resetProviderProbeForTests(): void {
  cachedProbeError = null;
  cachedProbeAt = 0;
}
