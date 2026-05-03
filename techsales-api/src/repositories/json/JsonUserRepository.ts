import path from 'node:path';
import type { User } from '../../types/index.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';
import { searchByFields, sortByField } from '../../utils/search.js';
import { paginateItems, generateId, formatDate } from '../../utils/paginate.js';
import type { UserSearchInput, UserSearchResult } from '../mongo/MongoUserRepository.js';

export class JsonUserRepository {
  private readonly filePath = path.join(BOOTSTRAP_PATHS.runtimeDir, 'users.json');
  private store: JsonStore<User[]> | null = null;

  private async getStore(): Promise<JsonStore<User[]>> {
    if (this.store) return this.store;
    this.store = await JsonStore.load<User[]>(this.filePath, [], { persist: env.JSON_PERSIST });
    return this.store;
  }

  async findAll(): Promise<User[]> {
    const s = await this.getStore();
    return [...s.get()];
  }

  async findById(userId: string): Promise<User | null> {
    const s = await this.getStore();
    return s.get().find((u) => u.userId === userId) ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const s = await this.getStore();
    const lower = username.toLowerCase();
    return s.get().find((u) => u.username.toLowerCase() === lower) ?? null;
  }

  async search(params: UserSearchInput): Promise<UserSearchResult> {
    const s = await this.getStore();
    let items = [...s.get()];
    if (params.searchTerm?.trim()) {
      items = searchByFields(items, params.searchTerm, ['username', 'firstName', 'lastName', 'email'] as (keyof User)[]);
    }
    if (params.filters) {
      const f = params.filters;
      if (f.roleId) items = items.filter((u) => u.roleId === f.roleId);
      if (f.departmentId) items = items.filter((u) => u.departmentId === f.departmentId);
      if (f.isActive !== undefined) items = items.filter((u) => u.isActive === f.isActive);
      if (f.accessLevel) items = items.filter((u) => u.accessLevel === f.accessLevel);
    }
    if (params.sortBy) items = sortByField(items, params.sortBy as keyof User, params.sortDir ?? 'asc');
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 10, 100));
    return paginateItems(items, page, pageSize);
  }

  async create(input: Omit<User, 'userId' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'lastLoginAt'>, createdBy: string): Promise<User | { error: string }> {
    const s = await this.getStore();
    const lower = input.username.toLowerCase();
    if (s.get().some((u) => u.username.toLowerCase() === lower)) return { error: 'Username already exists' };
    const lowerEmail = input.email.toLowerCase();
    if (s.get().some((u) => u.email.toLowerCase() === lowerEmail)) return { error: 'Email already exists' };
    const user: User = { ...input, userId: generateId('USER'), createdAt: formatDate(), createdBy };
    s.update((prev) => [...prev, user]);
    return user;
  }

  async update(userId: string, updates: Partial<User>, updatedBy: string): Promise<User | { error: string } | null> {
    const s = await this.getStore();
    const arr = s.get();
    const idx = arr.findIndex((u) => u.userId === userId);
    if (idx === -1) return null;
    if (updates.username) {
      const lower = updates.username.toLowerCase();
      if (arr.some((u) => u.userId !== userId && u.username.toLowerCase() === lower)) return { error: 'Username already exists' };
    }
    if (updates.email) {
      const lower = updates.email.toLowerCase();
      if (arr.some((u) => u.userId !== userId && u.email.toLowerCase() === lower)) return { error: 'Email already exists' };
    }
    let updated: User | null = null;
    s.update((prev) => {
      const i = prev.findIndex((u) => u.userId === userId);
      if (i === -1) return prev;
      const next = { ...prev[i], ...updates, updatedAt: formatDate(), updatedBy };
      updated = next;
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
    return updated;
  }

  async delete(userId: string): Promise<boolean | { error: string }> {
    const s = await this.getStore();
    const user = s.get().find((u) => u.userId === userId);
    if (!user) return false;
    if (user.isSuperAdmin) return { error: 'Cannot delete super admin user' };
    let deleted = false;
    s.update((prev) => {
      const i = prev.findIndex((u) => u.userId === userId);
      if (i === -1) return prev;
      deleted = true;
      const copy = [...prev];
      copy.splice(i, 1);
      return copy;
    });
    return deleted;
  }

  async toggleStatus(userId: string, updatedBy: string): Promise<User | { error: string } | null> {
    const s = await this.getStore();
    const user = s.get().find((u) => u.userId === userId);
    if (!user) return null;
    if (user.isSuperAdmin) return { error: 'Cannot deactivate super admin user' };
    let updated: User | null = null;
    s.update((prev) => {
      const i = prev.findIndex((u) => u.userId === userId);
      if (i === -1) return prev;
      const next = { ...prev[i], isActive: !prev[i].isActive, updatedAt: formatDate(), updatedBy };
      updated = next;
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
    return updated;
  }

  async countByRole(roleId: string): Promise<number> {
    const s = await this.getStore();
    return s.get().filter((u) => u.roleId === roleId).length;
  }

  async countByDepartment(departmentId: string): Promise<number> {
    const s = await this.getStore();
    return s.get().filter((u) => u.departmentId === departmentId).length;
  }
}
