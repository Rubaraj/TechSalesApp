import type { SimulatorPersonaRecord } from '../../types/index.js';
import { getSimulatorPersonaModel } from '../../models/simulatorPersona.model.js';
import { generateId, formatDate } from '../../utils/paginate.js';

const stripInternals = (
  doc: SimulatorPersonaRecord & { _id?: unknown; __v?: unknown },
): SimulatorPersonaRecord => {
  const { _id: _i, __v: _v, ...rest } = doc as unknown as Record<string, unknown>;
  return rest as unknown as SimulatorPersonaRecord;
};

export class MongoSimulatorPersonaRepository {
  private model() {
    return getSimulatorPersonaModel();
  }

  async findAll(activeOnly = false): Promise<SimulatorPersonaRecord[]> {
    const q = activeOnly ? { isActive: true } : {};
    const docs = await this.model().find(q).lean<SimulatorPersonaRecord[]>().exec();
    return docs.map(stripInternals);
  }

  async findById(personaId: string): Promise<SimulatorPersonaRecord | null> {
    const doc = await this.model()
      .findOne({ personaId })
      .lean<SimulatorPersonaRecord | null>()
      .exec();
    return doc ? stripInternals(doc) : null;
  }

  async create(
    input: Omit<SimulatorPersonaRecord, 'personaId' | 'createdAt'> & { personaId?: string },
  ): Promise<SimulatorPersonaRecord> {
    const record: SimulatorPersonaRecord = {
      ...input,
      personaId: input.personaId ?? generateId('PERSONA'),
      createdAt: formatDate(),
    };
    const created = await this.model().create(record);
    return stripInternals(created.toJSON() as SimulatorPersonaRecord);
  }

  async update(
    personaId: string,
    updates: Partial<SimulatorPersonaRecord>,
  ): Promise<SimulatorPersonaRecord | null> {
    const updated = await this.model()
      .findOneAndUpdate(
        { personaId },
        { $set: { ...updates, updatedAt: formatDate() } },
        { new: true },
      )
      .lean<SimulatorPersonaRecord | null>()
      .exec();
    return updated ? stripInternals(updated) : null;
  }

  async delete(personaId: string): Promise<boolean> {
    const res = await this.model().deleteOne({ personaId }).exec();
    return (res.deletedCount ?? 0) > 0;
  }
}
