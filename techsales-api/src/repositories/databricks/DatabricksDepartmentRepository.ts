/**
 * Databricks-backed department repository — same surface as
 * `MongoDepartmentRepository`.
 */
import type { Department } from '../../types/index.js';
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

export class DatabricksDepartmentRepository {
  private table(): string {
    return appTable(APP_TABLES.departments);
  }

  async findAll(activeOnly = true): Promise<Department[]> {
    const rows = await selectAll<Department>(this.table());
    return activeOnly ? rows.filter((d) => d.isActive !== false) : rows;
  }

  async findById(departmentId: string): Promise<Department | null> {
    return selectById<Department>(this.table(), 'department_id', departmentId);
  }

  async create(
    input: Omit<Department, 'departmentId' | 'createdAt' | 'createdBy'>,
    createdBy: string,
  ): Promise<Department | { error: string }> {
    const all = await selectAll<Department>(this.table());
    const nameLower = input.departmentName.toLowerCase();
    if (all.some((d) => d.departmentName.toLowerCase() === nameLower)) {
      return { error: 'Department name already exists' };
    }
    const dept: Department = {
      ...input,
      departmentId: generateId('DEPT'),
      createdAt: formatDate(),
      createdBy,
    };
    await insertRow(this.table(), 'department_id', dept.departmentId, dept, dept.createdAt, undefined);
    return dept;
  }

  async update(
    departmentId: string,
    updates: Partial<Department>,
  ): Promise<Department | { error: string } | null> {
    const existing = await this.findById(departmentId);
    if (!existing) return null;
    if (updates.departmentName) {
      const all = await selectAll<Department>(this.table());
      const dup = all.find(
        (d) =>
          d.departmentId !== departmentId &&
          d.departmentName.toLowerCase() === updates.departmentName!.toLowerCase(),
      );
      if (dup) return { error: 'Department name already exists' };
    }
    const next: Department = { ...existing, ...updates, departmentId };
    await updateRow(this.table(), 'department_id', departmentId, next, formatDate());
    return next;
  }

  async delete(
    departmentId: string,
    userCount: number,
  ): Promise<boolean | { error: string }> {
    if (userCount > 0) {
      return {
        error: `Cannot delete department. ${userCount} user(s) are assigned to this department.`,
      };
    }
    return deleteRow(this.table(), 'department_id', departmentId);
  }
}
