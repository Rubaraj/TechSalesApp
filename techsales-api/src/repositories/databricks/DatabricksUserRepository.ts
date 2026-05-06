/**
 * Databricks-backed user repository — same surface as `MongoUserRepository`,
 * backed by a JSON-blob Delta table.
 */
import type { User } from '../../types/index.js';
import { generateId, formatDate } from '../../utils/paginate.js';
import {
  APP_TABLES,
  appTable,
  selectAll,
  selectById,
  insertRow,
  updateRow,
  deleteRow,
  inMemorySearch,
  db,
} from './databricksHelpers.js';

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

export class DatabricksUserRepository {
  private table(): string {
    return appTable(APP_TABLES.users);
  }

  async findAll(): Promise<User[]> {
    return selectAll<User>(this.table());
  }

  async findById(userId: string): Promise<User | null> {
    return selectById<User>(this.table(), 'user_id', userId);
  }

  async search(params: UserSearchInput): Promise<UserSearchResult> {
    const all = await this.findAll();
    return inMemorySearch<User>({
      rows: all,
      ...(params.searchTerm !== undefined ? { searchTerm: params.searchTerm } : {}),
      searchFields: ['username', 'firstName', 'lastName', 'email'] as Array<keyof User>,
      ...(params.filters ? { filters: params.filters as Partial<User> } : {}),
      ...(params.sortBy ? { sortBy: params.sortBy } : {}),
      ...(params.sortDir ? { sortDir: params.sortDir } : {}),
      ...(params.page !== undefined ? { page: params.page } : {}),
      ...(params.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
    });
  }

  async create(
    input: Omit<User, 'userId' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'lastLoginAt'>,
    createdBy: string,
  ): Promise<User | { error: string }> {
    const all = await this.findAll();
    const usernameLower = input.username.toLowerCase();
    if (all.some((u) => u.username.toLowerCase() === usernameLower)) {
      return { error: 'Username already exists' };
    }
    const emailLower = input.email.toLowerCase();
    if (all.some((u) => u.email.toLowerCase() === emailLower)) {
      return { error: 'Email already exists' };
    }
    const user: User = {
      ...input,
      userId: generateId('USER'),
      createdAt: formatDate(),
      createdBy,
    };
    await insertRow(this.table(), 'user_id', user.userId, user, user.createdAt, undefined);
    return user;
  }

  async update(
    userId: string,
    updates: Partial<User>,
    updatedBy: string,
  ): Promise<User | { error: string } | null> {
    const existing = await this.findById(userId);
    if (!existing) return null;
    if (updates.username) {
      const all = await this.findAll();
      const dup = all.find(
        (u) => u.userId !== userId && u.username.toLowerCase() === updates.username!.toLowerCase(),
      );
      if (dup) return { error: 'Username already exists' };
    }
    if (updates.email) {
      const all = await this.findAll();
      const dup = all.find(
        (u) => u.userId !== userId && u.email.toLowerCase() === updates.email!.toLowerCase(),
      );
      if (dup) return { error: 'Email already exists' };
    }
    const updatedAt = formatDate();
    const next: User = { ...existing, ...updates, userId, updatedAt, updatedBy };
    await updateRow(this.table(), 'user_id', userId, next, updatedAt);
    return next;
  }

  async delete(userId: string): Promise<boolean | { error: string }> {
    const existing = await this.findById(userId);
    if (!existing) return false;
    if (existing.isSuperAdmin) return { error: 'Cannot delete super admin user' };
    return deleteRow(this.table(), 'user_id', userId);
  }

  async toggleStatus(userId: string, updatedBy: string): Promise<User | { error: string } | null> {
    const existing = await this.findById(userId);
    if (!existing) return null;
    if (existing.isSuperAdmin) return { error: 'Cannot deactivate super admin user' };
    const updatedAt = formatDate();
    const next: User = { ...existing, isActive: !existing.isActive, updatedAt, updatedBy };
    await updateRow(this.table(), 'user_id', userId, next, updatedAt);
    return next;
  }

  async countByRole(roleId: string): Promise<number> {
    const rows = await db().query<{ c: number }>(
      `SELECT count(*) as c FROM ${this.table()} WHERE get_json_object(data, '$.roleId') = ?`,
      [roleId],
    );
    return rows[0]?.c ?? 0;
  }

  async countByDepartment(departmentId: string): Promise<number> {
    const rows = await db().query<{ c: number }>(
      `SELECT count(*) as c FROM ${this.table()} WHERE get_json_object(data, '$.departmentId') = ?`,
      [departmentId],
    );
    return rows[0]?.c ?? 0;
  }
}
