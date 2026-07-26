/**
 * Databricks-backed coaching-rule repository — same surface as
 * `MongoCoachingRuleRepository`.
 */
import type { CoachingRule } from '../../types/index.js';
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

export class DatabricksCoachingRuleRepository {
  private table(): string {
    return appTable(APP_TABLES.coachingRules);
  }

  async findAll(activeOnly = false): Promise<CoachingRule[]> {
    const rows = await selectAll<CoachingRule>(this.table());
    return activeOnly ? rows.filter((r) => r.isActive !== false) : rows;
  }

  async findById(ruleId: string): Promise<CoachingRule | null> {
    return selectById<CoachingRule>(this.table(), 'rule_id', ruleId);
  }

  async create(
    input: Omit<CoachingRule, 'ruleId' | 'createdAt'>,
  ): Promise<CoachingRule> {
    const rule: CoachingRule = { ...input, ruleId: generateId('COACH'), createdAt: formatDate() };
    await insertRow(this.table(), 'rule_id', rule.ruleId, rule, rule.createdAt, undefined);
    return rule;
  }

  async update(
    ruleId: string,
    updates: Partial<CoachingRule>,
  ): Promise<CoachingRule | null> {
    const existing = await this.findById(ruleId);
    if (!existing) return null;
    const next: CoachingRule = { ...existing, ...updates, ruleId, updatedAt: formatDate() };
    await updateRow(this.table(), 'rule_id', ruleId, next, formatDate());
    return next;
  }

  async delete(ruleId: string): Promise<boolean> {
    return deleteRow(this.table(), 'rule_id', ruleId);
  }
}
