/**
 * QA pipeline — JSON-file-backed call-record repo. Mirrors
 * MongoCallRecordRepository via `JsonStore` at `data/runtime/callRecords.json`.
 */
import path from 'node:path';
import type { CallRecord } from '../../models/callRecord.model.js';
import type { CallRecordListParams } from '../mongo/MongoCallRecordRepository.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';

export class JsonCallRecordRepository {
  private readonly filePath = path.join(BOOTSTRAP_PATHS.runtimeDir, 'callRecords.json');
  private store: JsonStore<CallRecord[]> | null = null;

  private async getStore(): Promise<JsonStore<CallRecord[]>> {
    if (this.store) return this.store;
    this.store = await JsonStore.load<CallRecord[]>(this.filePath, [], {
      persist: env.JSON_PERSIST,
    });
    return this.store;
  }

  async create(record: CallRecord): Promise<CallRecord> {
    const store = await this.getStore();
    store.update((prev) => [...prev.filter((r) => r.callSid !== record.callSid), record]);
    return record;
  }

  async list(params: CallRecordListParams = {}): Promise<Array<Omit<CallRecord, 'lines'>>> {
    const store = await this.getStore();
    let items = [...store.get()];
    if (params.flaggedOnly) items = items.filter((r) => r.flagged);
    if (params.userId) items = items.filter((r) => r.userId === params.userId);
    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const cap = Math.max(1, Math.min(params.limit ?? 50, 200));
    return items.slice(0, cap).map(({ lines: _lines, ...rest }) => rest);
  }

  async findByCallSid(callSid: string): Promise<CallRecord | null> {
    const store = await this.getStore();
    return store.get().find((r) => r.callSid === callSid) ?? null;
  }

  async setQaReview(callSid: string, qaReview: CallRecord['qaReview']): Promise<boolean> {
    const store = await this.getStore();
    let found = false;
    store.update((prev) =>
      prev.map((r) => {
        if (r.callSid !== callSid) return r;
        found = true;
        return { ...r, qaReview };
      }),
    );
    return found;
  }
}
