#!/usr/bin/env node
/**
 * Phase 6 verification — fire 31 POST /api/ai/recommend requests in a row
 * with the same userId and assert that the 31st response is a 429 with
 * `code: 'RATE_LIMITED'`.
 *
 * Doesn't need ANTHROPIC_API_KEY: the rate-limiter sits IN FRONT of the
 * `requireApiKey` check, so the bucket fills up regardless of whether the
 * downstream handler would have succeeded. (Successful AI calls and 503s
 * both consume one token from the bucket.)
 *
 * Usage:
 *   node scripts-debug/verify-phase6-ratelimit.mjs [baseUrl]
 *
 * Default base: http://localhost:4000
 */
const BASE = (process.argv[2] ?? 'http://localhost:4000').replace(/\/+$/, '');
const USER_ID = `phase6-test-${Date.now()}`;
const N = 31;

const summary = [];
let firstLimited = -1;

for (let i = 1; i <= N; i++) {
  const res = await fetch(`${BASE}/api/ai/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: USER_ID, leadId: 'L-RATELIMIT-TEST' }),
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const code = body?.code ?? null;
  summary.push({ i, status: res.status, code });
  if (res.status === 429 && firstLimited === -1) firstLimited = i;
}

const last = summary[summary.length - 1];
console.log(JSON.stringify({ userId: USER_ID, firstLimited, last, summary }, null, 2));

if (last.status !== 429 || last.code !== 'RATE_LIMITED') {
  console.error(`FAIL: expected 31st request to be 429 RATE_LIMITED, got ${last.status} ${last.code}`);
  process.exit(1);
}
console.log('PASS: rate limit fired as expected.');
