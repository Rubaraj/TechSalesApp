import type { QaRubricItem } from '../../types/index.js';
import { getQaRubricItemModel } from '../../models/qaRubricItem.model.js';
import { generateId, formatDate } from '../../utils/paginate.js';

const stripInternals = (doc: QaRubricItem & { _id?: unknown; __v?: unknown }): QaRubricItem => {
  const { _id: _i, __v: _v, ...rest } = doc as unknown as Record<string, unknown>;
  return rest as unknown as QaRubricItem;
};

export class MongoQaRubricItemRepository {
  private model() {
    return getQaRubricItemModel();
  }

  async findAll(activeOnly = false): Promise<QaRubricItem[]> {
    const q = activeOnly ? { isActive: true } : {};
    const docs = await this.model().find(q).lean<QaRubricItem[]>().exec();
    return docs.map(stripInternals);
  }

  async findById(itemId: string): Promise<QaRubricItem | null> {
    const doc = await this.model().findOne({ itemId }).lean<QaRubricItem | null>().exec();
    return doc ? stripInternals(doc) : null;
  }

  async create(input: Omit<QaRubricItem, 'itemId' | 'createdAt'>): Promise<QaRubricItem> {
    const item: QaRubricItem = { ...input, itemId: generateId('QRI'), createdAt: formatDate() };
    const created = await this.model().create(item);
    return stripInternals(created.toJSON() as QaRubricItem);
  }

  async update(itemId: string, updates: Partial<QaRubricItem>): Promise<QaRubricItem | null> {
    const updated = await this.model()
      .findOneAndUpdate({ itemId }, { $set: { ...updates, updatedAt: formatDate() } }, { new: true })
      .lean<QaRubricItem | null>()
      .exec();
    return updated ? stripInternals(updated) : null;
  }

  async delete(itemId: string): Promise<boolean> {
    const res = await this.model().deleteOne({ itemId }).exec();
    return (res.deletedCount ?? 0) > 0;
  }
}
