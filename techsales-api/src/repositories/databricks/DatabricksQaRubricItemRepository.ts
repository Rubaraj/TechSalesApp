/**
 * Databricks-backed QA-rubric-item repository — same surface as
 * `MongoQaRubricItemRepository`.
 */
import type { QaRubricItem } from '../../types/index.js';
import { generateId, formatDate } from '../../utils/paginate.js';
import {
  APP_TABLES,
  appTable,
  selectAll,
  selectById,
  insertRow,
  updateRow,
  deleteRow,
} from './databricksHelpers.js';

export class DatabricksQaRubricItemRepository {
  private table(): string {
    return appTable(APP_TABLES.qaRubricItems);
  }

  async findAll(activeOnly = false): Promise<QaRubricItem[]> {
    const rows = await selectAll<QaRubricItem>(this.table());
    return activeOnly ? rows.filter((r) => r.isActive !== false) : rows;
  }

  async findById(itemId: string): Promise<QaRubricItem | null> {
    return selectById<QaRubricItem>(this.table(), 'item_id', itemId);
  }

  async create(input: Omit<QaRubricItem, 'itemId' | 'createdAt'>): Promise<QaRubricItem> {
    const item: QaRubricItem = { ...input, itemId: generateId('QRI'), createdAt: formatDate() };
    await insertRow(this.table(), 'item_id', item.itemId, item, item.createdAt, undefined);
    return item;
  }

  async update(itemId: string, updates: Partial<QaRubricItem>): Promise<QaRubricItem | null> {
    const existing = await this.findById(itemId);
    if (!existing) return null;
    const next: QaRubricItem = { ...existing, ...updates, itemId, updatedAt: formatDate() };
    await updateRow(this.table(), 'item_id', itemId, next, formatDate());
    return next;
  }

  async delete(itemId: string): Promise<boolean> {
    return deleteRow(this.table(), 'item_id', itemId);
  }
}
