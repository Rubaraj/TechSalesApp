/**
 * Hybrid retriever: BM25 (lexical) + Qdrant ANN (semantic), fused via
 * Reciprocal Rank Fusion (RRF, k=60).
 *
 * The BM25 index for each collection is built lazily on first use, by
 * scrolling Qdrant and re-deriving searchable text from the payload via the
 * collection-specific `payloadToSearchText` helper exported from
 * `collections.ts`. This means BM25 always sees the same surface text the
 * embedder saw at index time — no separate corpus file to keep in sync.
 *
 * Filters: a flat `{ field: value }` object (equality only, with array values
 * meaning "any of"). Pushed down to Qdrant as a `must` filter, AND applied
 * to BM25 candidates before RRF so both sides honour the same constraint.
 */
import type { QdrantClient } from '@qdrant/js-client-rest';
import bm25Factory, { type BM25Engine as WinkBM25Engine } from 'wink-bm25-text-search';
import {
  COLLECTIONS,
  type CollectionKey,
  type PayloadByKey,
  payloadToSearchText,
} from './collections.js';
import { getQdrantClient } from './qdrantClient.js';
import { getEmbedder } from '../embeddings/ollamaEmbedder.js';
import { logger } from '../../config/logger.js';

// ---- public types ----

export type FilterValue = string | number | boolean;
export interface HybridFilter {
  [field: string]: FilterValue | FilterValue[];
}

export interface HybridSearchInput<K extends CollectionKey> {
  collection: K;
  query: string;
  topK: number;
  filter?: HybridFilter;
}

export interface HybridHit<P> {
  id: string;
  score: number;
  payload: P;
  sources: { vector?: number; bm25?: number };
}

// ---- BM25 corpus cache ----

interface CorpusEntry<P> {
  engine: WinkBM25Engine;
  /** id → payload map; used to apply filter + rebuild HybridHit. */
  payloadById: Map<string, P>;
}

const corpusCache = new Map<CollectionKey, CorpusEntry<unknown>>();

/** Trivial token prep: lowercase, strip non-alphanumerics, drop short tokens. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 2);
}

/** Page through Qdrant to load every point's payload for a collection. */
async function scrollAllPayloads(
  client: QdrantClient,
  collectionName: string,
): Promise<Array<{ id: string | number; payload: Record<string, unknown> }>> {
  const out: Array<{ id: string | number; payload: Record<string, unknown> }> = [];
  // Qdrant `next_page_offset` is a richer union (string | number | record |
  // null) — we round-trip whatever the server returns without inspecting it.
  let offset: string | number | Record<string, unknown> | null | undefined = undefined;
  // Cap scroll passes — defensive against runaway loops on a corrupt index.
  for (let i = 0; i < 1000; i++) {
    const page = await client.scroll(collectionName, {
      limit: 256,
      with_payload: true,
      with_vector: false,
      ...(offset !== undefined && offset !== null ? { offset: offset as string | number } : {}),
    });
    for (const pt of page.points) {
      if (pt.payload) out.push({ id: pt.id, payload: pt.payload });
    }
    if (page.next_page_offset === null || page.next_page_offset === undefined) break;
    offset = page.next_page_offset;
  }
  return out;
}

async function loadCorpus<K extends CollectionKey>(
  key: K,
): Promise<CorpusEntry<PayloadByKey[K]>> {
  const cached = corpusCache.get(key);
  if (cached) return cached as CorpusEntry<PayloadByKey[K]>;

  const def = COLLECTIONS[key];
  const client = getQdrantClient();
  const points = await scrollAllPayloads(client, def.name);
  const textOf = payloadToSearchText(key);

  const engine = bm25Factory();
  engine.defineConfig({ fldWeights: { text: 1 } });
  engine.definePrepTasks([tokenize]);

  const payloadById = new Map<string, PayloadByKey[K]>();
  for (const pt of points) {
    const id = String(pt.id);
    const payload = pt.payload as PayloadByKey[K];
    payloadById.set(id, payload);
    const text = textOf(payload);
    if (text && text.trim().length > 0) {
      engine.addDoc({ text }, id);
    }
  }

  // wink-bm25 errors if you call consolidate() with zero docs. Skip it for
  // empty collections (FAQs in Phase 2) — semantic-only mode still works.
  if (payloadById.size > 0) {
    try {
      engine.consolidate();
    } catch (err) {
      logger.warn(
        { err, collection: def.name },
        'BM25 consolidate failed — falling back to vector-only for this collection',
      );
    }
  }

  const entry: CorpusEntry<PayloadByKey[K]> = { engine, payloadById };
  corpusCache.set(key, entry as CorpusEntry<unknown>);
  logger.info(
    { collection: def.name, docs: payloadById.size },
    'BM25 corpus loaded',
  );
  return entry;
}

/** Test seam — drop all cached BM25 corpora. */
export const __resetCorpusCacheForTests = (): void => {
  corpusCache.clear();
};

