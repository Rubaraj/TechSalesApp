/**
 * Live AI coaching — short actionable tips to the agent mid-call.
 *
 * Triggers:
 *   (a) a compliance violation (from runAgentSideAnalysis)
 *   (b) an emotion shift INTO confused / frustrated / upset (emotionTracker)
 *
 * Two-speed delivery:
 *   - INSTANT (free, works in stub mode): compliance triggers immediately
 *     publish the rule's own suggestion as a `coaching` event.
 *   - LLM (skipped under stub provider): a contextual tip from the last few
 *     transcript lines + the trigger, published when ready (the FE replaces
 *     the instant rule tip), tagged on the record, audited as call_coaching.
 *
 * Debounce: at most one LLM tip per TIP_MIN_INTERVAL_MS, max TIPS_PER_CALL
 * per call. Never blocks or breaks the call path.
 */
import { z } from 'zod';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { getChatModel, getActiveProvider } from '../llm/chatModel.js';
import { AuditCallbackHandler } from '../llm/callbacks.js';
import { publish, type ProspectEmotion } from '../../services/callBus.js';
import type { TranscriptChunk } from '../types/call.types.js';
import { onEmotionShift } from './emotionTracker.js';

const TIP_MIN_INTERVAL_MS = 20_000;
const TIPS_PER_CALL = 5;
const WINDOW_LINES = 10;

const TipSchema = z.object({
  tip: z
    .string()
    .max(220)
    .describe('ONE actionable sentence the agent can apply right now, second person'),
  focus: z.enum(['compliance', 'empathy', 'clarity', 'pacing']),
});

const SYSTEM_PROMPT =
  'You are a live sales coach for Medicare agents. Given the last transcript ' +
  'lines and a trigger (a compliance violation or the prospect turning ' +
  'confused/frustrated/upset), give the agent ONE short, specific, actionable ' +
  'tip they can apply in their very next sentence. Second person, no preamble, ' +
  'no judgment. Never suggest anything that violates CMS marketing rules.';

interface CoachState {
  lastTipAt: number;
  tipCount: number;
  inFlight: boolean;
}

const states = new Map<string, CoachState>();

/** Transcript accessor — registered by callAnalysisAgent (owner of history). */
type HistoryReader = (callSid: string) => TranscriptChunk[];
let readHistory: HistoryReader | null = null;
/** Tag writer — registered by callAnalysisAgent (owner of callTags). */
type TagWriter = (callSid: string, data: Record<string, unknown>) => void;
let writeTag: TagWriter | null = null;
/** Per-call userId accessor — for audit attribution. */
type UserIdReader = (callSid: string) => string | undefined;
let readUserId: UserIdReader | null = null;

export function wireCoachingAdvisor(hooks: {
  historyReader: HistoryReader;
  tagWriter: TagWriter;
  userIdReader: UserIdReader;
}): void {
  readHistory = hooks.historyReader;
  writeTag = hooks.tagWriter;
  readUserId = hooks.userIdReader;
  // Emotion shifts into a negative state trigger a tip.
  onEmotionShift(({ callSid, emotion }) => {
    if (emotion === 'confused' || emotion === 'frustrated' || emotion === 'upset') {
      triggerCoaching(callSid, {
        kind: 'emotion',
        detail: `The prospect just turned ${emotion}.`,
      });
    }
  });
}

export function startCoaching(callSid: string): void {
  states.set(callSid, { lastTipAt: 0, tipCount: 0, inFlight: false });
}

export function stopCoaching(callSid: string): void {
  states.delete(callSid);
}

export function __resetCoachingForTests(): void {
  states.clear();
}

export interface CoachingTrigger {
  kind: 'compliance' | 'emotion';
  /** Human-readable trigger description for the LLM prompt. */
  detail: string;
  /** Compliance triggers: the rule's canned suggestion → instant tip. */
  instantTip?: string;
}

/**
 * Fire-and-forget. Publishes the instant tip (if any) immediately; runs the
 * LLM tip in the background when allowed by debounce/cap/provider.
 */
export function triggerCoaching(callSid: string, trigger: CoachingTrigger): void {
  const state = states.get(callSid);
  if (!state) return;

  const now = Date.now();

  // Instant canned tip for compliance triggers — free, works without an LLM.
  if (trigger.instantTip) {
    publish(callSid, {
      type: 'coaching',
      source: 'rule',
      tip: trigger.instantTip,
      focus: 'compliance',
      ts: now,
    });
  }

  if (getActiveProvider() === 'stub') return;
  if (state.inFlight) return;
  if (state.tipCount >= TIPS_PER_CALL) return;
  if (now - state.lastTipAt < TIP_MIN_INTERVAL_MS) return;

  state.inFlight = true;
  state.lastTipAt = now;
  state.tipCount += 1;

  void generateTip(callSid, trigger)
    .catch((err) => {
      logger.debug({ err, callSid }, 'coachingAdvisor: tip failed (skipped)');
    })
    .finally(() => {
      const s = states.get(callSid);
      if (s) s.inFlight = false;
    });
}

async function generateTip(callSid: string, trigger: CoachingTrigger): Promise<void> {
  const history = readHistory?.(callSid) ?? [];
  const window = history.slice(-WINDOW_LINES);
  if (window.length === 0) return;
  const transcript = window
    .map((c) => `${c.speaker === 'agent' ? 'AGENT' : 'PROSPECT'}: ${c.text}`)
    .join('\n');
  const userId = readUserId?.(callSid);

  const auditCb = new AuditCallbackHandler();
  const llm = getChatModel({
    ...(env.AI_MODEL_QA ? { modelOverride: env.AI_MODEL_QA } : {}),
    temperature: 0.3,
  });
  const structured = llm.withStructuredOutput(TipSchema, { name: 'coaching_tip' });
  const result = await structured.invoke(
    [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(`TRIGGER: ${trigger.detail}\n\nRECENT TRANSCRIPT:\n${transcript}`),
    ],
    { callbacks: [auditCb] },
  );
  void auditCb.flush({
    kind: 'call_coaching',
    ...(userId ? { userId } : {}),
    input: { callSid, trigger: trigger.detail },
    output: result,
  });

  if (!states.has(callSid)) return; // call ended while generating

  publish(callSid, {
    type: 'coaching',
    source: 'ai',
    tip: result.tip,
    focus: result.focus,
    ts: Date.now(),
  });
  writeTag?.(callSid, { tip: result.tip, focus: result.focus, trigger: trigger.kind });
}

// Re-export for the emotion listener signature consumers.
export type { ProspectEmotion };
