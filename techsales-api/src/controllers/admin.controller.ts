/**
 * Admin module controller — users, roles, departments. Wraps the corresponding
 * repos into `ServiceResponse<T>` per plan §6.
 *
 * Why one file: these three resources share concerns (referential integrity for
 * role/department deletion uses the user count). Splitting them adds friction
 * without separation benefit. The routes are still mounted on distinct paths.
 */
import type { Request, Response } from 'express';
import type { Department, Role, User } from '../types/index.js';
import type { ServiceResponse } from '../repositories/types.js';
import { repos } from '../repositories/registry.js';

const param = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '');
const stringOrUndef = (v: unknown): string | undefined => (typeof v === 'string' && v.length ? v : undefined);
const numOrUndef = (v: unknown): number | undefined => {
  if (typeof v !== 'string') return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
};
const boolOrUndef = (v: unknown): boolean | undefined => {
  if (typeof v !== 'string') return undefined;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
};

// ============ USERS ============

export async function getAllUsers(_req: Request, res: Response<ServiceResponse<User[]>>): Promise<void> {
  res.json({ success: true, data: await repos.user.findAll() });
}

export async function getUserById(req: Request, res: Response<ServiceResponse<User>>): Promise<void> {
  const u = await repos.user.findById(param(req.params.id));
  if (!u) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  res.json({ success: true, data: u });
}

export async function searchUsers(
  req: Request,
  res: Response<ServiceResponse<{ data: User[]; total: number; page: number; pageSize: number; totalPages: number }>>,
): Promise<void> {
  const q = req.query;
  const result = await repos.user.search({
    searchTerm: stringOrUndef(q.searchTerm) ?? stringOrUndef(q.q),
    sortBy: (stringOrUndef(q.sortBy) ?? stringOrUndef(q.sortField)) as keyof User | undefined,
    sortDir: (stringOrUndef(q.sortDir) ?? stringOrUndef(q.sortDirection)) === 'desc' ? 'desc' : 'asc',
    page: numOrUndef(q.page) ?? 1,
    pageSize: numOrUndef(q.pageSize) ?? 10,
    filters: {
      roleId: stringOrUndef(q.roleId),
      departmentId: stringOrUndef(q.departmentId),
      isActive: boolOrUndef(q.isActive),
      accessLevel: stringOrUndef(q.accessLevel),
    },
  });
  res.json({ success: true, data: result });
}

export async function createUser(req: Request, res: Response<ServiceResponse<User>>): Promise<void> {
  const body = (req.body ?? {}) as Partial<User> & { createdBy?: string };
  if (!body.createdBy) {
    res.status(400).json({ success: false, error: 'createdBy is required' });
    return;
  }
  const { createdBy, userId: _ignore, createdAt: _ignore2, ...input } = body;
  const result = await repos.user.create(input as Parameters<typeof repos.user.create>[0], createdBy);
  if ('error' in result) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  res.status(201).json({ success: true, data: result, message: 'User created successfully' });
}

export async function updateUser(req: Request, res: Response<ServiceResponse<User>>): Promise<void> {
  const body = (req.body ?? {}) as Partial<User> & { updatedBy?: string };
  const updatedBy = body.updatedBy ?? 'system';
  const { updatedBy: _ignore, ...patch } = body;
  const result = await repos.user.update(param(req.params.id), patch, updatedBy);
  if (result === null) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  if ('error' in result) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result, message: 'User updated successfully' });
}

export async function deleteUser(req: Request, res: Response<ServiceResponse<null>>): Promise<void> {
  const result = await repos.user.delete(param(req.params.id));
  if (result === false) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  if (typeof result === 'object' && 'error' in result) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: null, message: 'User deleted successfully' });
}

export async function toggleUserStatus(req: Request, res: Response<ServiceResponse<User>>): Promise<void> {
  const updatedBy = stringOrUndef((req.body ?? {}).updatedBy) ?? 'system';
  const result = await repos.user.toggleStatus(param(req.params.id), updatedBy);
  if (result === null) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  if ('error' in result) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result, message: `User ${result.isActive ? 'activated' : 'deactivated'} successfully` });
}

