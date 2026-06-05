/**
 * Phase 4b (M5) — Thin REST client for Qdrant.
 *
 * Stateless module functions. No SDK dependency — we POST/PUT JSON to
 * `env.QDRANT_URL` via global `fetch`. Vectors are 768-dim cosine; one
 * Qdrant collection per indexed source.
 *
 * Reachability is cached for 30 s so tool calls don't hammer Qdrant on
 * every chat turn (relevant when the user is in JSON-mode or Qdrant is
 * temporarily down — see the JSON_mode + Qdrant_down fallbacks in the
 * semantic search tools, M5 Step 8).
 */
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/** Standard 768-dim source set. Centralized so the embedding worker, the
 *  backfill scripts, and the search tools all agree on collection names. */
export type QdrantCollection = 'leads' | 'transcripts' | 'plans' | 'drugs';

export const QDRANT_COLLECTIONS: readonly QdrantCollection[] = [
  'leads',
  'transcripts',
  'plans',
  'drugs',
] as const;

/** Cosine distance + Ollama nomic-embed-text dim (see AI_EMBED_DIM in env). */
const VECTOR_DIM = 768;
const DISTANCE = 'Cosine' as const;

/** Request timeout for all Qdrant calls. Qdrant is local on the laptop so
 *  the worst-case latency is small; tight timeout surfaces config issues
 *  fast (e.g. wrong port, container down). */
const REQUEST_TIMEOUT_MS = 5_000;

export interface QdrantPoint {
  /** MUST be a UUID — derive from the source doc's natural key via
   *  `pointIdFor(collection, sourceId)`. Qdrant only accepts UUIDs or
   *  unsigned ints, not arbitrary strings like 'LEAD-001'. */
  id: string;
  vector: number[];
  /** Display + filter metadata: enough for the search tool to render a
   *  bulleted result without a second Mongo round-trip. MUST include
   *  `sourceId` so callers can resolve back to the original natural key
   *  (the helper functions take care of this). */
  payload: Record<string, unknown>;
}

/**
 * Deterministic UUID v5 derived from `${collection}:${sourceId}`. Same
 * collection + same sourceId always returns the same UUID, so subsequent
 * embeddings of the same doc upsert in place rather than duplicating.
 *
 * Why not just use the natural key? Qdrant's point-id format only accepts
 * UUIDs or unsigned ints — see https://qdrant.tech/documentation/concepts/points/.
 * Our natural keys (LEAD-001, callSid, planId) don't satisfy either, so we
 * hash them.
 */
export function pointIdFor(collection: QdrantCollection, sourceId: string): string {
  const hash = createHash('sha1').update(`${collection}:${sourceId}`).digest();
  // Force the right version + variant bits for a valid UUID v5 string.
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export interface QdrantSearchHit {
  id: string | number;
  score: number;
  payload: Record<string, unknown> | null;
}

/** Subset of Qdrant's filter spec we actually use (must / should clauses
 *  with field/value match). Documented at
 *  https://qdrant.tech/documentation/concepts/filtering/. */
export interface QdrantFilter {
  must?: Array<{ key: string; match: { value: string | number | boolean } }>;
  should?: Array<{ key: string; match: { value: string | number | boolean } }>;
}

// ---------------------------------------------------------------------------
// Low-level request helper
// ---------------------------------------------------------------------------

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (env.QDRANT_API_KEY) headers['api-key'] = env.QDRANT_API_KEY;
  return headers;
}

interface RequestOpts {
  method: 'GET' | 'PUT' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
  /** When false, a non-2xx is treated as a soft error (caller handles).
   *  Default true → throws on non-2xx. */
  throwOnError?: boolean;
}

async function request<T = unknown>(opts: RequestOpts): Promise<T> {
  const url = `${env.QDRANT_URL}${opts.path}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: opts.method,
      headers: buildHeaders(),
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ac.signal,
    });
    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as { result?: unknown; status?: unknown }) : {};
    if (!res.ok && opts.throwOnError !== false) {
      throw new Error(`Qdrant ${opts.method} ${opts.path} → ${res.status}: ${text.slice(0, 200)}`);
    }
    // Qdrant wraps everything in `{ result, status, time }`. Unwrap when present.
    return (parsed.result ?? parsed) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Reachability — 30s cache
// ---------------------------------------------------------------------------

interface ReachabilityCache {
  ok: boolean;
  checkedAt: number;
}
let reachCache: ReachabilityCache | null = null;
const REACH_CACHE_MS = 30_000;

/**
 * Returns true if Qdrant's `/healthz` returns 200 within REQUEST_TIMEOUT_MS.
 * Cached for 30 s so the semantic-search tools (which call this on every
 * tool invocation) don't add network round-trips to every chat turn.
 * Pass `{ force: true }` to bypass the cache (e.g. on boot).
 */
export async function isReachable(opts: { force?: boolean } = {}): Promise<boolean> {
  const now = Date.now();
  if (!opts.force && reachCache && now - reachCache.checkedAt < REACH_CACHE_MS) {
    return reachCache.ok;
  }
  const ok = await checkHealth();
  reachCache = { ok, checkedAt: now };
  return ok;
}

async function checkHealth(): Promise<boolean> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${env.QDRANT_URL}/healthz`, { signal: ac.signal });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.debug({ err, url: env.QDRANT_URL }, 'Qdrant healthz failed');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/**
 * Idempotent — if the collection already exists, Qdrant returns 200 and we
 * exit cleanly. If it's missing, Qdrant returns 200 after creating it
 * (and a 409 if there's a config mismatch, which we surface).
 *
 * Called on boot for each of QDRANT_COLLECTIONS so the server self-bootstraps.
 */
