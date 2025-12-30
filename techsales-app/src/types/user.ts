export interface User {
  userId: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roleId: string;
  departmentId?: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  accessLevel: AccessLevel;
  markets: string[]; // Markets the user has access to
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
  lastLoginAt?: string;
}

export type AccessLevel = 'admin' | 'manager' | 'agent' | 'viewer';

export interface Role {
  roleId: string;
  roleName: string;
  description: string;
  permissions: string[]; // Simple string array for permission keys
  isActive: boolean;
  createdAt: string;
}

// Permission is now a simple string key
export type Permission = string;

export type ModuleName = 
  | 'dashboard'
  | 'leads'
  | 'plans'
  | 'pharmacy'
  | 'drugs'
  | 'pba'
  | 'pbkit'
  | 'stateAssistance'
  | 'planSubsidy'
  | 'recommendations'
  | 'yoy'
  | 'enrollments'
  | 'admin'
  | 'users'
  | 'departments'
  | 'roles'
  | 'reports';

export type ActionType = 'view' | 'create' | 'edit' | 'delete' | 'export';

export interface Department {
  departmentId: string;
  departmentName: string;
  description?: string;
  managerId?: string;
  parentDepartmentId?: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
