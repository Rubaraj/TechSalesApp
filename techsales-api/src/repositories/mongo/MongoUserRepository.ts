import type { User } from '../../types/index.js';
import { getUserModel } from '../../models/user.model.js';
import { generateId, formatDate } from '../../utils/paginate.js';

export interface UserSearchInput {
  searchTerm?: string;
  filters?: {
    roleId?: string;
    departmentId?: string;
    isActive?: boolean;
    accessLevel?: string;
  };
  sortBy?: keyof User;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface UserSearchResult {
  data: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const stripInternals = (doc: User & { _id?: unknown; __v?: unknown }): User => {
  const { _id: _i, __v: _v, ...rest } = doc as unknown as Record<string, unknown>;
  return rest as unknown as User;
};

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class MongoUserRepository {
  private model() {
    return getUserModel();
  }

  async findAll(): Promise<User[]> {
    const docs = await this.model().find().lean<User[]>().exec();
    return docs.map(stripInternals);
  }

  async findById(userId: string): Promise<User | null> {
    const doc = await this.model().findOne({ userId }).lean<User | null>().exec();
    return doc ? stripInternals(doc) : null;
  }

  async search(params: UserSearchInput): Promise<UserSearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 10, 100));
    const query: Record<string, unknown> = {};
    if (params.filters) {
      const f = params.filters;
      if (f.roleId) query.roleId = f.roleId;
      if (f.departmentId) query.departmentId = f.departmentId;
      if (f.isActive !== undefined) query.isActive = f.isActive;
      if (f.accessLevel) query.accessLevel = f.accessLevel;
    }
    if (params.searchTerm?.trim()) {
      const re = new RegExp(escapeRegex(params.searchTerm.trim()), 'i');
      query.$or = [{ username: re }, { firstName: re }, { lastName: re }, { email: re }];
    }
    const sort: Record<string, 1 | -1> = {};
    if (params.sortBy) sort[params.sortBy] = params.sortDir === 'desc' ? -1 : 1;

    const total = await this.model().countDocuments(query);
    const docs = await this.model()
      .find(query)
      .sort(Object.keys(sort).length ? sort : undefined)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<User[]>()
      .exec();
    return {
      data: docs.map(stripInternals),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async create(input: Omit<User, 'userId' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'lastLoginAt'>, createdBy: string): Promise<User | { error: string }> {
    const dupName = await this.model().findOne({ username: { $regex: `^${escapeRegex(input.username)}$`, $options: 'i' } }).lean().exec();
    if (dupName) return { error: 'Username already exists' };
    const dupEmail = await this.model().findOne({ email: { $regex: `^${escapeRegex(input.email)}$`, $options: 'i' } }).lean().exec();
    if (dupEmail) return { error: 'Email already exists' };
    const user: User = {
      ...input,
      userId: generateId('USER'),
      createdAt: formatDate(),
      createdBy,
    };
    const created = await this.model().create(user);
    return stripInternals(created.toJSON() as User);
  }

  async update(userId: string, updates: Partial<User>, updatedBy: string): Promise<User | { error: string } | null> {
    if (updates.username) {
      const dup = await this.model().findOne({ username: { $regex: `^${escapeRegex(updates.username)}$`, $options: 'i' }, userId: { $ne: userId } }).lean().exec();
      if (dup) return { error: 'Username already exists' };
    }
    if (updates.email) {
      const dup = await this.model().findOne({ email: { $regex: `^${escapeRegex(updates.email)}$`, $options: 'i' }, userId: { $ne: userId } }).lean().exec();
      if (dup) return { error: 'Email already exists' };
    }
    const updated = await this.model()
      .findOneAndUpdate({ userId }, { $set: { ...updates, updatedAt: formatDate(), updatedBy } }, { new: true })
      .lean<User | null>()
      .exec();
    return updated ? stripInternals(updated) : null;
  }

  async delete(userId: string): Promise<boolean | { error: string }> {
    const user = await this.model().findOne({ userId }).lean<User | null>().exec();
    if (!user) return false;
    if (user.isSuperAdmin) return { error: 'Cannot delete super admin user' };
    const res = await this.model().deleteOne({ userId }).exec();
    return (res.deletedCount ?? 0) > 0;
  }

  async toggleStatus(userId: string, updatedBy: string): Promise<User | { error: string } | null> {
    const user = await this.model().findOne({ userId }).exec();
    if (!user) return null;
    if (user.isSuperAdmin) return { error: 'Cannot deactivate super admin user' };
    user.isActive = !user.isActive;
    user.updatedAt = formatDate();
    user.updatedBy = updatedBy;
    await user.save();
    return stripInternals(user.toJSON() as User);
  }

  async countByRole(roleId: string): Promise<number> {
    return this.model().countDocuments({ roleId });
  }

  async countByDepartment(departmentId: string): Promise<number> {
    return this.model().countDocuments({ departmentId });
  }
}
