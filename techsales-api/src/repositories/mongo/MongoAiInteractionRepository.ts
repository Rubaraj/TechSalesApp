/**
 * MongoDB-backed audit repo. Write-mostly: every /api/ai/* call invokes
 * `create(record)` exactly once (via `AuditCallbackHandler.flush`). Reads
 * are limited to ad-hoc CLI debugging + Phase 6 daily-token cap calculation
 * + the /api/ai/stats endpoint.
 */
import { getAiInteractionModel, type AiInteraction } from '../../models/aiInteraction.model.js';
import type { AiInteractionRecord } from '../../ai/llm/callbacks.js';
import type { AiStatsAggregate, AiStatsByKind } from '../types.js';
import { generateId } from '../../utils/paginate.js';

const stripInternals = (
  doc: AiInteraction & { _id?: unknown; __v?: unknown },
): AiInteraction => {
  const { _id: _i, __v: _v, ...rest } = doc as unknown as Record<string, unknown>;
  return rest as unknown as AiInteraction;
};

export class MongoAiInteractionRepository {
  private model() {
    return getAiInteractionModel();
  }

  async create(input: AiInteractionRecord): Promise<AiInteraction> {
    const interactionId = input.interactionId || generateId('AI');
    const record: AiInteraction = { ...input, interactionId };
    const created = await this.model().create(record);
    return stripInternals(created.toJSON() as AiInteraction);
  }

  async findRecent(limit = 25, kind?: string): Promise<AiInteraction[]> {
    const query: Record<string, unknown> = {};
    if (kind) query.kind = kind;
    const docs = await this.model()
      .find(query)
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(limit, 200)))
      .lean<AiInteraction[]>()
      .exec();
    return docs.map(stripInternals);
  }

  /**
   * Sum (tokensIn + tokensOut - cachedInputTokens) for `provider` since
   * `sinceMs` (epoch ms). Used by the daily token-cap middleware. Negative
   * results are clamped to 0 — defensive against malformed audit rows.
   */
  async sumTokens(provider: string, sinceMs: number): Promise<number> {
    const sinceIso = new Date(sinceMs).toISOString();
    const result = await this.model().aggregate<{
      _id: null;
      tokensIn: number;
      tokensOut: number;
      cachedInputTokens: number;
    }>([
      { $match: { provider, createdAt: { $gte: sinceIso } } },
      {
        $group: {
          _id: null,
          tokensIn: { $sum: { $ifNull: ['$tokensIn', 0] } },
          tokensOut: { $sum: { $ifNull: ['$tokensOut', 0] } },
          cachedInputTokens: { $sum: { $ifNull: ['$cachedInputTokens', 0] } },
        },
      },
    ]);
    if (result.length === 0) return 0;
    const row = result[0];
    if (!row) return 0;
    const total = row.tokensIn + row.tokensOut - row.cachedInputTokens;
    return total > 0 ? total : 0;
  }

  /**
   * Aggregate the last 24h of /api/ai/* calls into a single summary row plus
   * a per-kind breakdown. Used by the read-only /api/ai/stats endpoint.
   *
   * `latencyP50` / `latencyP95` are computed in-memory from the latency array
   * because Mongo's `$percentile` requires an Atlas-only operator on older
   * server versions and we want this to work against the local Pi cluster.
   */
  async aggregateLast24h(): Promise<AiStatsAggregate> {
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const docs = await this.model()
      .find({ createdAt: { $gte: sinceIso } })
      .select('kind tokensIn tokensOut cachedInputTokens cachedReadTokens latencyMs error')
      .lean<
        Array<{
          kind: string;
          tokensIn?: number;
          tokensOut?: number;
          cachedInputTokens?: number;
          cachedReadTokens?: number;
          latencyMs?: number;
          error?: string;
        }>
      >()
      .exec();
    return summarize(docs);
  }
}

/** Shared in-memory aggregator used by both repos. Keeps the maths in one place. */
export function summarize(
  rows: Array<{
    kind: string;
    tokensIn?: number;
    tokensOut?: number;
    cachedInputTokens?: number;
    cachedReadTokens?: number;
    latencyMs?: number;
    error?: string;
  }>,
): AiStatsAggregate {
  const totals = {
    totalCalls: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalCachedInput: 0,
    totalCachedRead: 0,
    errors: 0,
  };
  const latencies: number[] = [];
  const byKind = new Map<string, AiStatsByKind>();
  for (const row of rows) {
    totals.totalCalls += 1;
    const ti = row.tokensIn ?? 0;
    const to = row.tokensOut ?? 0;
    const ci = row.cachedInputTokens ?? 0;
    const cr = row.cachedReadTokens ?? 0;
    const lat = row.latencyMs ?? 0;
    totals.totalTokensIn += ti;
    totals.totalTokensOut += to;
    totals.totalCachedInput += ci;
    totals.totalCachedRead += cr;
    if (row.error) totals.errors += 1;
    if (lat > 0) latencies.push(lat);
    const kindRow =
      byKind.get(row.kind) ??
      ({
        kind: row.kind,
        calls: 0,
        tokensIn: 0,
        tokensOut: 0,
        cachedInput: 0,
        cachedRead: 0,
        errors: 0,
      } satisfies AiStatsByKind);
    kindRow.calls += 1;
    kindRow.tokensIn += ti;
    kindRow.tokensOut += to;
    kindRow.cachedInput += ci;
    kindRow.cachedRead += cr;
    if (row.error) kindRow.errors += 1;
    byKind.set(row.kind, kindRow);
  }
  const sortedLat = [...latencies].sort((a, b) => a - b);
  const pct = (p: number): number => {
    if (sortedLat.length === 0) return 0;
    const idx = Math.min(sortedLat.length - 1, Math.floor((p / 100) * sortedLat.length));
    return sortedLat[idx] ?? 0;
  };
  const cacheHitRatio = totals.totalTokensIn > 0
    ? totals.totalCachedRead / totals.totalTokensIn
    : 0;
  const errorRate = totals.totalCalls > 0 ? totals.errors / totals.totalCalls : 0;
  return {
    windowMs: 24 * 60 * 60 * 1000,
    totalCalls: totals.totalCalls,
    totalTokensIn: totals.totalTokensIn,
    totalTokensOut: totals.totalTokensOut,
    totalCachedInput: totals.totalCachedInput,
    totalCachedRead: totals.totalCachedRead,
    cacheHitRatio,
    errors: totals.errors,
    errorRate,
    latencyP50Ms: pct(50),
    latencyP95Ms: pct(95),
    byKind: [...byKind.values()].sort((a, b) => b.calls - a.calls),
  };
}
