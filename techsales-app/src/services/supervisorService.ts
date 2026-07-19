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

export async function getCall(userId: string, callSid: string): Promise<CallRecordDetail | null> {
  const res = await fetch(
    `${BASE}/ai/qa/calls/${encodeURIComponent(callSid)}?userId=${encodeURIComponent(userId)}`,
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { success: boolean; data?: CallRecordDetail };
  return body.success ? (body.data ?? null) : null;
}

export async function runQaReview(
  userId: string,
  callSid: string,
): Promise<{ scorecard: QaReview } | { error: string }> {
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
  if (!body.success || !body.data) return { error: body.error ?? `Review failed (${res.status})` };
  return { scorecard: { ...body.data.scorecard, reviewedAt: body.data.reviewedAt, model: body.data.model } };
}

export interface OpenSupervisorStreamInput {
  userId: string;
  onEvent: (event: SupervisorEvent) => void;
  signal?: AbortSignal;
}

/** Long-lived SSE reader; resolves when the stream closes. Caller handles
 *  reconnect (see Supervision page's backoff loop). */
export async function openSupervisorStream(opts: OpenSupervisorStreamInput): Promise<void> {
  const url = `${BASE}/ai/supervisor/stream?userId=${encodeURIComponent(opts.userId)}`;
  const fetchInit: RequestInit = { method: 'GET', headers: { Accept: 'text/event-stream' } };
  if (opts.signal) fetchInit.signal = opts.signal;
  const res = await fetch(url, fetchInit);

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('text/event-stream')) {
    throw new Error(`Supervisor stream failed (${res.status})`);
  }
  if (!res.body) throw new Error('Supervisor stream had no body');

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
