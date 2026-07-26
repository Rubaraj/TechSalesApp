import path from 'node:path';
import type { QaRubricItem } from '../../types/index.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';
import { generateId, formatDate } from '../../utils/paginate.js';

export class JsonQaRubricItemRepository {
  private readonly filePath = path.join(BOOTSTRAP_PATHS.runtimeDir, 'qaRubricItems.json');
  private store: JsonStore<QaRubricItem[]> | null = null;

  private async getStore(): Promise<JsonStore<QaRubricItem[]>> {
    if (this.store) return this.store;
    this.store = await JsonStore.load<QaRubricItem[]>(this.filePath, [], {
      persist: env.JSON_PERSIST,
    });
    return this.store;
  }

  async findAll(activeOnly = false): Promise<QaRubricItem[]> {
    const s = await this.getStore();
    return activeOnly ? s.get().filter((r) => r.isActive) : [...s.get()];
  }

  async findById(itemId: string): Promise<QaRubricItem | null> {
    const s = await this.getStore();
    return s.get().find((r) => r.itemId === itemId) ?? null;
  }

  async create(input: Omit<QaRubricItem, 'itemId' | 'createdAt'>): Promise<QaRubricItem> {
    const s = await this.getStore();
    const item: QaRubricItem = { ...input, itemId: generateId('QRI'), createdAt: formatDate() };
    s.update((prev) => [...prev, item]);
    return item;
  }

  async update(itemId: string, updates: Partial<QaRubricItem>): Promise<QaRubricItem | null> {
    const s = await this.getStore();
    let updated: QaRubricItem | null = null;
    s.update((prev) => {
      const i = prev.findIndex((r) => r.itemId === itemId);
      if (i === -1) return prev;
      const next = { ...prev[i], ...updates, updatedAt: formatDate() };
      updated = next;
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
    return updated;
  }

  async delete(itemId: string): Promise<boolean> {
    const s = await this.getStore();
    let deleted = false;
    s.update((prev) => {
      const i = prev.findIndex((r) => r.itemId === itemId);
      if (i === -1) return prev;
      deleted = true;
      const copy = [...prev];
      copy.splice(i, 1);
      return copy;
    });
    return deleted;
  }
}
