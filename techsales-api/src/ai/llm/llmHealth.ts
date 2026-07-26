/**
 * Gap 7 — central LLM health state (the "AI degradation" source of truth).
 *
 * Detection is PASSIVE: real LLM call outcomes are reported here from
 * AuditCallbackHandler (handleLLMEnd/handleLLMError — covers liveInsight,
 * Atlas, chat, QA) plus liveInsight's catch (covers getChatModel()
 * construction throws that never reach callbacks). Nothing runs while the
 * provider is healthy.
 *
 * On the first failure (ok → degraded) a RECOVERY PROBE starts: every 30s
 * a tiny real invoke on the cheap QA model checks whether the provider is
 * back; the first success — probe or real traffic — flips the state back
 * to ok and stops the probe. The probe deliberately skips the audit
 * callback (no audit rows, no re-entry into the reporting path).
 *
 * Consumers: /api/health payload (llm field), the per-call analyze SSE
 * stream (`ai_health` events via onLlmHealthChange), and through those the
 * FE's Atlas-header pill + in-call banner.
 */
import { HumanMessage } from '@langchain/core/messages';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { getChatModel, getActiveProvider } from './chatModel.js';
import { classifyLlmError, friendlyLlmError, type LlmErrorCategory } from './friendlyError.js';

const PROBE_INTERVAL_MS = 30_000;
const PROBE_HARD_TIMEOUT_MS = 8_000;

export interface LlmHealthSummary {
  status: 'ok' | 'degraded';
  category?: LlmErrorCategory;
  reason?: string;
  sinceSec?: number;
}

interface LlmHealthState {
  status: 'ok' | 'degraded';
  category: LlmErrorCategory | null;
  reason: string | null;
  since: number | null;
  lastCheckAt: number;
}

const state: LlmHealthState = {
  status: 'ok',
  category: null,
  reason: null,
  since: null,
  lastCheckAt: 0,
};

let probeTimer: NodeJS.Timeout | null = null;
let probeInFlight = false;

type HealthListener = (health: LlmHealthSummary) => void;
const listeners = new Set<HealthListener>();

export function onLlmHealthChange(listener: HealthListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  const summary = getLlmHealth();
  for (const listener of listeners) {
    try {
      listener(summary);
    } catch (err) {
      logger.warn({ err }, 'llmHealth: listener threw');
    }
  }
}

export function getLlmHealth(): LlmHealthSummary {
  if (state.status === 'ok') return { status: 'ok' };
  return {
    status: 'degraded',
    ...(state.category ? { category: state.category } : {}),
    ...(state.reason ? { reason: state.reason } : {}),
    ...(state.since !== null
      ? { sinceSec: Math.max(0, Math.round((Date.now() - state.since) / 1000)) }
      : {}),
  };
}

/** Report a successful real LLM call (or probe). Degraded → ok stops the
 *  probe and notifies; already-ok is a cheap timestamp update. */
export function reportLlmSuccess(): void {
  state.lastCheckAt = Date.now();
  if (state.status === 'ok') return;
  state.status = 'ok';
  state.category = null;
  state.reason = null;
  state.since = null;
  stopProbe();
  logger.info('llmHealth: recovered — LLM calls succeeding again');
  notify();
}

/**
 * Report a failed LLM call. Idempotent: while already degraded it only
 * refreshes the reason/timestamp — the probe is never restarted or
 * stacked (a single failure can be reported twice: handleLLMError + the
 * call site's own catch). 'stub' is intentional config, never degraded.
 */
export function reportLlmFailure(err: unknown): void {
  const category = classifyLlmError(err);
  if (category === 'stub') return;
  state.lastCheckAt = Date.now();
  const reason = friendlyLlmError(err);
  if (state.status === 'degraded') {
    state.category = category;
    state.reason = reason;
    return;
  }
  state.status = 'degraded';
  state.category = category;
  state.reason = reason;
  state.since = Date.now();
  logger.warn(
    { category, err: err instanceof Error ? err.message : String(err) },
    'llmHealth: degraded — starting recovery probe',
  );
  startProbe();
  notify();
}

// --- Recovery probe ---------------------------------------------------------

function startProbe(): void {
  if (probeTimer) return;
  probeTimer = setInterval(() => void runProbe(), PROBE_INTERVAL_MS);
  probeTimer.unref();
}

function stopProbe(): void {
  if (probeTimer) clearInterval(probeTimer);
  probeTimer = null;
}

async function runProbe(): Promise<void> {
  if (probeInFlight || state.status === 'ok') return;
  if (getActiveProvider() === 'stub') return;
  probeInFlight = true;
  try {
    // Tiny real invoke on the cheap model — the only reliable liveness
    // check (key-presence checks can't see the OpenRouter-VM-off 401).
    // timeoutMs only reaches Anthropic; the Promise.race hard cap covers
    // providers that ignore it.
    const llm = getChatModel({
      ...(env.AI_MODEL_QA ? { modelOverride: env.AI_MODEL_QA } : {}),
      temperature: 0,
      timeoutMs: 5_000,
    });
    await Promise.race([
      llm.invoke([new HumanMessage('Reply with the single word: ok')]),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('probe timeout')), PROBE_HARD_TIMEOUT_MS),
      ),
    ]);
    reportLlmSuccess();
  } catch (err) {
    state.lastCheckAt = Date.now();
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      'llmHealth: probe still failing',
    );
  } finally {
    probeInFlight = false;
  }
}

export function __resetLlmHealthForTests(): void {
  stopProbe();
  probeInFlight = false;
  state.status = 'ok';
  state.category = null;
  state.reason = null;
  state.since = null;
  state.lastCheckAt = 0;
  listeners.clear();
}
