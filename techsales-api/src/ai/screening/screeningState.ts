/**
 * AI call screening — per-call screening state (module map, in-memory).
 *
 * Registered by POST /api/screening/start; consulted by the screening WS
 * bridge (auth gate: callSid + nonce), the incoming-result webhook guard,
 * and callAnalysisAgent's teardown (auto-lead decision + screenedByAi
 * flag). The teardown CONSUMES the entry; the bridge never deletes it.
 *
 * Cycle-safe by design: imports nothing from the analysis agent.
 */
import { randomUUID } from 'node:crypto';

export interface ScreeningEntry {
  agentUserId: string;
  /** Nonce carried as a <Stream><Parameter> — the WS bridge's auth gate. */
  token: string;
  takenOver: boolean;
  startedAt: number;
}

const entries = new Map<string, ScreeningEntry>();

export function registerScreening(callSid: string, agentUserId: string): ScreeningEntry {
  const entry: ScreeningEntry = {
    agentUserId,
    token: randomUUID(),
    takenOver: false,
    startedAt: Date.now(),
  };
  entries.set(callSid, entry);
  return entry;
}

export function getScreening(callSid: string): ScreeningEntry | undefined {
  return entries.get(callSid);
}

export function markTakenOver(callSid: string): void {
  const entry = entries.get(callSid);
  if (entry) entry.takenOver = true;
}

/** Remove and return the entry (called from call teardown). */
export function consumeScreening(callSid: string): ScreeningEntry | undefined {
  const entry = entries.get(callSid);
  entries.delete(callSid);
  return entry;
}

export function __resetScreeningForTests(): void {
  entries.clear();
}
