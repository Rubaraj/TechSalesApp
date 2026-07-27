import path from 'node:path';
import type { SimulatorPersonaRecord } from '../../types/index.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';
import { generateId, formatDate } from '../../utils/paginate.js';

export class JsonSimulatorPersonaRepository {
  private readonly filePath = path.join(BOOTSTRAP_PATHS.runtimeDir, 'simulatorPersonas.json');
  private store: JsonStore<SimulatorPersonaRecord[]> | null = null;

  private async getStore(): Promise<JsonStore<SimulatorPersonaRecord[]>> {
    if (this.store) return this.store;
    this.store = await JsonStore.load<SimulatorPersonaRecord[]>(this.filePath, [], {
      persist: env.JSON_PERSIST,
    });
    return this.store;
  }

  async findAll(activeOnly = false): Promise<SimulatorPersonaRecord[]> {
    const s = await this.getStore();
    return activeOnly ? s.get().filter((r) => r.isActive) : [...s.get()];
  }

  async findById(personaId: string): Promise<SimulatorPersonaRecord | null> {
    const s = await this.getStore();
    return s.get().find((r) => r.personaId === personaId) ?? null;
  }

  async create(
    input: Omit<SimulatorPersonaRecord, 'personaId' | 'createdAt'> & { personaId?: string },
  ): Promise<SimulatorPersonaRecord> {
    const s = await this.getStore();
    const record: SimulatorPersonaRecord = {
      ...input,
      personaId: input.personaId ?? generateId('PERSONA'),
      createdAt: formatDate(),
    };
    s.update((prev) => [...prev, record]);
    return record;
  }

  async update(
    personaId: string,
    updates: Partial<SimulatorPersonaRecord>,
  ): Promise<SimulatorPersonaRecord | null> {
    const s = await this.getStore();
    let updated: SimulatorPersonaRecord | null = null;
    s.update((prev) => {
      const i = prev.findIndex((r) => r.personaId === personaId);
      if (i === -1) return prev;
      const next = { ...prev[i], ...updates, updatedAt: formatDate() };
      updated = next;
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
    return updated;
  }

  async delete(personaId: string): Promise<boolean> {
    const s = await this.getStore();
    let deleted = false;
    s.update((prev) => {
      const i = prev.findIndex((r) => r.personaId === personaId);
      if (i === -1) return prev;
      deleted = true;
      const copy = [...prev];
      copy.splice(i, 1);
      return copy;
    });
    return deleted;
  }
}
