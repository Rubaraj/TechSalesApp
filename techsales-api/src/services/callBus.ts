/**
 * In-memory pub/sub for live-call events. Keyed by `callSid` (Twilio's call
 * identifier), one EventEmitter per active call.
 *
 * Producers (Twilio Media Stream WS handler + Deepgram bridge) publish
 * `CallBusEvent`s. Consumers (the SSE controller in `call.controller.ts`)
 * subscribe and pipe events to their wire.
 *
 * Lifecycle: the emitter is created lazily on first publish or subscribe and
 * removed when the call ends (`endCall(sid)`). Out-of-order subscribe/publish
 * is fine — we never drop events on the floor because the emitter is created
 * synchronously.
 *
 * Phase 2 events: `transcript` from Deepgram, plus a few control envelopes.
 * Phase 3+ will add `entities`, `actions`, `tool_start`, `tool_end`, etc.
 */
import { EventEmitter } from 'node:events';
import type {
  TranscriptChunk,
  AiAction,
  ExtractedEntities,
} from '../ai/types/call.types.js';

export interface CallBusTranscriptEvent {
  type: 'transcript';
  chunk: TranscriptChunk;
}

export interface CallBusStatusEvent {
  type: 'status';
  status: 'connected' | 'ended';
  /** epoch ms */
  at: number;
}

export interface CallBusErrorEvent {
  type: 'error';
  error: string;
}

/** Phase 3a — actions emitted by callAnalysisAgent. */
export interface CallBusActionsEvent {
  type: 'actions';
  actions: AiAction[];
}

/** Phase 3a — accumulated entity diffs emitted by callAnalysisAgent. */
export interface CallBusEntitiesEvent {
  type: 'entities';
  entities: Partial<ExtractedEntities>;
}

/** Live intelligence — prospect emotion sample (emotionTracker). */
export interface CallBusEmotionEvent {
  type: 'emotion';
  emotion: ProspectEmotion;
  confidence: number;
  ts: number;
}

/** Live intelligence — coaching tip for the agent (coachingAdvisor). */
export interface CallBusCoachingEvent {
  type: 'coaching';
  source: 'rule' | 'ai';
  tip: string;
  focus: 'compliance' | 'empathy' | 'clarity' | 'pacing' | 'discovery';
  ts: number;
}

export type CallBusEvent =
  | CallBusTranscriptEvent
  | CallBusStatusEvent
  | CallBusErrorEvent
  | CallBusActionsEvent
  | CallBusEntitiesEvent
  | CallBusEmotionEvent
  | CallBusCoachingEvent;

const emitters = new Map<string, EventEmitter>();

function getEmitter(callSid: string): EventEmitter {
  let e = emitters.get(callSid);
  if (!e) {
    e = new EventEmitter();
    // Many SSE subscribers + multiple producers per call would push past 10.
    e.setMaxListeners(50);
    emitters.set(callSid, e);
  }
  return e;
}

export function publish(callSid: string, event: CallBusEvent): void {
  getEmitter(callSid).emit('event', event);
}

export function subscribe(
  callSid: string,
  handler: (event: CallBusEvent) => void,
): () => void {
  const e = getEmitter(callSid);
  e.on('event', handler);
  return () => {
    e.off('event', handler);
  };
}

/** Tear down the emitter for a finished call. Idempotent. */
export function endCall(callSid: string): void {
  const e = emitters.get(callSid);
  if (!e) return;
  e.removeAllListeners();
  emitters.delete(callSid);
}

export function activeCallCount(): number {
  return emitters.size;
}

// --- Supervisor global bus (QA/Supervisor pipelines) ------------------------
//
// A second, process-wide channel for the Ambient Supervisor CoPilot: an
// active-call registry + targeted lifecycle/compliance events. Deliberately
// NOT a fan-out of every per-call publish — transcript text stays off the
// supervisor wire; only lifecycle, compliance flags, and QA completions
// are broadcast.

export interface ActiveCallMeta {
  userId?: string;
  direction: 'inbound' | 'outbound';
  /** epoch ms */
  startedAt: number;
}

export type SupervisorEvent =
  | {
      type: 'snapshot';
      calls: Array<{ callSid: string } & ActiveCallMeta>;
    }
  | ({ type: 'call_started'; callSid: string } & ActiveCallMeta)
  | {
      type: 'call_ended';
      callSid: string;
      userId?: string;
      flagged: boolean;
      tagCounts: Record<string, number>;
      durationSec: number;
    }
  | {
      type: 'compliance_flag';
      callSid: string;
      userId?: string;
      phrase: string;
      rule: string;
      suggestion?: string;
      severity?: 'info' | 'warn' | 'critical';
      ts: number;
    }
  | { type: 'qa_completed'; callSid: string; overallScore: number }
  | {
      type: 'emotion_shift';
      callSid: string;
      userId?: string;
      emotion: ProspectEmotion;
      prevEmotion: ProspectEmotion | null;
      ts: number;
    };

export type ProspectEmotion = 'positive' | 'neutral' | 'confused' | 'frustrated' | 'upset';

const activeCalls = new Map<string, ActiveCallMeta>();
const globalEmitter = new EventEmitter();
// One listener per open supervisor SSE connection.
globalEmitter.setMaxListeners(100);

export function publishGlobal(event: SupervisorEvent): void {
  globalEmitter.emit('event', event);
}

export function subscribeGlobal(handler: (event: SupervisorEvent) => void): () => void {
  globalEmitter.on('event', handler);
  return () => {
    globalEmitter.off('event', handler);
  };
}

/** Register an active call (agent start) and broadcast call_started. */
export function registerCall(callSid: string, meta: ActiveCallMeta): void {
  activeCalls.set(callSid, meta);
  publishGlobal({ type: 'call_started', callSid, ...meta });
}

/** Remove from the registry. call_ended is published by the analysis agent
 *  (it owns flagged/tagCounts) — this only forgets the entry. Idempotent. */
export function unregisterCall(callSid: string): void {
  activeCalls.delete(callSid);
}

export function getActiveCalls(): Array<{ callSid: string } & ActiveCallMeta> {
  return Array.from(activeCalls.entries()).map(([callSid, meta]) => ({ callSid, ...meta }));
}
