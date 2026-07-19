/**
 * Databricks-backed compliance-rule repository — same surface as
 * `MongoComplianceRuleRepository`.
 */
import type { ComplianceRule } from '../../types/index.js';
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

export class DatabricksComplianceRuleRepository {
  private table(): string {
    return appTable(APP_TABLES.complianceRules);
  }

  async findAll(activeOnly = false): Promise<ComplianceRule[]> {
    const rows = await selectAll<ComplianceRule>(this.table());
    return activeOnly ? rows.filter((r) => r.isActive !== false) : rows;
  }

  async findById(ruleId: string): Promise<ComplianceRule | null> {
    return selectById<ComplianceRule>(this.table(), 'rule_id', ruleId);
  }

  async create(
    input: Omit<ComplianceRule, 'ruleId' | 'createdAt'>,
  ): Promise<ComplianceRule> {
    const rule: ComplianceRule = { ...input, ruleId: generateId('CRULE'), createdAt: formatDate() };
    await insertRow(this.table(), 'rule_id', rule.ruleId, rule, rule.createdAt, undefined);
    return rule;
  }

  async update(
    ruleId: string,
    updates: Partial<ComplianceRule>,
  ): Promise<ComplianceRule | null> {
    const existing = await this.findById(ruleId);
    if (!existing) return null;
    const next: ComplianceRule = { ...existing, ...updates, ruleId, updatedAt: formatDate() };
    await updateRow(this.table(), 'rule_id', ruleId, next, formatDate());
    return next;
  }

  async delete(ruleId: string): Promise<boolean> {
    return deleteRow(this.table(), 'rule_id', ruleId);
  }
}
