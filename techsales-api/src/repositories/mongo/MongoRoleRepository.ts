import type { Role } from '../../types/index.js';
import { getRoleModel } from '../../models/role.model.js';
import { generateId, formatDate } from '../../utils/paginate.js';

const stripInternals = (doc: Role & { _id?: unknown; __v?: unknown }): Role => {
  const { _id: _i, __v: _v, ...rest } = doc as unknown as Record<string, unknown>;
  return rest as unknown as Role;
};

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class MongoRoleRepository {
  private model() {
    return getRoleModel();
  }

  async findAll(activeOnly = true): Promise<Role[]> {
    const q = activeOnly ? { isActive: true } : {};
    const docs = await this.model().find(q).lean<Role[]>().exec();
    return docs.map(stripInternals);
  }

  async findById(roleId: string): Promise<Role | null> {
    const doc = await this.model().findOne({ roleId }).lean<Role | null>().exec();
    return doc ? stripInternals(doc) : null;
  }

  async create(input: Omit<Role, 'roleId' | 'createdAt'>): Promise<Role | { error: string }> {
    const dup = await this.model().findOne({ roleName: { $regex: `^${escapeRegex(input.roleName)}$`, $options: 'i' } }).lean().exec();
    if (dup) return { error: 'Role name already exists' };
    const role: Role = { ...input, roleId: generateId('ROLE'), createdAt: formatDate() };
    const created = await this.model().create(role);
    return stripInternals(created.toJSON() as Role);
  }

  async update(roleId: string, updates: Partial<Role>): Promise<Role | { error: string } | null> {
    if (updates.roleName) {
      const dup = await this.model().findOne({ roleName: { $regex: `^${escapeRegex(updates.roleName)}$`, $options: 'i' }, roleId: { $ne: roleId } }).lean().exec();
      if (dup) return { error: 'Role name already exists' };
    }
    const updated = await this.model()
      .findOneAndUpdate({ roleId }, { $set: updates }, { new: true })
      .lean<Role | null>()
      .exec();
    return updated ? stripInternals(updated) : null;
  }

  async delete(roleId: string, userCount: number): Promise<boolean | { error: string }> {
    if (userCount > 0) {
      return { error: `Cannot delete role. ${userCount} user(s) are assigned to this role.` };
    }
    const res = await this.model().deleteOne({ roleId }).exec();
    return (res.deletedCount ?? 0) > 0;
  }
}
