/**
 * Databricks-backed screening-persona repository — same surface as
 * `MongoScreeningPersonaRepository`.
 */
import type { ScreeningPersonaRecord } from '../../types/index.js';
import { formatDate } from '../../utils/paginate.js';
import {
  APP_TABLES,
  appTable,
  selectById,
  insertRow,
  updateRow,
  deleteRow,
} from './databricksHelpers.js';

export class DatabricksScreeningPersonaRepository {
  private table(): string {
    return appTable(APP_TABLES.screeningPersonas);
  }

  async findByUserId(userId: string): Promise<ScreeningPersonaRecord | null> {
    return selectById<ScreeningPersonaRecord>(this.table(), 'user_id', userId);
  }

  async upsert(
    userId: string,
    updates: Pick<ScreeningPersonaRecord, 'greeting' | 'instructions' | 'voice'>,
  ): Promise<ScreeningPersonaRecord> {
    const now = formatDate();
    const existing = await this.findByUserId(userId);
    if (!existing) {
      const record: ScreeningPersonaRecord = { userId, ...updates, createdAt: now };
      await insertRow(this.table(), 'user_id', userId, record, now, undefined);
      return record;
    }
    const next: ScreeningPersonaRecord = { ...existing, ...updates, userId, updatedAt: now };
    await updateRow(this.table(), 'user_id', userId, next, now);
    return next;
  }

  async delete(userId: string): Promise<boolean> {
    return deleteRow(this.table(), 'user_id', userId);
  }
}
