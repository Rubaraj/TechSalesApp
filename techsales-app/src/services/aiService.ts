/**
 * AI service — front-end gateway for /api/ai/* endpoints.
 *
 * Phase 3 ships the `recommend` flow with a 24h localStorage cache (keyed by
 * leadId).
 *
 * Phase 4 adds:
 *   - `explain(planId, mode)` — Plan Explainer (agent | member modes).
 *   - `search(query)`         — Natural-language plan search.
 *   - `compare(planIds[])`    — 2-4 plan diff with AI narrative.
 *   - `drugCoverage(...)`     — Per-(plan, drug) coverage Q&A.
 *
 * Phase 5 will add `chat()` (streaming).
 */
import { aiPost } from '../api/aiClient';
import type { ServiceResponse } from './baseService';
import type {
  AIRecommendation,
  AIExplanation,
  AISearchResult,
  AIComparison,
  AIDrugAnswer,
  ChatMessage,
  ChatStreamEvent,
} from '../types/ai';
import { recommendationCache } from './recommendationCache';

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export interface RecommendOptions {
  userId?: string;
  /** When true, bypass the localStorage cache. */
  force?: boolean;
}

export interface RecommendRequestBody {
  leadId: string;
  userId?: string;
}

export type RecommendResponseData = AIRecommendation & { interactionId?: string };
export type ExplainResponseData = AIExplanation & { interactionId?: string };
export type SearchResponseData = AISearchResult & { interactionId?: string };
export type CompareResponseData = AIComparison & { interactionId?: string };
export type DrugCoverageResponseData = AIDrugAnswer & { interactionId?: string };

export interface AiCallOptions {
  userId?: string;
}

async function recommend(
  leadId: string,
  opts: RecommendOptions = {},
): Promise<ServiceResponse<RecommendResponseData>> {
  if (!opts.force) {
    const cached = recommendationCache.get(leadId);
    if (cached) {
      return { success: true, data: cached };
    }
  }

  const body: RecommendRequestBody = {
    leadId,
    ...(opts.userId ? { userId: opts.userId } : {}),
  };
  const res = await aiPost<RecommendResponseData>('/recommend', body);
  if (res.success && res.data) {
    recommendationCache.set(leadId, res.data);
  }
  return res;
}

async function explain(
  planId: string,
  mode: 'agent' | 'member',
  opts: AiCallOptions = {},
): Promise<ServiceResponse<ExplainResponseData>> {
  return aiPost<ExplainResponseData>('/explain', {
    planId,
    mode,
    ...(opts.userId ? { userId: opts.userId } : {}),
  });
}

async function search(
  query: string,
  opts: AiCallOptions = {},
): Promise<ServiceResponse<SearchResponseData>> {
  return aiPost<SearchResponseData>('/search', {
    query,
    ...(opts.userId ? { userId: opts.userId } : {}),
  });
}

async function compare(
  planIds: string[],
  opts: AiCallOptions = {},
): Promise<ServiceResponse<CompareResponseData>> {
  return aiPost<CompareResponseData>('/compare', {
    planIds,
    ...(opts.userId ? { userId: opts.userId } : {}),
  });
}

async function drugCoverage(
  leadId: string | null,
  planIds: string[],
  drugIds: string[],
  opts: AiCallOptions = {},
): Promise<ServiceResponse<DrugCoverageResponseData>> {
  return aiPost<DrugCoverageResponseData>('/drug-coverage', {
    ...(leadId ? { leadId } : {}),
    planIds,
    drugIds,
    ...(opts.userId ? { userId: opts.userId } : {}),
  });
}

export interface ChatStreamInput {
  memberId: string;
  planId: string;
  history: ChatMessage[];
  message: string;
  userId?: string;
}

export interface ChatStreamOptions {
  /** Called for every parsed `ChatStreamEvent`. */
  onEvent: (event: ChatStreamEvent) => void;
  /** When fired, aborts the in-flight fetch. */
  signal?: AbortSignal;
}

/**
 * SSE chat client. Posts to `/api/ai/chat`, then walks the streaming body,
 * splitting on the SSE record terminator (`\n\n`) and dispatching each
 * `data: {...}` line via `onEvent`. Comment lines (starting with `:`) used
 * for heartbeats are silently ignored.
 *
 * Errors:
 *   - Pre-stream HTTP errors (e.g. 503 when ANTHROPIC_API_KEY is empty) come
 *     back as a JSON `{ success: false, error: '...' }` body. We parse and
 *     throw so the caller can render a toast.
 *   - Mid-stream, the backend writes `{ type: 'error', error: '...' }` events;
 *     those are forwarded to `onEvent` like any other event.
 *   - When `signal.aborted`, we stop reading and throw a DOMException so the
 *     caller can distinguish abort from server errors.
 */
async function chat(input: ChatStreamInput, opts: ChatStreamOptions): Promise<void> {
  const url = `${BASE}/ai/chat`;
  const fetchInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      memberId: input.memberId,
      planId: input.planId,
      history: input.history,
      message: input.message,
      ...(input.userId ? { userId: input.userId } : {}),
    }),
  };
  if (opts.signal) {
    fetchInit.signal = opts.signal;
  }
  const res = await fetch(url, fetchInit);

  // Pre-stream error: backend bailed before flipping the response into
  // text/event-stream mode. Body is JSON; surface a clean error.
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('text/event-stream')) {
    let errMsg = `Chat request failed (${res.status} ${res.statusText})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) errMsg = body.error;
    } catch {
      // not JSON — leave the default message
    }
    throw new Error(errMsg);
  }
  if (!res.body) {
    throw new Error('Chat response had no body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (opts.signal?.aborted) {
        throw new DOMException('Chat stream aborted', 'AbortError');
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE messages are separated by a blank line. Walk forward, slicing
      // out each completed record. Anything after the last `\n\n` stays in
      // the buffer for the next read.
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const record = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLines: string[] = [];
        for (const line of record.split('\n')) {
          if (line.startsWith(':')) continue; // SSE comment / heartbeat
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        if (dataLines.length > 0) {
          const payload = dataLines.join('\n');
          try {
            const ev = JSON.parse(payload) as ChatStreamEvent;
            opts.onEvent(ev);
          } catch {
            // Malformed event — drop silently rather than break the stream.
          }
        }
        sep = buffer.indexOf('\n\n');
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}

export const aiService = {
  recommend,
  explain,
  search,
  compare,
  drugCoverage,
  chat,
};
