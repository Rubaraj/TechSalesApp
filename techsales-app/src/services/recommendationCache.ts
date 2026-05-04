/**
 * 24h-TTL localStorage cache for /api/ai/recommend results, keyed by leadId.
 * Stale entries are auto-pruned on read so a long-running tab doesn't
 * accumulate dead keys.
 */
import type { AIRecommendation } from '../types/ai';

const PREFIX = 'medhub-rec-';
const TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEnvelope {
  storedAt: number; // epoch ms
  value: AIRecommendation & { interactionId?: string };
}

function keyFor(leadId: string): string {
  return `${PREFIX}${leadId}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Drop expired entries across the whole namespace. */
function pruneStale(now: number): void {
  const ls = safeStorage();
  if (!ls) return;
  const keys: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  for (const k of keys) {
    const raw = ls.getItem(k);
    if (!raw) continue;
    try {
      const env = JSON.parse(raw) as CacheEnvelope;
      if (!env.storedAt || now - env.storedAt > TTL_MS) {
        ls.removeItem(k);
      }
    } catch {
      ls.removeItem(k);
    }
  }
}

export const recommendationCache = {
  get(leadId: string): (AIRecommendation & { interactionId?: string }) | null {
    const ls = safeStorage();
    if (!ls) return null;
    const now = Date.now();
    pruneStale(now);
    const raw = ls.getItem(keyFor(leadId));
    if (!raw) return null;
    try {
      const env = JSON.parse(raw) as CacheEnvelope;
      if (!env.storedAt || now - env.storedAt > TTL_MS) {
        ls.removeItem(keyFor(leadId));
        return null;
      }
      return env.value;
    } catch {
      ls.removeItem(keyFor(leadId));
      return null;
    }
  },

  set(leadId: string, value: AIRecommendation & { interactionId?: string }): void {
    const ls = safeStorage();
    if (!ls) return;
    const env: CacheEnvelope = { storedAt: Date.now(), value };
    try {
      ls.setItem(keyFor(leadId), JSON.stringify(env));
    } catch {
      // Quota errors are non-fatal — cache is a perf optimization.
    }
  },

  clear(leadId: string): void {
    const ls = safeStorage();
    if (!ls) return;
    ls.removeItem(keyFor(leadId));
  },

  clearAll(): void {
    const ls = safeStorage();
    if (!ls) return;
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) ls.removeItem(k);
  },
};
