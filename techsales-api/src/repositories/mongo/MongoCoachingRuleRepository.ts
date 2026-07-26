import type { CoachingRule } from '../../types/index.js';
import { getCoachingRuleModel } from '../../models/coachingRule.model.js';
import { generateId, formatDate } from '../../utils/paginate.js';

const stripInternals = (doc: CoachingRule & { _id?: unknown; __v?: unknown }): CoachingRule => {
  const { _id: _i, __v: _v, ...rest } = doc as unknown as Record<string, unknown>;
  return rest as unknown as CoachingRule;
};

export class MongoCoachingRuleRepository {
  private model() {
    return getCoachingRuleModel();
  }

  async findAll(activeOnly = false): Promise<CoachingRule[]> {
    const q = activeOnly ? { isActive: true } : {};
    const docs = await this.model().find(q).lean<CoachingRule[]>().exec();
    return docs.map(stripInternals);
  }

  async findById(ruleId: string): Promise<CoachingRule | null> {
    const doc = await this.model().findOne({ ruleId }).lean<CoachingRule | null>().exec();
    return doc ? stripInternals(doc) : null;
  }

  async create(
    input: Omit<CoachingRule, 'ruleId' | 'createdAt'>,
  ): Promise<CoachingRule> {
    const rule: CoachingRule = { ...input, ruleId: generateId('COACH'), createdAt: formatDate() };
    const created = await this.model().create(rule);
    return stripInternals(created.toJSON() as CoachingRule);
  }

  async update(
    ruleId: string,
    updates: Partial<CoachingRule>,
  ): Promise<CoachingRule | null> {
    const updated = await this.model()
      .findOneAndUpdate({ ruleId }, { $set: { ...updates, updatedAt: formatDate() } }, { new: true })
      .lean<CoachingRule | null>()
      .exec();
    return updated ? stripInternals(updated) : null;
  }

  async delete(ruleId: string): Promise<boolean> {
    const res = await this.model().deleteOne({ ruleId }).exec();
    return (res.deletedCount ?? 0) > 0;
  }
}
