/**
 * Debug CLI for hybrid retrieval. Calls `hybridSearch` for one collection +
 * one query and pretty-prints the top-K hits.
 *
 * Usage:
 *   tsx src/scripts/query-qdrant.ts --collection=plans --query="low premium HMO Florida" [--topK=5] [--filter='{"states":"FL"}']
 *
 * The filter argument is JSON; values may be scalars or arrays (the array
 * form is a "match any of" — Qdrant's `MatchAny`).
 */
import { COLLECTIONS, type CollectionKey } from '../ai/vectorstore/collections.js';
import { hybridSearch, type HybridFilter } from '../ai/vectorstore/hybridRetriever.js';

interface CliArgs {
  collection: CollectionKey;
  query: string;
  topK: number;
  filter?: HybridFilter;
}

function parseArgs(argv: string[]): CliArgs {
  let collection: CollectionKey | null = null;
  let query: string | null = null;
  let topK = 5;
  let filter: HybridFilter | undefined;
  for (const a of argv.slice(2)) {
    if (a.startsWith('--collection=')) {
      const v = a.split('=', 2)[1] ?? '';
      if (!(v in COLLECTIONS)) throw new Error(`Unknown collection: ${v}`);
      collection = v as CollectionKey;
    } else if (a.startsWith('--query=')) {
      query = a.split('=', 2)[1] ?? '';
    } else if (a.startsWith('--topK=')) {
      const n = parseInt(a.split('=', 2)[1] ?? '5', 10);
      if (Number.isFinite(n) && n > 0) topK = n;
    } else if (a.startsWith('--filter=')) {
      const raw = a.split('=', 2)[1] ?? '';
      filter = JSON.parse(raw) as HybridFilter;
    } else {
      throw new Error(`Unknown CLI arg: ${a}`);
    }
  }
  if (!collection) throw new Error('--collection=<key> is required');
  if (!query) throw new Error('--query="<text>" is required');
  return { collection, query, topK, ...(filter ? { filter } : {}) };
}

function summarize(payload: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'planId',
    'planName',
    'carrier',
    'planType',
    'premium',
    'states',
    'benefitId',
    'category',
    'categoryData',
    'drugId',
    'brandName',
    'genericName',
    'drugClass',
    'tier',
    'priorAuth',
    'qtyLimit',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (payload[k] !== undefined) out[k] = payload[k];
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const hits = await hybridSearch({
    collection: args.collection,
    query: args.query,
    topK: args.topK,
    ...(args.filter ? { filter: args.filter } : {}),
  });

  // eslint-disable-next-line no-console
  console.log(
    `[query] collection=${args.collection} topK=${args.topK} query=${JSON.stringify(args.query)} filter=${JSON.stringify(args.filter ?? null)}`,
  );
  // eslint-disable-next-line no-console
  console.log(`[query] returned ${hits.length} hits`);
  hits.forEach((hit, i) => {
    // eslint-disable-next-line no-console
    console.log(
      `  #${i + 1}  rrf=${hit.score.toFixed(4)}  vector=${hit.sources.vector?.toFixed(4) ?? '–'}  bm25=${hit.sources.bm25?.toFixed(4) ?? '–'}  id=${hit.id}`,
    );
    // eslint-disable-next-line no-console
    console.log('       payload:', JSON.stringify(summarize(hit.payload as Record<string, unknown>)));
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[query] failed', err);
  process.exit(1);
});
