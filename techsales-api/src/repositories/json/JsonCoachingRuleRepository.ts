import path from 'node:path';
import type { CoachingRule } from '../../types/index.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';
import { generateId, formatDate } from '../../utils/paginate.js';

export class JsonCoachingRuleRepository {
  private readonly filePath = path.join(BOOTSTRAP_PATHS.runtimeDir, 'coachingRules.json');
  private store: JsonStore<CoachingRule[]> | null = null;

  private async getStore(): Promise<JsonStore<CoachingRule[]>> {
    if (this.store) return this.store;
    this.store = await JsonStore.load<CoachingRule[]>(this.filePath, [], {
      persist: env.JSON_PERSIST,
    });
    return this.store;
  }

  async findAll(activeOnly = false): Promise<CoachingRule[]> {
    const s = await this.getStore();
    return activeOnly ? s.get().filter((r) => r.isActive) : [...s.get()];
  }

  async findById(ruleId: string): Promise<CoachingRule | null> {
    const s = await this.getStore();
    return s.get().find((r) => r.ruleId === ruleId) ?? null;
  }

  async create(
    input: Omit<CoachingRule, 'ruleId' | 'createdAt'>,
  ): Promise<CoachingRule> {
    const s = await this.getStore();
    const rule: CoachingRule = { ...input, ruleId: generateId('COACH'), createdAt: formatDate() };
    s.update((prev) => [...prev, rule]);
    return rule;
  }

  async update(
    ruleId: string,
    updates: Partial<CoachingRule>,
  ): Promise<CoachingRule | null> {
    const s = await this.getStore();
    let updated: CoachingRule | null = null;
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
