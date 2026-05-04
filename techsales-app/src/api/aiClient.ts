/**
 * AI HTTP client. Mirrors `apiClient.ts` but routed at `/api/ai/*` and
 * deliberately separate so that AI-specific concerns (longer timeouts later,
 * SSE streaming, abort signals) don't bleed into the generic CRUD client.
 *
 * Phase 1 ships only `aiPost` (request/response JSON). Phase 5 will fill in
 * `aiPostStream` for SSE-based chat — the signature is fixed now so callers
 * don't have to be rewritten when streaming arrives.
 */
import type { ServiceResponse } from '../services/baseService';

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export async function aiPost<T>(path: string, body: unknown): Promise<ServiceResponse<T>> {
  const res = await fetch(`${BASE}/ai${normalizePath(path)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  // Even on a non-2xx the backend should return a ServiceResponse-shaped body
  // (see ai.routes.ts AI_DISABLED guard). Parse defensively.
  try {
    return (await res.json()) as ServiceResponse<T>;
  } catch {
    return {
      success: false,
      error: `AI request failed (${res.status} ${res.statusText})`,
    };
  }
}

/**
 * Phase 5 stub for SSE streaming. Phase 1 callers should NOT use this — it
 * exists so the public surface is stable from day one. When the backend
 * grows the SSE handler, this becomes a thin EventSource wrapper.
 */
export async function aiPostStream<T>(
  path: string,
  body: unknown,
  onChunk: (chunk: T) => void,
): Promise<ServiceResponse<{ done: true }>> {
  // Intentionally unused in Phase 1 — referenced for the public type surface.
  void path;
  void body;
  void onChunk;
  return {
    success: false,
    error: 'aiPostStream is not implemented until Phase 5 (chat streaming).',
  };
}

const normalizePath = (p: string): string => (p.startsWith('/') ? p : `/${p}`);
