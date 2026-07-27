import type { ScreeningPersonaRecord } from '../../types/index.js';
import { getScreeningPersonaModel } from '../../models/screeningPersona.model.js';
import { formatDate } from '../../utils/paginate.js';

const stripInternals = (
  doc: ScreeningPersonaRecord & { _id?: unknown; __v?: unknown },
): ScreeningPersonaRecord => {
  const { _id: _i, __v: _v, ...rest } = doc as unknown as Record<string, unknown>;
  return rest as unknown as ScreeningPersonaRecord;
};

export class MongoScreeningPersonaRepository {
  private model() {
    return getScreeningPersonaModel();
  }

  async findByUserId(userId: string): Promise<ScreeningPersonaRecord | null> {
    const doc = await this.model()
      .findOne({ userId })
      .lean<ScreeningPersonaRecord | null>()
      .exec();
    return doc ? stripInternals(doc) : null;
  }

  async upsert(
    userId: string,
    updates: Pick<ScreeningPersonaRecord, 'greeting' | 'instructions' | 'voice'>,
  ): Promise<ScreeningPersonaRecord> {
    const now = formatDate();
    const updated = await this.model()
      .findOneAndUpdate(
        { userId },
        {
          $set: { ...updates, updatedAt: now },
          $setOnInsert: { userId, createdAt: now },
        },
        { new: true, upsert: true },
      )
      .lean<ScreeningPersonaRecord>()
      .exec();
    return stripInternals(updated);
  }

  async delete(userId: string): Promise<boolean> {
    const res = await this.model().deleteOne({ userId }).exec();
    return (res.deletedCount ?? 0) > 0;
  }
}
