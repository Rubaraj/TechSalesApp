import type { User, Role, Department, AccessLevel } from '../types';
import type { ServiceResponse } from './baseService';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/apiClient';
import { getMode } from '../api/mode';
import usersData from '../data/runtime/users.json';
import rolesData from '../data/runtime/roles.json';
import departmentsData from '../data/runtime/departments.json';
import {
  delay, generateId, formatDate, searchByFields, sortByField, paginateItems,
} from './baseService';

// In-memory data stores (used in 'local' mode + as the FE bundled fallback).
const _users: User[] = (usersData as unknown) as User[];
const _roles: Role[] = (rolesData as unknown) as Role[];
const _departments: Department[] = (departmentsData as unknown) as Department[];

export interface UserFilters {
  roleId?: string;
  departmentId?: string;
  isActive?: boolean;
  accessLevel?: AccessLevel;
}

export interface UserSearchParams {
  searchTerm?: string;
  filters?: UserFilters;
  sortField?: keyof User;
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

type SearchResult = { data: User[]; total: number; page: number; pageSize: number; totalPages: number };

// ============ USERS ============

const _getAllUsersApi = (): Promise<ServiceResponse<User[]>> => apiGet<User[]>('/users');
const _getAllUsersLocal = async (): Promise<ServiceResponse<User[]>> => { await delay(); return { success: true, data: _users }; };

const _getUserByIdApi = (id: string): Promise<ServiceResponse<User>> => apiGet<User>(`/users/${encodeURIComponent(id)}`);
const _getUserByIdLocal = async (id: string): Promise<ServiceResponse<User>> => {
  await delay();
  const u = _users.find(x => x.userId === id);
  return u ? { success: true, data: u } : { success: false, error: 'User not found' };
};

const _searchUsersApi = (params: UserSearchParams): Promise<ServiceResponse<SearchResult>> => {
  const qs = new URLSearchParams();
  if (params.searchTerm) qs.set('searchTerm', params.searchTerm);
  if (params.sortField) qs.set('sortField', String(params.sortField));
  if (params.sortDirection) qs.set('sortDirection', params.sortDirection);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  if (params.filters?.roleId) qs.set('roleId', params.filters.roleId);
  if (params.filters?.departmentId) qs.set('departmentId', params.filters.departmentId);
  if (params.filters?.isActive !== undefined) qs.set('isActive', String(params.filters.isActive));
  if (params.filters?.accessLevel) qs.set('accessLevel', params.filters.accessLevel);
  return apiGet<SearchResult>(`/users/search?${qs.toString()}`);
};

const _searchUsersLocal = async (params: UserSearchParams): Promise<ServiceResponse<SearchResult>> => {
  await delay();
  let arr = [..._users];
  if (params.searchTerm) arr = searchByFields(arr, params.searchTerm, ['username', 'firstName', 'lastName', 'email']);
  if (params.filters) {
    const f = params.filters;
    if (f.roleId) arr = arr.filter(u => u.roleId === f.roleId);
    if (f.departmentId) arr = arr.filter(u => u.departmentId === f.departmentId);
    if (f.isActive !== undefined) arr = arr.filter(u => u.isActive === f.isActive);
    if (f.accessLevel) arr = arr.filter(u => u.accessLevel === f.accessLevel);
  }
  if (params.sortField) arr = sortByField(arr, params.sortField, params.sortDirection || 'asc');
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  const { data, total, totalPages } = paginateItems(arr, page, pageSize);
  return { success: true, data: { data, total, page, pageSize, totalPages } };
};

type CreateUserInput = Omit<User, 'userId' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'lastLoginAt'>;

const _createUserApi = (data: CreateUserInput, createdBy: string): Promise<ServiceResponse<User>> =>
  apiPost<User>('/users', { ...data, createdBy });
const _createUserLocal = async (data: CreateUserInput, createdBy: string): Promise<ServiceResponse<User>> => {
  await delay();
  if (_users.find(u => u.username.toLowerCase() === data.username.toLowerCase())) return { success: false, error: 'Username already exists' };
  if (_users.find(u => u.email.toLowerCase() === data.email.toLowerCase())) return { success: false, error: 'Email already exists' };
  const u: User = { ...data, userId: generateId('USER'), createdAt: formatDate(), createdBy };
  _users.push(u);
  return { success: true, data: u, message: 'User created successfully' };
};

const _updateUserApi = (id: string, updates: Partial<User>, updatedBy: string): Promise<ServiceResponse<User>> =>
  apiPatch<User>(`/users/${encodeURIComponent(id)}`, { ...updates, updatedBy });
const _updateUserLocal = async (id: string, updates: Partial<User>, updatedBy: string): Promise<ServiceResponse<User>> => {
  await delay();
  const i = _users.findIndex(u => u.userId === id);
  if (i === -1) return { success: false, error: 'User not found' };
  if (updates.username && _users.find(u => u.username.toLowerCase() === updates.username!.toLowerCase() && u.userId !== id))
    return { success: false, error: 'Username already exists' };
  if (updates.email && _users.find(u => u.email.toLowerCase() === updates.email!.toLowerCase() && u.userId !== id))
    return { success: false, error: 'Email already exists' };
  _users[i] = { ..._users[i], ...updates, updatedAt: formatDate(), updatedBy };
  return { success: true, data: _users[i], message: 'User updated successfully' };
};

const _deleteUserApi = (id: string): Promise<ServiceResponse<null>> => apiDelete<null>(`/users/${encodeURIComponent(id)}`);
const _deleteUserLocal = async (id: string): Promise<ServiceResponse<null>> => {
  await delay();
  const i = _users.findIndex(u => u.userId === id);
  if (i === -1) return { success: false, error: 'User not found' };
  if (_users[i].isSuperAdmin) return { success: false, error: 'Cannot delete super admin user' };
  _users.splice(i, 1);
  return { success: true, data: null, message: 'User deleted successfully' };
};

const _toggleUserStatusApi = (id: string, updatedBy: string): Promise<ServiceResponse<User>> =>
  apiPost<User>(`/users/${encodeURIComponent(id)}/toggle-status`, { updatedBy });
const _toggleUserStatusLocal = async (id: string, updatedBy: string): Promise<ServiceResponse<User>> => {
  await delay();
  const u = _users.find(x => x.userId === id);
  if (!u) return { success: false, error: 'User not found' };
  if (u.isSuperAdmin) return { success: false, error: 'Cannot deactivate super admin user' };
  u.isActive = !u.isActive;
  u.updatedAt = formatDate();
  u.updatedBy = updatedBy;
  return { success: true, data: u, message: `User ${u.isActive ? 'activated' : 'deactivated'} successfully` };
};

export const getAllUsers = (): Promise<ServiceResponse<User[]>> => getMode() === 'local' ? _getAllUsersLocal() : _getAllUsersApi();
export const getUserById = (id: string) => getMode() === 'local' ? _getUserByIdLocal(id) : _getUserByIdApi(id);
export const searchUsers = (p: UserSearchParams) => getMode() === 'local' ? _searchUsersLocal(p) : _searchUsersApi(p);
export const createUser = (data: CreateUserInput, createdBy: string) => getMode() === 'local' ? _createUserLocal(data, createdBy) : _createUserApi(data, createdBy);
export const updateUser = (id: string, updates: Partial<User>, updatedBy: string) => getMode() === 'local' ? _updateUserLocal(id, updates, updatedBy) : _updateUserApi(id, updates, updatedBy);
export const deleteUser = (id: string) => getMode() === 'local' ? _deleteUserLocal(id) : _deleteUserApi(id);
export const toggleUserStatus = (id: string, updatedBy: string) => getMode() === 'local' ? _toggleUserStatusLocal(id, updatedBy) : _toggleUserStatusApi(id, updatedBy);

// ============ ROLES ============

const _getAllRolesApi = (): Promise<ServiceResponse<Role[]>> => apiGet<Role[]>('/roles');
const _getAllRolesLocal = async (): Promise<ServiceResponse<Role[]>> => { await delay(); return { success: true, data: _roles.filter(r => r.isActive) }; };

const _getRoleByIdApi = (id: string): Promise<ServiceResponse<Role>> => apiGet<Role>(`/roles/${encodeURIComponent(id)}`);
const _getRoleByIdLocal = async (id: string): Promise<ServiceResponse<Role>> => {
  await delay();
  const r = _roles.find(x => x.roleId === id);
  return r ? { success: true, data: r } : { success: false, error: 'Role not found' };
};

const _createRoleApi = (data: Omit<Role, 'roleId' | 'createdAt'>): Promise<ServiceResponse<Role>> => apiPost<Role>('/roles', data);
const _createRoleLocal = async (data: Omit<Role, 'roleId' | 'createdAt'>): Promise<ServiceResponse<Role>> => {
  await delay();
  if (_roles.find(r => r.roleName.toLowerCase() === data.roleName.toLowerCase())) return { success: false, error: 'Role name already exists' };
  const r: Role = { ...data, roleId: generateId('ROLE'), createdAt: formatDate() };
  _roles.push(r);
  return { success: true, data: r, message: 'Role created successfully' };
};

const _updateRoleApi = (id: string, updates: Partial<Role>): Promise<ServiceResponse<Role>> => apiPatch<Role>(`/roles/${encodeURIComponent(id)}`, updates);
const _updateRoleLocal = async (id: string, updates: Partial<Role>): Promise<ServiceResponse<Role>> => {
  await delay();
  const i = _roles.findIndex(r => r.roleId === id);
  if (i === -1) return { success: false, error: 'Role not found' };
  if (updates.roleName && _roles.find(r => r.roleName.toLowerCase() === updates.roleName!.toLowerCase() && r.roleId !== id))
    return { success: false, error: 'Role name already exists' };
  _roles[i] = { ..._roles[i], ...updates };
  return { success: true, data: _roles[i], message: 'Role updated successfully' };
};

const _deleteRoleApi = (id: string): Promise<ServiceResponse<null>> => apiDelete<null>(`/roles/${encodeURIComponent(id)}`);
const _deleteRoleLocal = async (id: string): Promise<ServiceResponse<null>> => {
  await delay();
  const usersWithRole = _users.filter(u => u.roleId === id);
  if (usersWithRole.length > 0)
    return { success: false, error: `Cannot delete role. ${usersWithRole.length} user(s) are assigned to this role.` };
  const i = _roles.findIndex(r => r.roleId === id);
  if (i === -1) return { success: false, error: 'Role not found' };
  _roles.splice(i, 1);
  return { success: true, data: null, message: 'Role deleted successfully' };
};

export const getAllRoles = () => getMode() === 'local' ? _getAllRolesLocal() : _getAllRolesApi();
export const getRoleById = (id: string) => getMode() === 'local' ? _getRoleByIdLocal(id) : _getRoleByIdApi(id);
export const createRole = (data: Omit<Role, 'roleId' | 'createdAt'>) => getMode() === 'local' ? _createRoleLocal(data) : _createRoleApi(data);
export const updateRole = (id: string, updates: Partial<Role>) => getMode() === 'local' ? _updateRoleLocal(id, updates) : _updateRoleApi(id, updates);
export const deleteRole = (id: string) => getMode() === 'local' ? _deleteRoleLocal(id) : _deleteRoleApi(id);

// ============ DEPARTMENTS ============

const _getAllDeptsApi = (): Promise<ServiceResponse<Department[]>> => apiGet<Department[]>('/departments');
const _getAllDeptsLocal = async (): Promise<ServiceResponse<Department[]>> => { await delay(); return { success: true, data: _departments.filter(d => d.isActive) }; };

const _getDeptByIdApi = (id: string): Promise<ServiceResponse<Department>> => apiGet<Department>(`/departments/${encodeURIComponent(id)}`);
const _getDeptByIdLocal = async (id: string): Promise<ServiceResponse<Department>> => {
  await delay();
  const d = _departments.find(x => x.departmentId === id);
  return d ? { success: true, data: d } : { success: false, error: 'Department not found' };
};

type CreateDeptInput = Omit<Department, 'departmentId' | 'createdAt' | 'createdBy'>;

const _createDeptApi = (data: CreateDeptInput, createdBy: string): Promise<ServiceResponse<Department>> =>
  apiPost<Department>('/departments', { ...data, createdBy });
const _createDeptLocal = async (data: CreateDeptInput, createdBy: string): Promise<ServiceResponse<Department>> => {
  await delay();
  if (_departments.find(d => d.departmentName.toLowerCase() === data.departmentName.toLowerCase()))
    return { success: false, error: 'Department name already exists' };
  const d: Department = { ...data, departmentId: generateId('DEPT'), createdAt: formatDate(), createdBy };
  _departments.push(d);
  return { success: true, data: d, message: 'Department created successfully' };
};

const _updateDeptApi = (id: string, updates: Partial<Department>): Promise<ServiceResponse<Department>> =>
  apiPatch<Department>(`/departments/${encodeURIComponent(id)}`, updates);
const _updateDeptLocal = async (id: string, updates: Partial<Department>): Promise<ServiceResponse<Department>> => {
  await delay();
  const i = _departments.findIndex(d => d.departmentId === id);
  if (i === -1) return { success: false, error: 'Department not found' };
  if (updates.departmentName && _departments.find(d => d.departmentName.toLowerCase() === updates.departmentName!.toLowerCase() && d.departmentId !== id))
    return { success: false, error: 'Department name already exists' };
  _departments[i] = { ..._departments[i], ...updates };
  return { success: true, data: _departments[i], message: 'Department updated successfully' };
};

const _deleteDeptApi = (id: string): Promise<ServiceResponse<null>> => apiDelete<null>(`/departments/${encodeURIComponent(id)}`);
const _deleteDeptLocal = async (id: string): Promise<ServiceResponse<null>> => {
  await delay();
  const usersInDept = _users.filter(u => u.departmentId === id);
  if (usersInDept.length > 0)
    return { success: false, error: `Cannot delete department. ${usersInDept.length} user(s) are assigned to this department.` };
  const i = _departments.findIndex(d => d.departmentId === id);
  if (i === -1) return { success: false, error: 'Department not found' };
  _departments.splice(i, 1);
  return { success: true, data: null, message: 'Department deleted successfully' };
};

export const getAllDepartments = () => getMode() === 'local' ? _getAllDeptsLocal() : _getAllDeptsApi();
export const getDepartmentById = (id: string) => getMode() === 'local' ? _getDeptByIdLocal(id) : _getDeptByIdApi(id);
export const createDepartment = (data: CreateDeptInput, createdBy: string) => getMode() === 'local' ? _createDeptLocal(data, createdBy) : _createDeptApi(data, createdBy);
export const updateDepartment = (id: string, updates: Partial<Department>) => getMode() === 'local' ? _updateDeptLocal(id, updates) : _updateDeptApi(id, updates);
export const deleteDepartment = (id: string) => getMode() === 'local' ? _deleteDeptLocal(id) : _deleteDeptApi(id);

export const getUserCountByRole = async (roleId: string): Promise<ServiceResponse<number>> => {
  if (getMode() === 'api') return apiGet<number>(`/roles/${encodeURIComponent(roleId)}/user-count`);
  await delay();
  return { success: true, data: _users.filter(u => u.roleId === roleId).length };
};
export const getUserCountByDepartment = async (departmentId: string): Promise<ServiceResponse<number>> => {
  if (getMode() === 'api') return apiGet<number>(`/departments/${encodeURIComponent(departmentId)}/user-count`);
  await delay();
  return { success: true, data: _users.filter(u => u.departmentId === departmentId).length };
};
