// Phase 5 — SSE smoke test for /api/ai/chat.
//
// Usage:
//   node scripts-debug/test-sse.mjs
//
// Assumes the server is up at http://localhost:4000. With ANTHROPIC_API_KEY
// empty the endpoint should respond 503 (no SSE attempted). With the key set
// to anything (real or fake) the endpoint should flip to text/event-stream
// and we should see at least one frame — a token, tool_start, error, or final
// — before the connection closes.

const BASE = process.env.SSE_BASE ?? 'http://localhost:4000';
const ENDPOINT = `${BASE}/api/ai/chat`;

const body = {
  memberId: 'M-TEST',
  planId: 'P-TEST',
  history: [],
  message: 'Hi, can you tell me what my plan covers?',
};

const log = (label, v) => console.log(`\n=== ${label} ===\n` + (typeof v === 'string' ? v : JSON.stringify(v, null, 2)));

(async () => {
  log('POST', ENDPOINT);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });

  log('status', `${res.status} ${res.statusText}`);
  log('content-type', res.headers.get('content-type'));

  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const text = await res.text();
    log('body (non-stream)', text);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let frameCount = 0;
  const start = Date.now();

  const FRAME_LIMIT = 50;
  const TIMEOUT_MS = 30_000;

  while (Date.now() - start < TIMEOUT_MS) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const record = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of record.split('\n')) {
        if (line.startsWith('data:')) {
          frameCount++;
          const payload = line.slice(5).trimStart();
          try {
            const ev = JSON.parse(payload);
            log(`frame #${frameCount} (${ev.type})`, ev);
          } catch {
            log(`frame #${frameCount} (raw)`, payload);
          }
        }
      }
      sep = buffer.indexOf('\n\n');
    }

    if (frameCount >= FRAME_LIMIT) {
      log('limit', `received ${FRAME_LIMIT} frames; stopping`);
      break;
    }
  }

  try { reader.releaseLock(); } catch {}
  log('done', `frames=${frameCount} elapsedMs=${Date.now() - start}`);
})().catch((err) => {
  console.error('test-sse failed:', err);
  process.exit(1);
});
