import path from 'node:path';
import type { Role } from '../../types/index.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';
import { generateId, formatDate } from '../../utils/paginate.js';

export class JsonRoleRepository {
  private readonly filePath = path.join(BOOTSTRAP_PATHS.runtimeDir, 'roles.json');
  private store: JsonStore<Role[]> | null = null;

  private async getStore(): Promise<JsonStore<Role[]>> {
    if (this.store) return this.store;
    this.store = await JsonStore.load<Role[]>(this.filePath, [], { persist: env.JSON_PERSIST });
    return this.store;
  }

  async findAll(activeOnly = true): Promise<Role[]> {
    const s = await this.getStore();
    return activeOnly ? s.get().filter((r) => r.isActive) : [...s.get()];
  }

  async findById(roleId: string): Promise<Role | null> {
    const s = await this.getStore();
    return s.get().find((r) => r.roleId === roleId) ?? null;
  }

  async create(input: Omit<Role, 'roleId' | 'createdAt'>): Promise<Role | { error: string }> {
    const s = await this.getStore();
    const lower = input.roleName.toLowerCase();
    if (s.get().some((r) => r.roleName.toLowerCase() === lower)) return { error: 'Role name already exists' };
    const role: Role = { ...input, roleId: generateId('ROLE'), createdAt: formatDate() };
    s.update((prev) => [...prev, role]);
    return role;
  }

  async update(roleId: string, updates: Partial<Role>): Promise<Role | { error: string } | null> {
    const s = await this.getStore();
    const arr = s.get();
    const idx = arr.findIndex((r) => r.roleId === roleId);
    if (idx === -1) return null;
    if (updates.roleName) {
      const lower = updates.roleName.toLowerCase();
      if (arr.some((r) => r.roleId !== roleId && r.roleName.toLowerCase() === lower)) return { error: 'Role name already exists' };
    }
    let updated: Role | null = null;
    s.update((prev) => {
      const i = prev.findIndex((r) => r.roleId === roleId);
      if (i === -1) return prev;
      const next = { ...prev[i], ...updates };
      updated = next;
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
    return updated;
  }

  async delete(roleId: string, userCount: number): Promise<boolean | { error: string }> {
    if (userCount > 0) return { error: `Cannot delete role. ${userCount} user(s) are assigned to this role.` };
    const s = await this.getStore();
    let deleted = false;
    s.update((prev) => {
      const i = prev.findIndex((r) => r.roleId === roleId);
      if (i === -1) return prev;
      deleted = true;
      const copy = [...prev];
      copy.splice(i, 1);
      return copy;
    });
    return deleted;
  }
}
