import path from 'node:path';
import type { ComplianceRule } from '../../types/index.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';
import { generateId, formatDate } from '../../utils/paginate.js';

export class JsonComplianceRuleRepository {
  private readonly filePath = path.join(BOOTSTRAP_PATHS.runtimeDir, 'complianceRules.json');
  private store: JsonStore<ComplianceRule[]> | null = null;

  private async getStore(): Promise<JsonStore<ComplianceRule[]>> {
    if (this.store) return this.store;
    this.store = await JsonStore.load<ComplianceRule[]>(this.filePath, [], {
      persist: env.JSON_PERSIST,
    });
    return this.store;
  }

  async findAll(activeOnly = false): Promise<ComplianceRule[]> {
    const s = await this.getStore();
    return activeOnly ? s.get().filter((r) => r.isActive) : [...s.get()];
  }

  async findById(ruleId: string): Promise<ComplianceRule | null> {
    const s = await this.getStore();
    return s.get().find((r) => r.ruleId === ruleId) ?? null;
  }

  async create(
    input: Omit<ComplianceRule, 'ruleId' | 'createdAt'>,
  ): Promise<ComplianceRule> {
    const s = await this.getStore();
    const rule: ComplianceRule = { ...input, ruleId: generateId('CRULE'), createdAt: formatDate() };
    s.update((prev) => [...prev, rule]);
    return rule;
  }

  async update(
    ruleId: string,
    updates: Partial<ComplianceRule>,
  ): Promise<ComplianceRule | null> {
    const s = await this.getStore();
    let updated: ComplianceRule | null = null;
    s.update((prev) => {
      const i = prev.findIndex((r) => r.ruleId === ruleId);
      if (i === -1) return prev;
      const next = { ...prev[i], ...updates, updatedAt: formatDate() };
      updated = next;
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
    return updated;
  }

  async delete(ruleId: string): Promise<boolean> {
    const s = await this.getStore();
    let deleted = false;
    s.update((prev) => {
      const i = prev.findIndex((r) => r.ruleId === ruleId);
      if (i === -1) return prev;
      deleted = true;
      const copy = [...prev];
      copy.splice(i, 1);
      return copy;
    });
    return deleted;
  }
}
