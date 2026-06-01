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
import type { TranscriptChunk } from '../ai/types/call.types.js';

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

export type CallBusEvent =
  | CallBusTranscriptEvent
  | CallBusStatusEvent
  | CallBusErrorEvent;

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
