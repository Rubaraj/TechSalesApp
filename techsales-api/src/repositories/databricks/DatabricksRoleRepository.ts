/**
 * Databricks-backed role repository — same surface as `MongoRoleRepository`.
 */
import type { Role } from '../../types/index.js';
import { generateId, formatDate } from '../../utils/paginate.js';
import {
  APP_TABLES,
  appTable,
  selectAll,
  selectById,
  insertRow,
  updateRow,
  deleteRow,
} from './databricksHelpers.js';

export class DatabricksRoleRepository {
  private table(): string {
    return appTable(APP_TABLES.roles);
  }

  async findAll(activeOnly = true): Promise<Role[]> {
    const rows = await selectAll<Role>(this.table());
    return activeOnly ? rows.filter((r) => r.isActive !== false) : rows;
  }

  async findById(roleId: string): Promise<Role | null> {
    return selectById<Role>(this.table(), 'role_id', roleId);
  }

  async create(input: Omit<Role, 'roleId' | 'createdAt'>): Promise<Role | { error: string }> {
    const all = await selectAll<Role>(this.table());
    const nameLower = input.roleName.toLowerCase();
    if (all.some((r) => r.roleName.toLowerCase() === nameLower)) {
      return { error: 'Role name already exists' };
    }
    const role: Role = { ...input, roleId: generateId('ROLE'), createdAt: formatDate() };
    await insertRow(this.table(), 'role_id', role.roleId, role, role.createdAt, undefined);
    return role;
  }

  async update(
    roleId: string,
    updates: Partial<Role>,
  ): Promise<Role | { error: string } | null> {
    const existing = await this.findById(roleId);
    if (!existing) return null;
    if (updates.roleName) {
      const all = await selectAll<Role>(this.table());
      const dup = all.find(
        (r) => r.roleId !== roleId && r.roleName.toLowerCase() === updates.roleName!.toLowerCase(),
      );
      if (dup) return { error: 'Role name already exists' };
    }
    const next: Role = { ...existing, ...updates, roleId };
    await updateRow(this.table(), 'role_id', roleId, next, formatDate());
    return next;
  }

  async delete(roleId: string, userCount: number): Promise<boolean | { error: string }> {
    if (userCount > 0) {
      return { error: `Cannot delete role. ${userCount} user(s) are assigned to this role.` };
    }
    return deleteRow(this.table(), 'role_id', roleId);
  }
}
