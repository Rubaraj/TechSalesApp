import path from 'node:path';
import type { ScreeningPersonaRecord } from '../../types/index.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';
import { formatDate } from '../../utils/paginate.js';

export class JsonScreeningPersonaRepository {
  private readonly filePath = path.join(BOOTSTRAP_PATHS.runtimeDir, 'screeningPersonas.json');
  private store: JsonStore<ScreeningPersonaRecord[]> | null = null;

  private async getStore(): Promise<JsonStore<ScreeningPersonaRecord[]>> {
    if (this.store) return this.store;
    this.store = await JsonStore.load<ScreeningPersonaRecord[]>(this.filePath, [], {
      persist: env.JSON_PERSIST,
    });
    return this.store;
  }

  async findByUserId(userId: string): Promise<ScreeningPersonaRecord | null> {
    const s = await this.getStore();
    return s.get().find((r) => r.userId === userId) ?? null;
  }

  async upsert(
    userId: string,
    updates: Pick<ScreeningPersonaRecord, 'greeting' | 'instructions' | 'voice'>,
  ): Promise<ScreeningPersonaRecord> {
    const s = await this.getStore();
    const now = formatDate();
    let result: ScreeningPersonaRecord | null = null;
    s.update((prev) => {
      const i = prev.findIndex((r) => r.userId === userId);
      if (i === -1) {
        result = { userId, ...updates, createdAt: now };
        return [...prev, result];
      }
      result = { ...prev[i], ...updates, updatedAt: now };
      const copy = [...prev];
      copy[i] = result;
      return copy;
    });
    return result!;
  }

  async delete(userId: string): Promise<boolean> {
    const s = await this.getStore();
    let deleted = false;
    s.update((prev) => {
      const i = prev.findIndex((r) => r.userId === userId);
      if (i === -1) return prev;
      deleted = true;
      const copy = [...prev];
      copy.splice(i, 1);
      return copy;
    });
    return deleted;
  }
}
