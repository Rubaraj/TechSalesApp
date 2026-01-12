import type { User, Role, Department, AccessLevel } from '../types';
import type { ServiceResponse } from './baseService';
import usersData from '../data/runtime/users.json';
import rolesData from '../data/runtime/roles.json';
import departmentsData from '../data/runtime/departments.json';
import { 
  delay, 
  generateId, 
  formatDate, 
  searchByFields,
  sortByField, 
  paginateItems,
} from './baseService';

// In-memory data stores - using unknown cast to handle JSON structure differences
let users: User[] = (usersData as unknown) as User[];
let roles: Role[] = (rolesData as unknown) as Role[];
let departments: Department[] = (departmentsData as unknown) as Department[];

// ============ USER OPERATIONS ============

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

// Get all users
export const getAllUsers = async (): Promise<ServiceResponse<User[]>> => {
  await delay();
  return { success: true, data: users };
};

// Get user by ID
export const getUserById = async (userId: string): Promise<ServiceResponse<User>> => {
  await delay();
  const user = users.find(u => u.userId === userId);
  
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  return { success: true, data: user };
};

// Search users
export const searchUsers = async (params: UserSearchParams): Promise<ServiceResponse<{
  data: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}>> => {
  await delay();
  
  let filteredUsers = [...users];
  
  // Apply search
  if (params.searchTerm) {
    filteredUsers = searchByFields(filteredUsers, params.searchTerm, [
      'username', 'firstName', 'lastName', 'email'
    ]);
  }
  
  // Apply filters
  if (params.filters) {
    if (params.filters.roleId) {
      filteredUsers = filteredUsers.filter(u => u.roleId === params.filters!.roleId);
    }
    if (params.filters.departmentId) {
      filteredUsers = filteredUsers.filter(u => u.departmentId === params.filters!.departmentId);
    }
    if (params.filters.isActive !== undefined) {
      filteredUsers = filteredUsers.filter(u => u.isActive === params.filters!.isActive);
    }
    if (params.filters.accessLevel) {
      filteredUsers = filteredUsers.filter(u => u.accessLevel === params.filters!.accessLevel);
    }
  }
  
  // Apply sorting
  if (params.sortField) {
    filteredUsers = sortByField(filteredUsers, params.sortField, params.sortDirection || 'asc');
  }
  
  // Apply pagination
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  const { data, total, totalPages } = paginateItems(filteredUsers, page, pageSize);
  
  return {
    success: true,
    data: { data, total, page, pageSize, totalPages }
  };
};

// Create user
export const createUser = async (
  userData: Omit<User, 'userId' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'lastLoginAt'>,
  createdBy: string
): Promise<ServiceResponse<User>> => {
  await delay();
  
  // Check for duplicate username
  const existingUser = users.find(u => u.username.toLowerCase() === userData.username.toLowerCase());
  if (existingUser) {
    return { success: false, error: 'Username already exists' };
  }
  
  // Check for duplicate email
  const existingEmail = users.find(u => u.email.toLowerCase() === userData.email.toLowerCase());
  if (existingEmail) {
    return { success: false, error: 'Email already exists' };
  }
  
  const newUser: User = {
    ...userData,
    userId: generateId('USER'),
    createdAt: formatDate(),
    createdBy,
  };
  
  users.push(newUser);
  
  return { success: true, data: newUser, message: 'User created successfully' };
};

// Update user
export const updateUser = async (
  userId: string,
  updates: Partial<User>,
  updatedBy: string
): Promise<ServiceResponse<User>> => {
  await delay();
  
  const index = users.findIndex(u => u.userId === userId);
  
  if (index === -1) {
    return { success: false, error: 'User not found' };
  }
  
  // Check for duplicate username (excluding current user)
  if (updates.username) {
    const existingUser = users.find(
      u => u.username.toLowerCase() === updates.username!.toLowerCase() && u.userId !== userId
    );
    if (existingUser) {
      return { success: false, error: 'Username already exists' };
    }
  }
  
  // Check for duplicate email (excluding current user)
  if (updates.email) {
    const existingEmail = users.find(
      u => u.email.toLowerCase() === updates.email!.toLowerCase() && u.userId !== userId
    );
    if (existingEmail) {
      return { success: false, error: 'Email already exists' };
    }
  }
  
  users[index] = {
    ...users[index],
    ...updates,
    updatedAt: formatDate(),
    updatedBy
  };
  
  return { success: true, data: users[index], message: 'User updated successfully' };
};

// Delete user
export const deleteUser = async (userId: string): Promise<ServiceResponse<null>> => {
  await delay();
  
  const index = users.findIndex(u => u.userId === userId);
  
  if (index === -1) {
    return { success: false, error: 'User not found' };
  }
  
  // Prevent deleting super admin
  if (users[index].isSuperAdmin) {
    return { success: false, error: 'Cannot delete super admin user' };
  }
  
  users.splice(index, 1);
  
  return { success: true, data: null, message: 'User deleted successfully' };
};

