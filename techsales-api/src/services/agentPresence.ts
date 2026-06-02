/**
 * Phase 2.6 — In-memory agent presence registry for inbound-call routing.
 *
 * Each signed-in browser heartbeats every ~30 s with `{ userId, inCall }`.
 * An agent is **online** if their last heartbeat is within `ONLINE_TTL_MS`,
 * and **available** if online + not currently in a call.
 *
 * `pickRoundRobin()` rotates a module-level pointer across the available
 * set and returns the next userId (or null when nobody is available). The
 * pointer is in-memory only — server restart resets it, which is fine; the
 * round-robin is over a small set and re-fairness is fast.
 *
 * No persistence is required. A WS-based presence model is a Phase 2.7
 * upgrade (less polling, more accurate); heartbeat is sufficient for V1.
 */
import { logger } from '../config/logger.js';

/** How fresh a heartbeat must be for an agent to count as online. */
const ONLINE_TTL_MS = 60_000;

interface PresenceRecord {
  lastSeen: number; // epoch ms
  inCall: boolean;
}

const presence = new Map<string, PresenceRecord>();
let rrPointer = 0;

/**
 * Record (or refresh) an agent's presence. Called from the
 * `/api/presence/heartbeat` endpoint. Idempotent — pure last-write-wins.
 */
export function heartbeat(userId: string, inCall: boolean): void {
  presence.set(userId, { lastSeen: Date.now(), inCall });
}

/** Mark an agent fully offline (heartbeat stopped or explicit logout). */
export function clearPresence(userId: string): void {
  presence.delete(userId);
}

/** Snapshot of every currently-online agent and their in-call flag. */
export function listOnline(): Array<{ userId: string; inCall: boolean }> {
  const cutoff = Date.now() - ONLINE_TTL_MS;
  const out: Array<{ userId: string; inCall: boolean }> = [];
  for (const [userId, rec] of presence) {
    if (rec.lastSeen >= cutoff) out.push({ userId, inCall: rec.inCall });
  }
  return out;
}

/** Subset of `listOnline()` — agents not currently in a call. */
export function listAvailable(): string[] {
  return listOnline()
    .filter((p) => !p.inCall)
    .map((p) => p.userId);
}

/**
 * Pick the next available agent in round-robin order. Returns null when
 * no agents are available (caller hears the fallback `<Say>+<Hangup/>`).
 *
 * Pointer correctness: we read the available set, sort by userId (stable
 * order across calls regardless of Map iteration), then advance the pointer
 * modulo the set size. Two near-simultaneous calls will get distinct picks
 * because the pointer increment is synchronous.
 */
export function pickRoundRobin(): string | null {
  const available = listAvailable().sort();
  if (available.length === 0) return null;
  const pick = available[rrPointer % available.length]!;
  rrPointer = (rrPointer + 1) % Number.MAX_SAFE_INTEGER;
  logger.info(
    { picked: pick, available: available.length, rrPointer },
    'agentPresence: round-robin pick',
  );
  return pick;
}

/** Dev visibility — never exposed via a public endpoint. */
export function _debugSnapshot(): {
  records: Array<{ userId: string; lastSeen: number; inCall: boolean }>;
  rrPointer: number;
} {
  return {
    records: Array.from(presence.entries()).map(([userId, r]) => ({
      userId,
      lastSeen: r.lastSeen,
      inCall: r.inCall,
    })),
    rrPointer,
  };
}
