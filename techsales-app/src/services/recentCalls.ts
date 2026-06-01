/**
 * sessionStorage-backed recent-calls list for the Call Copilot dialer.
 * Cleared on tab close; survives navigation between routes.
 *
 *   - `addRecent(entry)`  — push to the front, dedupe by `to`, cap at 10.
 *   - `getRecent()`       — read the list (most-recent first).
 *   - `clearRecent()`     — wipe (used on logout, mirrors clearMode pattern).
 *
 * Phase 3 may switch the source to `aiInteraction.kind='call_end'` once the
 * server has a query for it; this module's API stays the same.
 */

const STORAGE_KEY = 'techsales:recent-calls';
const MAX_RECENTS = 10;

export interface RecentCallEntry {
  /** Always E.164 — `+14155551234`. */
  to: string;
  /** Lead ID if the call originated from a lead surface; otherwise undefined. */
  leadId?: string;
  /** Display name of the lead, if known at dial time. */
  leadName?: string;
  /** epoch ms when the dial was issued. */
  at: number;
}

function safeRead(): RecentCallEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentCallEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as RecentCallEntry).to === 'string' &&
        typeof (e as RecentCallEntry).at === 'number',
    );
  } catch {
    return [];
  }
}

function safeWrite(entries: RecentCallEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // sessionStorage may be unavailable (quota / privacy mode). Silently skip.
  }
}

export function addRecent(entry: RecentCallEntry): void {
  const current = safeRead();
  // Dedupe by `to` (most recent wins; the leadId / leadName from the latest
  // dial of the same number replaces older entries).
  const filtered = current.filter((e) => e.to !== entry.to);
  const next = [entry, ...filtered].slice(0, MAX_RECENTS);
  safeWrite(next);
}

export function getRecent(): RecentCallEntry[] {
  return safeRead();
}

export function clearRecent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
