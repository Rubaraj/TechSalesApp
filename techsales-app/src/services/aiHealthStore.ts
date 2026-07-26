/**
 * Gap 7 — FE-side AI degradation state (module store, no context needed).
 *
 * Two producers, one truth:
 *   - `startAiHealthPolling()` (mounted in Layout for authed api-mode
 *     sessions) polls /api/health every 30s and reads `data.llm`.
 *   - `useCallAnalysis` writes instantly when an `ai_health` SSE event
 *     arrives on the live-call stream.
 *
 * Consumers subscribe via `useAiHealth()` (useSyncExternalStore): the
 * AtlasPanel header pill and the in-call CallSection banner.
 */
import { useSyncExternalStore } from 'react';
import { API_BASE } from '../api/apiBase';

export interface AiHealthSnapshot {
  degraded: boolean;
  reason?: string;
  since?: number;
}

const HEALTHY: AiHealthSnapshot = { degraded: false };

let snapshot: AiHealthSnapshot = HEALTHY;
const listeners = new Set<() => void>();

export function setAiHealth(next: AiHealthSnapshot): void {
  // Keep the snapshot referentially stable when nothing changed —
  // useSyncExternalStore re-renders on every new object identity.
  if (next.degraded === snapshot.degraded && next.reason === snapshot.reason) return;
  snapshot = next.degraded ? next : HEALTHY;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AiHealthSnapshot {
  return snapshot;
}

export function useAiHealth(): AiHealthSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}

interface HealthLlmField {
  status?: 'ok' | 'degraded';
  reason?: string;
  sinceSec?: number;
}

/** Poll /api/health every `intervalMs`; returns a stop function. Fetch
 *  failures are swallowed — backend-down is the login flow's concern. */
export function startAiHealthPolling(intervalMs = 30_000): () => void {
  const tick = async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      const body = (await res.json()) as { data?: { llm?: HealthLlmField } };
      const llm = body.data?.llm;
      if (!llm?.status) return;
      setAiHealth(
        llm.status === 'degraded'
          ? {
              degraded: true,
              ...(llm.reason ? { reason: llm.reason } : {}),
              ...(typeof llm.sinceSec === 'number'
                ? { since: Date.now() - llm.sinceSec * 1000 }
                : {}),
            }
          : { degraded: false },
      );
    } catch {
      // Network/parse failure → keep the last known state.
    }
  };
  void tick();
  const id = window.setInterval(() => void tick(), intervalMs);
  return () => window.clearInterval(id);
}
