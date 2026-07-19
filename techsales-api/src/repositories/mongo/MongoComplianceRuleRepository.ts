import type { ComplianceRule } from '../../types/index.js';
import { getComplianceRuleModel } from '../../models/complianceRule.model.js';
import { generateId, formatDate } from '../../utils/paginate.js';

const stripInternals = (doc: ComplianceRule & { _id?: unknown; __v?: unknown }): ComplianceRule => {
  const { _id: _i, __v: _v, ...rest } = doc as unknown as Record<string, unknown>;
  return rest as unknown as ComplianceRule;
};

export class MongoComplianceRuleRepository {
  private model() {
    return getComplianceRuleModel();
  }

  async findAll(activeOnly = false): Promise<ComplianceRule[]> {
    const q = activeOnly ? { isActive: true } : {};
    const docs = await this.model().find(q).lean<ComplianceRule[]>().exec();
    return docs.map(stripInternals);
  }

  async findById(ruleId: string): Promise<ComplianceRule | null> {
    const doc = await this.model().findOne({ ruleId }).lean<ComplianceRule | null>().exec();
    return doc ? stripInternals(doc) : null;
  }

  async create(
    input: Omit<ComplianceRule, 'ruleId' | 'createdAt'>,
  ): Promise<ComplianceRule> {
    const rule: ComplianceRule = { ...input, ruleId: generateId('CRULE'), createdAt: formatDate() };
    const created = await this.model().create(rule);
    return stripInternals(created.toJSON() as ComplianceRule);
  }

  async update(
    ruleId: string,
    updates: Partial<ComplianceRule>,
  ): Promise<ComplianceRule | null> {
    const updated = await this.model()
      .findOneAndUpdate({ ruleId }, { $set: { ...updates, updatedAt: formatDate() } }, { new: true })
      .lean<ComplianceRule | null>()
      .exec();
    return updated ? stripInternals(updated) : null;
  }

  async delete(ruleId: string): Promise<boolean> {
    const res = await this.model().deleteOne({ ruleId }).exec();
    return (res.deletedCount ?? 0) > 0;
  }
}
