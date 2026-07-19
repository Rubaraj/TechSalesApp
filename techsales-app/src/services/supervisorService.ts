/**
 * QA + Supervisor pipelines — FE client for the admin QA endpoints and the
 * live supervisor SSE stream (hand-rolled reader, mirrors callService's).
 */
import type {
  CallRecordDetail,
  CallRecordSummary,
  QaReview,
  SupervisorEvent,
} from '../types/supervisor';
import { API_BASE as BASE } from '../api/apiBase';

export async function listCalls(opts: {
  userId: string;
  flaggedOnly?: boolean;
  agentUserId?: string;
  limit?: number;
}): Promise<CallRecordSummary[]> {
  const params = new URLSearchParams({ userId: opts.userId });
  if (opts.flaggedOnly) params.set('flaggedOnly', 'true');
  if (opts.agentUserId) params.set('agentUserId', opts.agentUserId);
  if (opts.limit) params.set('limit', String(opts.limit));
  const res = await fetch(`${BASE}/ai/qa/calls?${params.toString()}`);
  if (!res.ok) throw new Error(`Call list failed (${res.status})`);
  const body = (await res.json()) as { success: boolean; data?: { calls: CallRecordSummary[] } };
  return body.success ? (body.data?.calls ?? []) : [];
}

export interface GetCallResult {
  /** Null on any failure — check `status` for why. */
  record: CallRecordDetail | null;
  /** HTTP status; 0 = network error (fetch threw), 200 on success. */
  status: number;
}

export async function getCall(userId: string, callSid: string): Promise<GetCallResult> {
  let res: Response;
  try {
    res = await fetch(
      `${BASE}/ai/qa/calls/${encodeURIComponent(callSid)}?userId=${encodeURIComponent(userId)}`,
    );
  } catch {
    return { record: null, status: 0 };
  }
  if (!res.ok) return { record: null, status: res.status };
  const body = (await res.json()) as { success: boolean; data?: CallRecordDetail };
  if (!body.success || !body.data) return { record: null, status: 500 };
  return { record: body.data, status: 200 };
}

export async function runQaReview(
  userId: string,
  callSid: string,
): Promise<{ scorecard: QaReview } | { error: string; status: number }> {
  const res = await fetch(`${BASE}/ai/qa/review/${encodeURIComponent(callSid)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const body = (await res.json()) as {
    success: boolean;
    data?: { scorecard: QaReview; reviewedAt: string; model: string };
    error?: string;
  };
  if (!body.success || !body.data) {
    return { error: body.error ?? `Review failed (${res.status})`, status: res.status };
  }
  return { scorecard: { ...body.data.scorecard, reviewedAt: body.data.reviewedAt, model: body.data.model } };
}

/** Terminal stream failure — do NOT reconnect (401/403). */
export class SupervisorStreamAuthError extends Error {
  constructor(status: number) {
    super(`Supervisor stream unauthorized (${status})`);
    this.name = 'SupervisorStreamAuthError';
  }
}

export interface OpenSupervisorStreamInput {
  userId: string;
  onEvent: (event: SupervisorEvent) => void;
  /** Fired once the SSE response is confirmed (headers ok) — the moment the
   *  caller may consider the stream genuinely connected. */
  onOpen?: () => void;
  signal?: AbortSignal;
}

/** Long-lived SSE reader; resolves when the stream closes. Caller handles
 *  reconnect (see Supervision page's backoff loop). Throws
 *  SupervisorStreamAuthError on 401/403 (terminal — don't retry). */
export async function openSupervisorStream(opts: OpenSupervisorStreamInput): Promise<void> {
  const url = `${BASE}/ai/supervisor/stream?userId=${encodeURIComponent(opts.userId)}`;
  const fetchInit: RequestInit = { method: 'GET', headers: { Accept: 'text/event-stream' } };
  if (opts.signal) fetchInit.signal = opts.signal;
  const res = await fetch(url, fetchInit);

  if (res.status === 401 || res.status === 403) {
    throw new SupervisorStreamAuthError(res.status);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('text/event-stream')) {
    throw new Error(`Supervisor stream failed (${res.status})`);
  }
  if (!res.body) throw new Error('Supervisor stream had no body');
  opts.onOpen?.();

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    if (opts.signal?.aborted) return;
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const record = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of record.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try {
          opts.onEvent(JSON.parse(line.slice(5).trimStart()) as SupervisorEvent);
        } catch {
          // malformed event — skip
        }
      }
      sep = buffer.indexOf('\n\n');
    }
  }
}
