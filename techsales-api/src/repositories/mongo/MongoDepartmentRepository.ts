import type { Department } from '../../types/index.js';
import { getDepartmentModel } from '../../models/department.model.js';
import { generateId, formatDate } from '../../utils/paginate.js';

const stripInternals = (doc: Department & { _id?: unknown; __v?: unknown }): Department => {
  const { _id: _i, __v: _v, ...rest } = doc as unknown as Record<string, unknown>;
  return rest as unknown as Department;
};

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class MongoDepartmentRepository {
  private model() {
    return getDepartmentModel();
  }

  async findAll(activeOnly = true): Promise<Department[]> {
    const q = activeOnly ? { isActive: true } : {};
    const docs = await this.model().find(q).lean<Department[]>().exec();
    return docs.map(stripInternals);
  }

  async findById(departmentId: string): Promise<Department | null> {
    const doc = await this.model().findOne({ departmentId }).lean<Department | null>().exec();
    return doc ? stripInternals(doc) : null;
  }

  async create(input: Omit<Department, 'departmentId' | 'createdAt' | 'createdBy'>, createdBy: string): Promise<Department | { error: string }> {
    const dup = await this.model().findOne({ departmentName: { $regex: `^${escapeRegex(input.departmentName)}$`, $options: 'i' } }).lean().exec();
    if (dup) return { error: 'Department name already exists' };
    const dept: Department = { ...input, departmentId: generateId('DEPT'), createdAt: formatDate(), createdBy };
    const created = await this.model().create(dept);
    return stripInternals(created.toJSON() as Department);
  }

  async update(departmentId: string, updates: Partial<Department>): Promise<Department | { error: string } | null> {
    if (updates.departmentName) {
      const dup = await this.model().findOne({ departmentName: { $regex: `^${escapeRegex(updates.departmentName)}$`, $options: 'i' }, departmentId: { $ne: departmentId } }).lean().exec();
      if (dup) return { error: 'Department name already exists' };
    }
    const updated = await this.model()
      .findOneAndUpdate({ departmentId }, { $set: updates }, { new: true })
      .lean<Department | null>()
      .exec();
    return updated ? stripInternals(updated) : null;
  }

  async delete(departmentId: string, userCount: number): Promise<boolean | { error: string }> {
    if (userCount > 0) {
      return { error: `Cannot delete department. ${userCount} user(s) are assigned to this department.` };
    }
    const res = await this.model().deleteOne({ departmentId }).exec();
    return (res.deletedCount ?? 0) > 0;
  }
}
