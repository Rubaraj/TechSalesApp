import path from 'node:path';
import type { Department } from '../../types/index.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';
import { generateId, formatDate } from '../../utils/paginate.js';

export class JsonDepartmentRepository {
  private readonly filePath = path.join(BOOTSTRAP_PATHS.runtimeDir, 'departments.json');
  private store: JsonStore<Department[]> | null = null;

  private async getStore(): Promise<JsonStore<Department[]>> {
    if (this.store) return this.store;
    this.store = await JsonStore.load<Department[]>(this.filePath, [], { persist: env.JSON_PERSIST });
    return this.store;
  }

  async findAll(activeOnly = true): Promise<Department[]> {
    const s = await this.getStore();
    return activeOnly ? s.get().filter((d) => d.isActive) : [...s.get()];
  }

  async findById(departmentId: string): Promise<Department | null> {
    const s = await this.getStore();
    return s.get().find((d) => d.departmentId === departmentId) ?? null;
  }

  async create(input: Omit<Department, 'departmentId' | 'createdAt' | 'createdBy'>, createdBy: string): Promise<Department | { error: string }> {
    const s = await this.getStore();
    const lower = input.departmentName.toLowerCase();
    if (s.get().some((d) => d.departmentName.toLowerCase() === lower)) return { error: 'Department name already exists' };
    const dept: Department = { ...input, departmentId: generateId('DEPT'), createdAt: formatDate(), createdBy };
    s.update((prev) => [...prev, dept]);
    return dept;
  }

  async update(departmentId: string, updates: Partial<Department>): Promise<Department | { error: string } | null> {
    const s = await this.getStore();
    const arr = s.get();
    const idx = arr.findIndex((d) => d.departmentId === departmentId);
    if (idx === -1) return null;
    if (updates.departmentName) {
      const lower = updates.departmentName.toLowerCase();
      if (arr.some((d) => d.departmentId !== departmentId && d.departmentName.toLowerCase() === lower)) return { error: 'Department name already exists' };
    }
    let updated: Department | null = null;
    s.update((prev) => {
      const i = prev.findIndex((d) => d.departmentId === departmentId);
      if (i === -1) return prev;
      const next = { ...prev[i], ...updates };
      updated = next;
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
    return updated;
  }

  async delete(departmentId: string, userCount: number): Promise<boolean | { error: string }> {
    if (userCount > 0) return { error: `Cannot delete department. ${userCount} user(s) are assigned to this department.` };
    const s = await this.getStore();
    let deleted = false;
    s.update((prev) => {
      const i = prev.findIndex((d) => d.departmentId === departmentId);
      if (i === -1) return prev;
      deleted = true;
      const copy = [...prev];
      copy.splice(i, 1);
      return copy;
    });
    return deleted;
  }
}