// Toggle user active status
export const toggleUserStatus = async (userId: string, updatedBy: string): Promise<ServiceResponse<User>> => {
  await delay();
  
  const user = users.find(u => u.userId === userId);
  
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  if (user.isSuperAdmin) {
    return { success: false, error: 'Cannot deactivate super admin user' };
  }
  
  user.isActive = !user.isActive;
  user.updatedAt = formatDate();
  user.updatedBy = updatedBy;
  
  return { success: true, data: user, message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully` };
};

// ============ ROLE OPERATIONS ============

// Get all roles
export const getAllRoles = async (): Promise<ServiceResponse<Role[]>> => {
  await delay();
  return { success: true, data: roles.filter(r => r.isActive) };
};

// Get role by ID
export const getRoleById = async (roleId: string): Promise<ServiceResponse<Role>> => {
  await delay();
  const role = roles.find(r => r.roleId === roleId);
  
  if (!role) {
    return { success: false, error: 'Role not found' };
  }
  
  return { success: true, data: role };
};

// Create role
export const createRole = async (
  roleData: Omit<Role, 'roleId' | 'createdAt'>
): Promise<ServiceResponse<Role>> => {
  await delay();
  
  const existingRole = roles.find(r => r.roleName.toLowerCase() === roleData.roleName.toLowerCase());
  if (existingRole) {
    return { success: false, error: 'Role name already exists' };
  }
  
  const newRole: Role = {
    ...roleData,
    roleId: generateId('ROLE'),
    createdAt: formatDate(),
  };
  
  roles.push(newRole);
  
  return { success: true, data: newRole, message: 'Role created successfully' };
};

// Update role
export const updateRole = async (
  roleId: string,
  updates: Partial<Role>
): Promise<ServiceResponse<Role>> => {
  await delay();
  
  const index = roles.findIndex(r => r.roleId === roleId);
  
  if (index === -1) {
    return { success: false, error: 'Role not found' };
  }
  
  if (updates.roleName) {
    const existingRole = roles.find(
      r => r.roleName.toLowerCase() === updates.roleName!.toLowerCase() && r.roleId !== roleId
    );
    if (existingRole) {
      return { success: false, error: 'Role name already exists' };
    }
  }
  
  roles[index] = {
    ...roles[index],
    ...updates,
  };
  
  return { success: true, data: roles[index], message: 'Role updated successfully' };
};

// Delete role
export const deleteRole = async (roleId: string): Promise<ServiceResponse<null>> => {
  await delay();
  
  const role = roles.find(r => r.roleId === roleId);
  
  if (!role) {
    return { success: false, error: 'Role not found' };
  }
  
  // Check if role is in use
  const usersWithRole = users.filter(u => u.roleId === roleId);
  if (usersWithRole.length > 0) {
    return { success: false, error: `Cannot delete role. ${usersWithRole.length} user(s) are assigned to this role.` };
  }
  
  const index = roles.findIndex(r => r.roleId === roleId);
  roles.splice(index, 1);
  
  return { success: true, data: null, message: 'Role deleted successfully' };
};

// ============ DEPARTMENT OPERATIONS ============

// Get all departments
export const getAllDepartments = async (): Promise<ServiceResponse<Department[]>> => {
  await delay();
  return { success: true, data: departments.filter(d => d.isActive) };
};

// Get department by ID
export const getDepartmentById = async (departmentId: string): Promise<ServiceResponse<Department>> => {
  await delay();
  const department = departments.find(d => d.departmentId === departmentId);
  
  if (!department) {
    return { success: false, error: 'Department not found' };
  }
  
  return { success: true, data: department };
};

// Create department
export const createDepartment = async (
  deptData: Omit<Department, 'departmentId' | 'createdAt' | 'createdBy'>,
  createdBy: string
): Promise<ServiceResponse<Department>> => {
  await delay();
  
  const existingDept = departments.find(
    d => d.departmentName.toLowerCase() === deptData.departmentName.toLowerCase()
  );
  if (existingDept) {
    return { success: false, error: 'Department name already exists' };
  }
  
  const newDepartment: Department = {
    ...deptData,
    departmentId: generateId('DEPT'),
    createdAt: formatDate(),
    createdBy,
  };
  
  departments.push(newDepartment);
  
  return { success: true, data: newDepartment, message: 'Department created successfully' };
};

// Update department
export const updateDepartment = async (
  departmentId: string,
  updates: Partial<Department>
): Promise<ServiceResponse<Department>> => {
  await delay();
  
  const index = departments.findIndex(d => d.departmentId === departmentId);
  
  if (index === -1) {
    return { success: false, error: 'Department not found' };
  }
  
  if (updates.departmentName) {
    const existingDept = departments.find(
      d => d.departmentName.toLowerCase() === updates.departmentName!.toLowerCase() && d.departmentId !== departmentId
    );
    if (existingDept) {
      return { success: false, error: 'Department name already exists' };
    }
  }
  
  departments[index] = {
    ...departments[index],
    ...updates,
  };
  
  return { success: true, data: departments[index], message: 'Department updated successfully' };
};

// Delete department
export const deleteDepartment = async (departmentId: string): Promise<ServiceResponse<null>> => {
  await delay();
  
  const dept = departments.find(d => d.departmentId === departmentId);
  
  if (!dept) {
    return { success: false, error: 'Department not found' };
  }
  
  // Check if department is in use
  const usersInDept = users.filter(u => u.departmentId === departmentId);
  if (usersInDept.length > 0) {
    return { success: false, error: `Cannot delete department. ${usersInDept.length} user(s) are assigned to this department.` };
  }
  
  const index = departments.findIndex(d => d.departmentId === departmentId);
  departments.splice(index, 1);
  
  return { success: true, data: null, message: 'Department deleted successfully' };
};

// Get user count by role
export const getUserCountByRole = async (roleId: string): Promise<ServiceResponse<number>> => {
  await delay();
  const count = users.filter(u => u.roleId === roleId).length;
  return { success: true, data: count };
};

// Get user count by department
export const getUserCountByDepartment = async (departmentId: string): Promise<ServiceResponse<number>> => {
  await delay();
  const count = users.filter(u => u.departmentId === departmentId).length;
  return { success: true, data: count };
};

