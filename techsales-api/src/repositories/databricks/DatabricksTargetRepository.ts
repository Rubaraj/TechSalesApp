/**
 * Databricks-backed target repository — same surface as
 * `MongoTargetRepository`.
 */
import type { Target } from '../../types/index.js';
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

export class DatabricksTargetRepository {
  private table(): string {
    return appTable(APP_TABLES.targets);
  }

  async findAll(): Promise<Target[]> {
    return selectAll<Target>(this.table());
  }

  async findById(targetId: string): Promise<Target | null> {
    return selectById<Target>(this.table(), 'target_id', targetId);
  }

  async findByPeriod(period: string): Promise<Target[]> {
    const all = await this.findAll();
    return all.filter((t) => t.period === period);
  }

  async findByMetric(metric: string): Promise<Target[]> {
    const all = await this.findAll();
    return all.filter((t) => t.metric === metric);
  }

  async findActive(): Promise<Target[]> {
    const all = await this.findAll();
    return all.filter((t) => t.isActive === true);
  }

  async create(
    input: Omit<Target, 'targetId' | 'createdAt' | 'createdBy'>,
    createdBy: string,
  ): Promise<Target> {
    const target: Target = {
      ...input,
      targetId: generateId('TARGET'),
      createdAt: formatDate(),
      createdBy,
    };
    await insertRow(this.table(), 'target_id', target.targetId, target, target.createdAt, undefined);
    return target;
  }

  async update(
    targetId: string,
    updates: Partial<Target>,
    updatedBy: string,
  ): Promise<Target | null> {
    const existing = await this.findById(targetId);
    if (!existing) return null;
    const updatedAt = formatDate();
    const next: Target = { ...existing, ...updates, targetId, updatedAt, updatedBy };
    await updateRow(this.table(), 'target_id', targetId, next, updatedAt);
    return next;
  }

  async delete(targetId: string): Promise<boolean> {
    return deleteRow(this.table(), 'target_id', targetId);
  }

  async toggleStatus(targetId: string, updatedBy: string): Promise<Target | null> {
    const existing = await this.findById(targetId);
    if (!existing) return null;
    const updatedAt = formatDate();
    const next: Target = { ...existing, isActive: !existing.isActive, updatedAt, updatedBy };
    await updateRow(this.table(), 'target_id', targetId, next, updatedAt);
    return next;
  }
}