// ---- filter handling ----

interface QdrantFilter {
  must: Array<{ key: string; match: { value: FilterValue } | { any: FilterValue[] } }>;
}

function toQdrantFilter(filter?: HybridFilter): QdrantFilter | undefined {
  if (!filter) return undefined;
  const must: QdrantFilter['must'] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      must.push({ key, match: { any: value } });
    } else {
      must.push({ key, match: { value } });
    }
  }
  return must.length > 0 ? { must } : undefined;
}

function payloadMatchesFilter(payload: Record<string, unknown>, filter?: HybridFilter): boolean {
  if (!filter) return true;
  for (const [key, value] of Object.entries(filter)) {
    const actual = payload[key];
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      if (!value.includes(actual as FilterValue)) return false;
    } else {
      if (actual !== value) return false;
    }
  }
  return true;
}

// ---- hybrid search ----

const RRF_K = 60;

/** Ceiling on the embedding call (see the note at its call site). */
const EMBED_TIMEOUT_MS = 5_000;

/**
 * Reject after `ms`. The losing promise is NOT cancelled — it settles later
 * and is ignored, which is fine here: the Qdrant SDK self-aborts and a
 * stray embed result is harmless.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

export async function hybridSearch<K extends CollectionKey>(
  input: HybridSearchInput<K>,
): Promise<Array<HybridHit<PayloadByKey[K]>>> {
  const { collection, query, topK, filter } = input;
  const def = COLLECTIONS[collection];
  const candidatesPerSide = Math.max(topK * 3, 15);

  // ---- semantic side ----
  const client = getQdrantClient();
  let vectorRanking: Array<{ id: string; score: number; payload: PayloadByKey[K] }> = [];
  try {
    // The embedder (Ollama) has no timeout of its own — a host that accepts
    // the socket and then stalls would block this call forever, which on a
    // live voice call means silence until the caller gives up.
    const queryVector = await withTimeout(
      getEmbedder().embedQuery(query),
      EMBED_TIMEOUT_MS,
      'embedQuery',
    );
    const qfilter = toQdrantFilter(filter);
    const hits = await client.search(def.name, {
      vector: queryVector,
      limit: candidatesPerSide,
      with_payload: true,
      ...(qfilter ? { filter: qfilter } : {}),
    });
    vectorRanking = hits.map((h) => ({
      id: String(h.id),
      score: typeof h.score === 'number' ? h.score : 0,
      payload: (h.payload ?? {}) as PayloadByKey[K],
    }));
  } catch (err) {
    logger.warn({ err, collection: def.name }, 'Qdrant vector search failed; using BM25 only');
  }

  // ---- lexical side ----
  let bm25Ranking: Array<{ id: string; score: number; payload: PayloadByKey[K] }> = [];
  try {
    const corpus = await loadCorpus(collection);
    if (corpus.payloadById.size > 0) {
      const raw = corpus.engine.search(query, candidatesPerSide * 2);
      const filtered: Array<{ id: string; score: number; payload: PayloadByKey[K] }> = [];
      for (const [id, score] of raw) {
        const payload = corpus.payloadById.get(String(id));
        if (!payload) continue;
        if (!payloadMatchesFilter(payload as unknown as Record<string, unknown>, filter)) continue;
        filtered.push({ id: String(id), score, payload });
        if (filtered.length >= candidatesPerSide) break;
      }
      bm25Ranking = filtered;
    }
  } catch (err) {
    logger.warn({ err, collection: def.name }, 'BM25 search failed; using vector only');
  }

  // ---- RRF fusion ----
  const fused = new Map<
    string,
    { payload: PayloadByKey[K]; rrf: number; vectorScore?: number; bm25Score?: number }
  >();

  vectorRanking.forEach((hit, rank) => {
    const entry = fused.get(hit.id) ?? { payload: hit.payload, rrf: 0 };
    entry.rrf += 1 / (RRF_K + rank + 1);
    entry.vectorScore = hit.score;
    entry.payload = hit.payload;
    fused.set(hit.id, entry);
  });
  bm25Ranking.forEach((hit, rank) => {
    const entry = fused.get(hit.id) ?? { payload: hit.payload, rrf: 0 };
    entry.rrf += 1 / (RRF_K + rank + 1);
    entry.bm25Score = hit.score;
    if (!fused.get(hit.id)) entry.payload = hit.payload;
    fused.set(hit.id, entry);
  });

  const merged: Array<HybridHit<PayloadByKey[K]>> = Array.from(fused.entries()).map(
    ([id, e]) => ({
      id,
      score: e.rrf,
      payload: e.payload,
      sources: {
        ...(e.vectorScore !== undefined ? { vector: e.vectorScore } : {}),
        ...(e.bm25Score !== undefined ? { bm25: e.bm25Score } : {}),
      },
    }),
  );

  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, topK);
}
