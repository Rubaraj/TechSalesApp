/**
 * JSON-file-backed audit repo. Mirrors MongoAiInteractionRepository but writes
 * to `data/runtime/aiInteractions.json` via `JsonStore`. Used in JSON-mode
 * deployments (no Mongo) — see plan §4.
 */
import path from 'node:path';
import type { AiInteractionRecord } from '../../ai/llm/callbacks.js';
import type { AiInteraction } from '../../models/aiInteraction.model.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';
import { generateId } from '../../utils/paginate.js';
import type { AiStatsAggregate } from '../types.js';
import { summarize } from '../mongo/MongoAiInteractionRepository.js';

export class JsonAiInteractionRepository {
  private readonly filePath = path.join(BOOTSTRAP_PATHS.runtimeDir, 'aiInteractions.json');
  private store: JsonStore<AiInteraction[]> | null = null;

  private async getStore(): Promise<JsonStore<AiInteraction[]>> {
    if (this.store) return this.store;
    this.store = await JsonStore.load<AiInteraction[]>(this.filePath, [], {
      persist: env.JSON_PERSIST,
    });
    return this.store;
  }

  async create(input: AiInteractionRecord): Promise<AiInteraction> {
    const store = await this.getStore();
    const interactionId = input.interactionId || generateId('AI');
    const record: AiInteraction = { ...input, interactionId };
    store.update((prev) => [...prev, record]);
    return record;
  }

  async findRecent(limit = 25, kind?: string): Promise<AiInteraction[]> {
    const store = await this.getStore();
    let items = [...store.get()];
    if (kind) items = items.filter((i) => i.kind === kind);
    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const cap = Math.max(1, Math.min(limit, 200));
    return items.slice(0, cap);
  }

  /**
   * Sum (tokensIn + tokensOut - cachedInputTokens) for `provider` since
   * `sinceMs`. Mirror of MongoAiInteractionRepository.sumTokens — keeps the
   * tokenCap middleware storage-agnostic.
   */
  async sumTokens(provider: string, sinceMs: number): Promise<number> {
    const store = await this.getStore();
    const sinceIso = new Date(sinceMs).toISOString();
    let total = 0;
    for (const row of store.get()) {
      if (row.provider !== provider) continue;
      if ((row.createdAt || '') < sinceIso) continue;
      total += (row.tokensIn ?? 0) + (row.tokensOut ?? 0) - (row.cachedInputTokens ?? 0);
    }
    return total > 0 ? total : 0;
  }

  /** 24h aggregate. Filters in-memory then delegates to the shared summarizer. */
  async aggregateLast24h(): Promise<AiStatsAggregate> {
    const store = await this.getStore();
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rows = store
      .get()
      .filter((r) => (r.createdAt || '') >= sinceIso)
      .map((r) => ({
        kind: r.kind,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        cachedInputTokens: r.cachedInputTokens,
        cachedReadTokens: r.cachedReadTokens,
        latencyMs: r.latencyMs,
        ...(r.error ? { error: r.error } : {}),
      }));
    return summarize(rows);
  }
}
