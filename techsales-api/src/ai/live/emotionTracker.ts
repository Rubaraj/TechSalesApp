/**
 * Live-call emotion tracking (LLM-only, prospect speech).
 *
 * Sampled from the callAnalysisAgent's subscribe path on prospect FINAL
 * chunks: every 3rd prospect chunk OR 20s since the last sample, whichever
 * comes first. One cheap structured LLM call (same template as runQaReview)
 * classifies the prospect's current emotional state from the last few lines
 * of both speakers.
 *
 * Results:
 *   - every sample  → per-call `emotion` SSE event (agent's header badge)
 *   - on CHANGE     → `emotion` tag (persisted) + `emotion_shift` on the
 *                     supervisor bus + a coaching trigger (coachingAdvisor)
 *
 * Never blocks or breaks the call path: provider==='stub' or any error →
 * skip silently (one debug log). State is cleaned in stopCallAnalysis.
 */
import { z } from 'zod';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { getChatModel, getActiveProvider } from '../llm/chatModel.js';
import { AuditCallbackHandler } from '../llm/callbacks.js';
import { publish, publishGlobal, type ProspectEmotion } from '../../services/callBus.js';
import type { TranscriptChunk } from '../types/call.types.js';

const SAMPLE_EVERY_CHUNKS = 3;
const SAMPLE_MIN_INTERVAL_MS = 20_000;
const WINDOW_LINES = 8;

const EmotionSchema = z.object({
  emotion: z
    .enum(['positive', 'neutral', 'confused', 'frustrated', 'upset'])
    .describe("The prospect's current emotional state"),
  confidence: z.number().min(0).max(1).describe('How confident you are, 0-1'),
  rationale: z.string().max(200).describe('One short sentence of evidence'),
});

const SYSTEM_PROMPT =
  'You classify the emotional state of a Medicare prospect during a sales call. ' +
  'You are given the last few transcript lines (both speakers). Judge ONLY the ' +
  "PROSPECT's current state, weighting their most recent lines heaviest. " +
  'confused = losing track of the explanation; frustrated = irritated with the ' +
  'process or agent; upset = distressed or angry. Be conservative: prefer ' +
  'neutral unless the words clearly signal otherwise.';

interface EmotionState {
  lastEmotion: ProspectEmotion | null;
  lastSampleAt: number;
  chunksSinceSample: number;
  inFlight: boolean;
}

const states = new Map<string, EmotionState>();

export type EmotionShiftListener = (input: {
  callSid: string;
  userId?: string;
  emotion: ProspectEmotion;
  prevEmotion: ProspectEmotion | null;
}) => void;

/** Coaching hook — registered once by coachingAdvisor (avoids an import
 *  cycle through callAnalysisAgent). */
let shiftListener: EmotionShiftListener | null = null;
export function onEmotionShift(listener: EmotionShiftListener): void {
  shiftListener = listener;
}

export function startEmotionTracking(callSid: string): void {
  states.set(callSid, {
    lastEmotion: null,
    lastSampleAt: 0,
    chunksSinceSample: 0,
    inFlight: false,
  });
}

export function stopEmotionTracking(callSid: string): void {
  states.delete(callSid);
}

export function __resetEmotionForTests(): void {
  states.clear();
}

/**
 * Called for every prospect FINAL chunk. Decides whether to sample, and if
 * so fires the LLM in the background (never awaited by the call path).
 */
export function noteProspectChunk(
  callSid: string,
  history: TranscriptChunk[],
  userId?: string,
): void {
  const state = states.get(callSid);
  if (!state || state.inFlight) return;
  if (getActiveProvider() === 'stub') return;

  state.chunksSinceSample += 1;
  const due =
    state.chunksSinceSample >= SAMPLE_EVERY_CHUNKS ||
    (state.lastSampleAt > 0 && Date.now() - state.lastSampleAt >= SAMPLE_MIN_INTERVAL_MS);
  if (!due && state.lastSampleAt > 0) return;
  // First-ever sample waits for the chunk quota so the window has substance.
  if (state.lastSampleAt === 0 && state.chunksSinceSample < SAMPLE_EVERY_CHUNKS) return;

  state.inFlight = true;
  state.chunksSinceSample = 0;
  state.lastSampleAt = Date.now();

  void sample(callSid, history, userId)
    .catch((err) => {
      logger.debug({ err, callSid }, 'emotionTracker: sample failed (skipped)');
    })
    .finally(() => {
      const s = states.get(callSid);
      if (s) s.inFlight = false;
    });
}

async function sample(
  callSid: string,
  history: TranscriptChunk[],
  userId?: string,
): Promise<void> {
  const window = history.slice(-WINDOW_LINES);
  if (window.length === 0) return;
  const transcript = window
    .map((c) => `${c.speaker === 'agent' ? 'AGENT' : 'PROSPECT'}: ${c.text}`)
    .join('\n');

  const auditCb = new AuditCallbackHandler();
  const llm = getChatModel({
    ...(env.AI_MODEL_QA ? { modelOverride: env.AI_MODEL_QA } : {}),
    temperature: 0,
  });
  const structured = llm.withStructuredOutput(EmotionSchema, { name: 'prospect_emotion' });
  const result = await structured.invoke(
    [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(transcript)],
    { callbacks: [auditCb] },
  );
  void auditCb.flush({
    kind: 'call_emotion',
    ...(userId ? { userId } : {}),
    input: { callSid, lines: window.length },
    output: result,
  });

  const state = states.get(callSid);
  if (!state) return; // call ended while sampling

  const emotion = result.emotion as ProspectEmotion;
  const ts = Date.now();

  // Agent-side badge — every sample.
  publish(callSid, { type: 'emotion', emotion, confidence: result.confidence, ts });

  if (emotion !== state.lastEmotion) {
    const prevEmotion = state.lastEmotion;
    state.lastEmotion = emotion;
    publishGlobal({
      type: 'emotion_shift',
      callSid,
      ...(userId ? { userId } : {}),
      emotion,
      prevEmotion,
      ts,
    });
    shiftListener?.({ callSid, ...(userId ? { userId } : {}), emotion, prevEmotion });
    // Persisted tag on shift only (samples would spam the record).
    tagWriter?.(callSid, {
      from: prevEmotion,
      to: emotion,
      confidence: result.confidence,
      rationale: result.rationale,
    });
  }
}

/** Tag writer hook — registered by callAnalysisAgent (owner of callTags). */
type TagWriter = (callSid: string, data: Record<string, unknown>) => void;
let tagWriter: TagWriter | null = null;
export function registerEmotionTagWriter(writer: TagWriter): void {
  tagWriter = writer;
}