// ============ ROLES ============

export async function getAllRoles(_req: Request, res: Response<ServiceResponse<Role[]>>): Promise<void> {
  res.json({ success: true, data: await repos.role.findAll(true) });
}

export async function getRoleById(req: Request, res: Response<ServiceResponse<Role>>): Promise<void> {
  const r = await repos.role.findById(param(req.params.id));
  if (!r) {
    res.status(404).json({ success: false, error: 'Role not found' });
    return;
  }
  res.json({ success: true, data: r });
}

export async function createRole(req: Request, res: Response<ServiceResponse<Role>>): Promise<void> {
  const body = (req.body ?? {}) as Omit<Role, 'roleId' | 'createdAt'>;
  const result = await repos.role.create(body);
  if ('error' in result) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  res.status(201).json({ success: true, data: result, message: 'Role created successfully' });
}

export async function updateRole(req: Request, res: Response<ServiceResponse<Role>>): Promise<void> {
  const result = await repos.role.update(param(req.params.id), req.body ?? {});
  if (result === null) {
    res.status(404).json({ success: false, error: 'Role not found' });
    return;
  }
  if ('error' in result) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result, message: 'Role updated successfully' });
}

export async function deleteRole(req: Request, res: Response<ServiceResponse<null>>): Promise<void> {
  const roleId = param(req.params.id);
  const userCount = await repos.user.countByRole(roleId);
  const result = await repos.role.delete(roleId, userCount);
  if (result === false) {
    res.status(404).json({ success: false, error: 'Role not found' });
    return;
  }
  if (typeof result === 'object' && 'error' in result) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: null, message: 'Role deleted successfully' });
}

export async function getUserCountByRole(req: Request, res: Response<ServiceResponse<number>>): Promise<void> {
  const count = await repos.user.countByRole(param(req.params.id));
  res.json({ success: true, data: count });
}

// ============ DEPARTMENTS ============

export async function getAllDepartments(_req: Request, res: Response<ServiceResponse<Department[]>>): Promise<void> {
  res.json({ success: true, data: await repos.department.findAll(true) });
}

export async function getDepartmentById(req: Request, res: Response<ServiceResponse<Department>>): Promise<void> {
  const d = await repos.department.findById(param(req.params.id));
  if (!d) {
    res.status(404).json({ success: false, error: 'Department not found' });
    return;
  }
  res.json({ success: true, data: d });
}

export async function createDepartment(req: Request, res: Response<ServiceResponse<Department>>): Promise<void> {
  const body = (req.body ?? {}) as Partial<Department> & { createdBy?: string };
  if (!body.createdBy) {
    res.status(400).json({ success: false, error: 'createdBy is required' });
    return;
  }
  const { createdBy, departmentId: _ignore, createdAt: _ignore2, ...input } = body;
  const result = await repos.department.create(input as Parameters<typeof repos.department.create>[0], createdBy);
  if ('error' in result) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  res.status(201).json({ success: true, data: result, message: 'Department created successfully' });
}

export async function updateDepartment(req: Request, res: Response<ServiceResponse<Department>>): Promise<void> {
  const result = await repos.department.update(param(req.params.id), req.body ?? {});
  if (result === null) {
    res.status(404).json({ success: false, error: 'Department not found' });
    return;
  }
  if ('error' in result) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result, message: 'Department updated successfully' });
}

export async function deleteDepartment(req: Request, res: Response<ServiceResponse<null>>): Promise<void> {
  const deptId = param(req.params.id);
  const userCount = await repos.user.countByDepartment(deptId);
  const result = await repos.department.delete(deptId, userCount);
  if (result === false) {
    res.status(404).json({ success: false, error: 'Department not found' });
    return;
  }
  if (typeof result === 'object' && 'error' in result) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: null, message: 'Department deleted successfully' });
}

export async function getUserCountByDepartment(req: Request, res: Response<ServiceResponse<number>>): Promise<void> {
  const count = await repos.user.countByDepartment(param(req.params.id));
  res.json({ success: true, data: count });
}
