import path from 'node:path';
import type { Target } from '../../types/index.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';
import { generateId, formatDate } from '../../utils/paginate.js';

export class JsonTargetRepository {
  private readonly filePath = path.join(BOOTSTRAP_PATHS.runtimeDir, 'targets.json');
  private store: JsonStore<Target[]> | null = null;

  private async getStore(): Promise<JsonStore<Target[]>> {
    if (this.store) return this.store;
    this.store = await JsonStore.load<Target[]>(this.filePath, [], { persist: env.JSON_PERSIST });
    return this.store;
  }

  async findAll(): Promise<Target[]> {
    const s = await this.getStore();
    return [...s.get()];
  }

  async findById(targetId: string): Promise<Target | null> {
    const s = await this.getStore();
    return s.get().find((t) => t.targetId === targetId) ?? null;
  }

  async findByPeriod(period: string): Promise<Target[]> {
    const s = await this.getStore();
    return s.get().filter((t) => t.period === period);
  }

  async findByMetric(metric: string): Promise<Target[]> {
    const s = await this.getStore();
    return s.get().filter((t) => t.metric === metric);
  }

  async findActive(): Promise<Target[]> {
    const s = await this.getStore();
    return s.get().filter((t) => t.isActive);
  }

  async create(input: Omit<Target, 'targetId' | 'createdAt' | 'createdBy'>, createdBy: string): Promise<Target> {
    const s = await this.getStore();
    const target: Target = { ...input, targetId: generateId('TARGET'), createdAt: formatDate(), createdBy };
    s.update((prev) => [...prev, target]);
    return target;
  }

  async update(targetId: string, updates: Partial<Target>, updatedBy: string): Promise<Target | null> {
    const s = await this.getStore();
    let updated: Target | null = null;
    s.update((prev) => {
      const i = prev.findIndex((t) => t.targetId === targetId);
      if (i === -1) return prev;
      const next = { ...prev[i], ...updates, updatedAt: formatDate(), updatedBy };
      updated = next;
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
    return updated;
  }

  async delete(targetId: string): Promise<boolean> {
    const s = await this.getStore();
    let deleted = false;
    s.update((prev) => {
      const i = prev.findIndex((t) => t.targetId === targetId);
      if (i === -1) return prev;
      deleted = true;
      const copy = [...prev];
      copy.splice(i, 1);
      return copy;
    });
    return deleted;
  }

  async toggleStatus(targetId: string, updatedBy: string): Promise<Target | null> {
    const s = await this.getStore();
    let updated: Target | null = null;
    s.update((prev) => {
      const i = prev.findIndex((t) => t.targetId === targetId);
      if (i === -1) return prev;
      const next = { ...prev[i], isActive: !prev[i].isActive, updatedAt: formatDate(), updatedBy };
      updated = next;
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
    return updated;
  }
}
