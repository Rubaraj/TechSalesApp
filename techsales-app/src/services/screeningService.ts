/**
 * AI call screening — FE client + module-level session flags.
 *
 * The flags live at module level (not React state) because they're read
 * inside the once-bound Twilio Device handlers (`incoming`, `cancel`),
 * where context state would be a stale closure:
 *   - screeningActive: the ring-window 'cancel' that follows the Screen
 *     redirect is EXPECTED — don't tear the panel down.
 *   - takeoverPending: the next incoming invite is the takeover leg —
 *     auto-accept it, no ringtone, no INCOMING_RINGING (which would wipe
 *     the screening transcript).
 */
import { API_BASE } from '../api/apiBase';

let enabled = false;
let screeningActive = false;
let takeoverPending = false;

export const setScreeningEnabled = (v: boolean): void => {
  enabled = v;
};
export const isScreeningEnabled = (): boolean => enabled;
export const setScreeningActive = (v: boolean): void => {
  screeningActive = v;
};
export const isScreeningActive = (): boolean => screeningActive;
export const setTakeoverPending = (v: boolean): void => {
  takeoverPending = v;
};
export const isTakeoverPending = (): boolean => takeoverPending;

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function post(path: string, callSid: string, userId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/screening/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callSid, userId }),
  });
  const body = (await res.json()) as ApiEnvelope<unknown>;
  if (!body.success) throw new Error(body.error ?? `Screening ${path} failed (${res.status})`);
}

export const startScreening = (callSid: string, userId: string): Promise<void> =>
  post('start', callSid, userId);
export const takeoverScreening = (callSid: string, userId: string): Promise<void> =>
  post('takeover', callSid, userId);
export const hangupScreening = (callSid: string, userId: string): Promise<void> =>
  post('hangup', callSid, userId);