export async function ensureCollection(name: QdrantCollection): Promise<void> {
  // Probe first — saves a config-mismatch round-trip in the common case.
  const exists = await collectionExists(name);
  if (exists) return;
  await request({
    method: 'PUT',
    path: `/collections/${name}`,
    body: {
      vectors: { size: VECTOR_DIM, distance: DISTANCE },
    },
  });
  logger.info({ collection: name, dim: VECTOR_DIM }, 'Qdrant collection created');
}

async function collectionExists(name: QdrantCollection): Promise<boolean> {
  try {
    await request({ method: 'GET', path: `/collections/${name}` });
    return true;
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('404') || msg.includes('Not found')) return false;
    throw err;
  }
}

/** Diagnostic — used by the dev reindex route and by the boot log. */
export async function collectionInfo(name: QdrantCollection): Promise<{
  pointsCount: number;
  vectorsCount: number;
  status: string;
}> {
  const info = await request<{
    points_count?: number;
    vectors_count?: number;
    status?: string;
  }>({ method: 'GET', path: `/collections/${name}` });
  return {
    pointsCount: info.points_count ?? 0,
    vectorsCount: info.vectors_count ?? 0,
    status: info.status ?? 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Points — upsert / search / retrieve / delete
// ---------------------------------------------------------------------------

/**
 * Batched upsert. Qdrant's payload limit is generous (~32 MB) but we cap
 * per-batch at 100 points so a backfill failure doesn't lose a 1000-point
 * batch; just the failed chunk retries.
 *
 * `wait: true` makes Qdrant flush to disk before returning. Worth the
 * latency for a POC — guarantees that a search-immediately-after-upsert
 * call sees the new vector. Tweak to `false` for high-throughput later.
 */
export async function upsert(
  collection: QdrantCollection,
  points: QdrantPoint[],
): Promise<void> {
  if (points.length === 0) return;
  const BATCH_SIZE = 100;
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await request({
      method: 'PUT',
      path: `/collections/${collection}/points?wait=true`,
      body: { points: batch },
    });
  }
}

export async function search(
  collection: QdrantCollection,
  vector: number[],
  topK: number,
  filter?: QdrantFilter,
): Promise<QdrantSearchHit[]> {
  const body: Record<string, unknown> = {
    vector,
    limit: topK,
    with_payload: true,
  };
  if (filter) body.filter = filter;
  const hits = await request<QdrantSearchHit[]>({
    method: 'POST',
    path: `/collections/${collection}/points/search`,
    body,
  });
  return hits;
}

/**
 * Fetch a single stored point (vector + payload) by sourceId. Used by
 * `findSimilarLeads` to grab the source lead's vector before running its
 * similarity search. Returns null when the id isn't in the collection
 * (e.g. the lead exists in Mongo but hasn't been embedded yet).
 */
export async function retrieveBySourceId(
  collection: QdrantCollection,
  sourceId: string,
): Promise<{ vector: number[]; payload: Record<string, unknown> | null } | null> {
  const id = pointIdFor(collection, sourceId);
  try {
    const result = await request<Array<{ vector?: number[]; payload?: Record<string, unknown> }>>({
      method: 'POST',
      path: `/collections/${collection}/points`,
      body: { ids: [id], with_vector: true, with_payload: true },
    });
    const point = result?.[0];
    if (!point || !point.vector) return null;
    return { vector: point.vector, payload: point.payload ?? null };
  } catch (err) {
    logger.debug({ err, collection, sourceId }, 'Qdrant retrieve failed');
    return null;
  }
}

/** Delete by source ids (we translate to UUIDs internally). */
export async function deleteBySourceIds(
  collection: QdrantCollection,
  sourceIds: string[],
): Promise<void> {
  if (sourceIds.length === 0) return;
  const points = sourceIds.map((s) => pointIdFor(collection, s));
  await request({
    method: 'POST',
    path: `/collections/${collection}/points/delete?wait=true`,
    body: { points },
  });
}

// ---------------------------------------------------------------------------
// Boot helpers
// ---------------------------------------------------------------------------

/**
 * Boot-time bootstrap: ping Qdrant, ensure all known collections exist, log
 * counts. Safe to call even when Qdrant is unreachable — logs a warning
 * and returns false (semantic tools then degrade to "unavailable"). Called
 * from `index.ts` after Mongo connects.
 */
export async function bootstrapQdrant(): Promise<boolean> {
  const ok = await isReachable({ force: true });
  if (!ok) {
    logger.warn(
      { url: env.QDRANT_URL },
      'Qdrant unreachable at boot — semantic search will report unavailable until it comes up',
    );
    return false;
  }
  for (const name of QDRANT_COLLECTIONS) {
    try {
      await ensureCollection(name);
    } catch (err) {
      logger.error({ err, collection: name }, 'Failed to ensure Qdrant collection');
    }
  }
  // Log counts so cold-start logs reveal "I'm searchable" / "I'm empty".
  for (const name of QDRANT_COLLECTIONS) {
    try {
      const info = await collectionInfo(name);
      logger.info({ collection: name, ...info }, 'Qdrant collection ready');
    } catch {
      // ignore — collectionInfo errors are logged inside ensureCollection
    }
  }
  return true;
}
