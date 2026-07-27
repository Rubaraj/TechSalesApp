/**
 * Databricks-backed simulator-persona repository — same surface as
 * `MongoSimulatorPersonaRepository`.
 */
import type { SimulatorPersonaRecord } from '../../types/index.js';
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

export class DatabricksSimulatorPersonaRepository {
  private table(): string {
    return appTable(APP_TABLES.simulatorPersonas);
  }

  async findAll(activeOnly = false): Promise<SimulatorPersonaRecord[]> {
    const rows = await selectAll<SimulatorPersonaRecord>(this.table());
    return activeOnly ? rows.filter((r) => r.isActive !== false) : rows;
  }

  async findById(personaId: string): Promise<SimulatorPersonaRecord | null> {
    return selectById<SimulatorPersonaRecord>(this.table(), 'persona_id', personaId);
  }

  async create(
    input: Omit<SimulatorPersonaRecord, 'personaId' | 'createdAt'> & { personaId?: string },
  ): Promise<SimulatorPersonaRecord> {
    const record: SimulatorPersonaRecord = {
      ...input,
      personaId: input.personaId ?? generateId('PERSONA'),
      createdAt: formatDate(),
    };
    await insertRow(this.table(), 'persona_id', record.personaId, record, record.createdAt, undefined);
    return record;
  }

  async update(
    personaId: string,
    updates: Partial<SimulatorPersonaRecord>,
  ): Promise<SimulatorPersonaRecord | null> {
    const existing = await this.findById(personaId);
    if (!existing) return null;
    const next: SimulatorPersonaRecord = {
      ...existing,
      ...updates,
      personaId,
      updatedAt: formatDate(),
    };
    await updateRow(this.table(), 'persona_id', personaId, next, formatDate());
    return next;
  }

  async delete(personaId: string): Promise<boolean> {
    return deleteRow(this.table(), 'persona_id', personaId);
  }
}
