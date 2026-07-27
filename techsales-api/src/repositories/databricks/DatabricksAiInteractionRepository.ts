/**
 * Databricks-backed audit repository for /api/ai/* — same surface as
 * `MongoAiInteractionRepository`. Reuses the shared `summarize()` helper
 * from the Mongo repo so the aggregation maths stays in one place.
 */
import type { AiInteraction } from '../../models/aiInteraction.model.js';
import type { AiInteractionRecord } from '../../ai/llm/callbacks.js';
import type { AiStatsAggregate, CostRow } from '../types.js';
import { generateId } from '../../utils/paginate.js';
import { summarize } from '../mongo/MongoAiInteractionRepository.js';
import {
  APP_TABLES,
  appTable,
  selectAll,
  insertRow,
  db,
} from './databricksHelpers.js';

export class DatabricksAiInteractionRepository {
  private table(): string {
    return appTable(APP_TABLES.aiInteractions);
  }

  async create(input: AiInteractionRecord): Promise<AiInteraction> {
    const interactionId = input.interactionId || generateId('AI');
    const record: AiInteraction = { ...input, interactionId };
    await insertRow(
      this.table(),
      'interaction_id',
      interactionId,
      record,
      record.createdAt,
      undefined,
    );
    return record;
  }

  async findRecent(limit = 25, kind?: string): Promise<AiInteraction[]> {
    const cap = Math.max(1, Math.min(limit, 200));
    const all = await selectAll<AiInteraction>(this.table());
    const filtered = kind ? all.filter((r) => r.kind === kind) : all;
    return filtered
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, cap);
  }

  /**
   * Sum (tokensIn + tokensOut - cachedInputTokens) for `provider` since
   * `sinceMs`. Used by the daily token-cap middleware. SQL aggregation here
   * keeps the read efficient without pulling every row.
   */
  async sumTokens(provider: string, sinceMs: number): Promise<number> {
    const sinceIso = new Date(sinceMs).toISOString();
    const rows = await db().query<{
      tokens_in: number;
      tokens_out: number;
      cached_input: number;
    }>(
      `SELECT
         coalesce(sum(cast(get_json_object(data, '$.tokensIn') as bigint)), 0) as tokens_in,
         coalesce(sum(cast(get_json_object(data, '$.tokensOut') as bigint)), 0) as tokens_out,
         coalesce(sum(cast(get_json_object(data, '$.cachedInputTokens') as bigint)), 0) as cached_input
       FROM ${this.table()}
       WHERE get_json_object(data, '$.provider') = ?
         AND get_json_object(data, '$.createdAt') >= ?`,
      [provider, sinceIso],
    );
    const row = rows[0];
    if (!row) return 0;
    const total = Number(row.tokens_in) + Number(row.tokens_out) - Number(row.cached_input);
    return total > 0 ? total : 0;
  }

  /** AI cost analysis — payload-free rows since `sinceIso`. */
  async findForCostAnalysis(sinceIso: string): Promise<CostRow[]> {
    const rows = await db().query<{ data: string }>(
      `SELECT data FROM ${this.table()}
       WHERE get_json_object(data, '$.createdAt') >= ?`,
      [sinceIso],
    );
    return rows.map((r) => {
      const p = JSON.parse(r.data) as AiInteraction;
      const input = (p.input ?? {}) as { callSid?: string; agentUserId?: string };
      return {
        kind: p.kind,
        ...(p.userId ? { userId: p.userId } : {}),
        model: p.model ?? '',
        provider: p.provider ?? '',
        tokensIn: p.tokensIn ?? 0,
        tokensOut: p.tokensOut ?? 0,
        cachedInputTokens: p.cachedInputTokens ?? 0,
        cachedReadTokens: p.cachedReadTokens ?? 0,
        createdAt: p.createdAt,
        ...(input.callSid ? { callSid: String(input.callSid) } : {}),
        ...(input.agentUserId ? { agentUserId: String(input.agentUserId) } : {}),
      };
    });
  }

  /**
   * Aggregate the last 24h of /api/ai/* calls. Pulls the rows and reuses the
   * shared `summarize()` from the Mongo repo so output shape is identical.
   */
  async aggregateLast24h(): Promise<AiStatsAggregate> {
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rows = await db().query<{ data: string }>(
      `SELECT data FROM ${this.table()}
       WHERE get_json_object(data, '$.createdAt') >= ?`,
      [sinceIso],
    );
    const parsed = rows.map((r) => JSON.parse(r.data) as AiInteraction);
    return summarize(
      parsed.map((p) => ({
        kind: p.kind,
        ...(p.tokensIn !== undefined ? { tokensIn: p.tokensIn } : {}),
        ...(p.tokensOut !== undefined ? { tokensOut: p.tokensOut } : {}),
        ...(p.cachedInputTokens !== undefined ? { cachedInputTokens: p.cachedInputTokens } : {}),
        ...(p.cachedReadTokens !== undefined ? { cachedReadTokens: p.cachedReadTokens } : {}),
        ...(p.latencyMs !== undefined ? { latencyMs: p.latencyMs } : {}),
        ...(p.error !== undefined ? { error: p.error } : {}),
      })),
    );
  }
}
