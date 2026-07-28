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
  /** Lines captured by the assistant's save_caller_details function
   *  (reason for calling, callback preference) — flow into the
   *  auto-created lead's note via createLeadFromScreening.noteLines. */
  notes: string[];
  /** Auto-screened (ring timeout / declined / nobody online) rather than
   *  handed over by an agent clicking Screen. Drives the greeting: the
   *  agent is NOT about to join, so "they'll be with you shortly" would
   *  be a lie. */
  unattended: boolean;
  /** Caller's number — used to recognize a caller already in the system. */
  callerNumber?: string;
  /** Lead written DURING the call (save_lead). Teardown finalizes this one
   *  instead of creating another. */
  leadId?: string;
  /** The agent's browser has already been sent to the lead form. */
  navigatedToForm?: boolean;
}

const entries = new Map<string, ScreeningEntry>();

export function registerScreening(
  callSid: string,
  agentUserId: string,
  opts?: { unattended?: boolean; callerNumber?: string },
): ScreeningEntry {
  const entry: ScreeningEntry = {
    agentUserId,
    token: randomUUID(),
    takenOver: false,
    startedAt: Date.now(),
    notes: [],
    unattended: opts?.unattended ?? false,
    ...(opts?.callerNumber ? { callerNumber: opts.callerNumber } : {}),
  };
  entries.set(callSid, entry);
  return entry;
}

/** Remember the lead written mid-call so teardown finalizes rather than
 *  creating a duplicate. */
export function setScreeningLeadId(callSid: string, leadId: string): void {
  const entry = entries.get(callSid);
  if (entry) entry.leadId = leadId;
}

/**
 * Claim the one-time "open the lead form in the agent's browser" nav for
 * this call. Returns true the first time only. Lives on the entry (not a
 * module Set) so it's cleaned up with the rest of the call state.
 */
export function claimScreeningNavigation(callSid: string): boolean {
  const entry = entries.get(callSid);
  if (!entry || entry.navigatedToForm) return false;
  entry.navigatedToForm = true;
  return true;
}

/** Record a note line from the screening assistant (no-op when the call
 *  isn't screened). Dedupes exact repeats — the voice model may call
 *  save_caller_details several times with the same reason. */
export function appendScreeningNote(callSid: string, line: string): void {
  const entry = entries.get(callSid);
  const trimmed = line.trim();
  if (!entry || !trimmed) return;
  if (!entry.notes.includes(trimmed)) entry.notes.push(trimmed);
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
