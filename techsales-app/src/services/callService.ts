/**
 * Front-end client for `/api/ai/call/*`. Mirrors the SSE pattern in
 * `aiService.ts`'s `chat` function.
 *
 *   - `fetchToken({ userId })` → POST `/api/ai/call/token`, returns a
 *     short-lived JWT for the Twilio Voice SDK.
 *   - `openAnalyzeStream({ callSid, onEvent, signal })` → GET SSE on
 *     `/api/ai/call/analyze?callSid=...`, dispatches diarized transcript
 *     and call-status events.
 */
import type { CallStreamEvent } from '../types/call';
import { API_BASE as BASE } from '../api/apiBase';

interface FetchTokenInput {
  userId: string;
}

interface FetchTokenResult {
  token: string;
  identity: string;
  expiresAt: number;
  outboundCallerId: string;
  /** AI call screening availability (gates the incoming Screen button). */
  screeningEnabled?: boolean;
}

async function fetchToken(input: FetchTokenInput): Promise<FetchTokenResult> {
  const res = await fetch(`${BASE}/ai/call/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let msg = `Token request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      // not JSON
    }
    throw new Error(msg);
  }
  const body = (await res.json()) as {
    success: boolean;
    data?: FetchTokenResult;
    error?: string;
  };
  if (!body.success || !body.data) {
    throw new Error(body.error ?? 'Token request failed');
  }
  return body.data;
}

interface OpenAnalyzeStreamInput {
  callSid: string;
  /** Required by the per-user call-minute cap (the API rejects anonymous
   *  streams in production). */
  userId: string;
  onEvent: (event: CallStreamEvent) => void;
  signal?: AbortSignal;
}

/**
 * SSE consumer. Walks the stream, splits on `\n\n`, parses `data:` lines,
 * dispatches each event via `onEvent`. Mirrors `aiService.ts:chat` exactly.
 */
async function openAnalyzeStream(opts: OpenAnalyzeStreamInput): Promise<void> {
  const url =
    `${BASE}/ai/call/analyze?callSid=${encodeURIComponent(opts.callSid)}` +
    `&userId=${encodeURIComponent(opts.userId)}`;
  const fetchInit: RequestInit = {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
  };
  if (opts.signal) fetchInit.signal = opts.signal;
  const res = await fetch(url, fetchInit);

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('text/event-stream')) {
    let msg = `Call analyze stream failed (${res.status} ${res.statusText})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      // not JSON
    }
    throw new Error(msg);
  }
  if (!res.body) {
    throw new Error('Call analyze response had no body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (opts.signal?.aborted) {
        throw new DOMException('Call analyze stream aborted', 'AbortError');
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const record = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLines: string[] = [];
        for (const line of record.split('\n')) {
          if (line.startsWith(':')) continue;
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        if (dataLines.length > 0) {
          const payload = dataLines.join('\n');
          try {
            const ev = JSON.parse(payload) as CallStreamEvent;
            opts.onEvent(ev);
          } catch {
            // malformed event — drop
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

export const callService = {
  fetchToken,
  openAnalyzeStream,
};
