/**
 * Backend wire-format mirror of `techsales-app/src/types/call.ts`.
 * Kept narrow to the fields the SSE bridge serializes; the FE owns the
 * superset (UI state, etc.).
 *
 * KEEP IN LOCKSTEP: any change here must be mirrored on the FE.
 */

export type Speaker = 'agent' | 'prospect' | 'unknown';

export interface TranscriptChunk {
  id: string;
  text: string;
  /** epoch ms when the chunk was recognized server-side (Deepgram emit time). */
  timestamp: number;
  isFinal: boolean;
  speaker: Speaker;
  /** Deepgram-emitted confidence 0–1. */
  confidence?: number;
}

/** SSE event union sent over `GET /api/ai/call/analyze`. Phase 3+ extends. */
export type CallStreamEvent =
  | { type: 'open'; callSid: string }
  | { type: 'transcript'; chunk: TranscriptChunk }
  | { type: 'call_status'; status: 'connected' | 'ended' }
  | { type: 'error'; error: string };
