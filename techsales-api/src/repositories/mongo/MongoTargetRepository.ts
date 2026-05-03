import type { Target } from '../../types/index.js';
import { getTargetModel } from '../../models/target.model.js';
import { generateId, formatDate } from '../../utils/paginate.js';

const stripInternals = (doc: Target & { _id?: unknown; __v?: unknown }): Target => {
  const { _id: _i, __v: _v, ...rest } = doc as unknown as Record<string, unknown>;
  return rest as unknown as Target;
};

export class MongoTargetRepository {
  private model() {
    return getTargetModel();
  }

  async findAll(): Promise<Target[]> {
    const docs = await this.model().find().lean<Target[]>().exec();
    return docs.map(stripInternals);
  }

  async findById(targetId: string): Promise<Target | null> {
    const doc = await this.model().findOne({ targetId }).lean<Target | null>().exec();
    return doc ? stripInternals(doc) : null;
  }

  async findByPeriod(period: string): Promise<Target[]> {
    const docs = await this.model().find({ period }).lean<Target[]>().exec();
    return docs.map(stripInternals);
  }

  async findByMetric(metric: string): Promise<Target[]> {
    const docs = await this.model().find({ metric }).lean<Target[]>().exec();
    return docs.map(stripInternals);
  }

  async findActive(): Promise<Target[]> {
    const docs = await this.model().find({ isActive: true }).lean<Target[]>().exec();
    return docs.map(stripInternals);
  }

  async create(input: Omit<Target, 'targetId' | 'createdAt' | 'createdBy'>, createdBy: string): Promise<Target> {
    const target: Target = { ...input, targetId: generateId('TARGET'), createdAt: formatDate(), createdBy };
    const created = await this.model().create(target);
    return stripInternals(created.toJSON() as Target);
  }

  async update(targetId: string, updates: Partial<Target>, updatedBy: string): Promise<Target | null> {
    const updated = await this.model()
      .findOneAndUpdate({ targetId }, { $set: { ...updates, updatedAt: formatDate(), updatedBy } }, { new: true })
      .lean<Target | null>()
      .exec();
    return updated ? stripInternals(updated) : null;
  }

  async delete(targetId: string): Promise<boolean> {
    const res = await this.model().deleteOne({ targetId }).exec();
    return (res.deletedCount ?? 0) > 0;
  }

  async toggleStatus(targetId: string, updatedBy: string): Promise<Target | null> {
    const t = await this.model().findOne({ targetId }).exec();
    if (!t) return null;
    t.isActive = !t.isActive;
    t.updatedAt = formatDate();
    t.updatedBy = updatedBy;
    await t.save();
    return stripInternals(t.toJSON() as Target);
  }
}
