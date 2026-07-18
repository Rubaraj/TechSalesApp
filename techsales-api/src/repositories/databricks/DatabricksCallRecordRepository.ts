/**
 * QA pipeline — Databricks-backed call-record repo. Same surface as
 * `MongoCallRecordRepository` (JSON-blob rows via databricksHelpers, like
 * the aiInteractions repo).
 */
import type { CallRecord } from '../../models/callRecord.model.js';
import type { CallRecordListParams } from '../mongo/MongoCallRecordRepository.js';
import { APP_TABLES, appTable, selectAll, insertRow, updateRow } from './databricksHelpers.js';

export class DatabricksCallRecordRepository {
  private table(): string {
    return appTable(APP_TABLES.callRecords);
  }

  async create(record: CallRecord): Promise<CallRecord> {
    await insertRow(this.table(), 'call_sid', record.callSid, record, record.createdAt, undefined);
    return record;
  }

  async list(params: CallRecordListParams = {}): Promise<Array<Omit<CallRecord, 'lines'>>> {
    let items = await selectAll<CallRecord>(this.table());
    if (params.flaggedOnly) items = items.filter((r) => r.flagged);
    if (params.userId) items = items.filter((r) => r.userId === params.userId);
    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const cap = Math.max(1, Math.min(params.limit ?? 50, 200));
    return items.slice(0, cap).map(({ lines: _lines, ...rest }) => rest);
  }

  async findByCallSid(callSid: string): Promise<CallRecord | null> {
    const items = await selectAll<CallRecord>(this.table());
    return items.find((r) => r.callSid === callSid) ?? null;
  }

  async setQaReview(callSid: string, qaReview: CallRecord['qaReview']): Promise<boolean> {
    const existing = await this.findByCallSid(callSid);
    if (!existing) return false;
    const next: CallRecord = { ...existing, qaReview };
    await updateRow(this.table(), 'call_sid', callSid, next);
    return true;
  }
}
