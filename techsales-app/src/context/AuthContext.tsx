import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User, Role, Permission, ModuleName, ActionType, Member } from '../types';
import usersData from '../data/runtime/users.json';
import rolesData from '../data/runtime/roles.json';
import { memberLogin } from '../services/memberService';

interface AuthContextType {
  user: User | null;
  member: Member | null;
  role: Role | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  memberLogin: (policyNumber: string, dateOfBirth: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (module: ModuleName, action: ActionType) => boolean;
  hasAnyPermission: (module: ModuleName) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'medsales-auth';
const MEMBER_AUTH_STORAGE_KEY = 'medsales-member-auth';

// Load data
const users: User[] = usersData as User[];
const roles: Role[] = rolesData as Role[];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for stored auth on mount
  useEffect(() => {
    // Check for user auth
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      try {
        const userData = JSON.parse(stored) as User;
        const userRole = roles.find(r => r.roleId === userData.roleId) || null;
        setUser(userData);
        setRole(userRole);
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
    
    // Check for member auth
    const storedMember = localStorage.getItem(MEMBER_AUTH_STORAGE_KEY);
    if (storedMember) {
      try {
        const memberData = JSON.parse(storedMember) as Member;
        setMember(memberData);
      } catch {
        localStorage.removeItem(MEMBER_AUTH_STORAGE_KEY);
      }
    }
    
    setIsLoading(false);
  }, []);

  const login = async (username: string, _password: string): Promise<boolean> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // For demo, accept any password and find user by username
    const foundUser = users.find(
      u => u.username.toLowerCase() === username.toLowerCase() && u.isActive
    );

    if (!foundUser) {
      return false;
    }

    const userRole = roles.find(r => r.roleId === foundUser.roleId) || null;

    // Update last login
    const updatedUser = {
      ...foundUser,
      lastLoginAt: new Date().toISOString()
    };

    setUser(updatedUser);
    setRole(userRole);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedUser));

    return true;
  };

  const memberLoginHandler = async (
    policyNumber: string,
    dateOfBirth: string
  ): Promise<boolean> => {
    const result = await memberLogin(policyNumber, dateOfBirth);
    
    if (!result.success || !result.data) {
      return false;
    }
    
    setMember(result.data);
    setUser(null); // Clear user if member logs in
    setRole(null);
    localStorage.setItem(MEMBER_AUTH_STORAGE_KEY, JSON.stringify(result.data));
    localStorage.removeItem(AUTH_STORAGE_KEY); // Clear user auth
    
    return true;
  };

  const logout = () => {
    setUser(null);
    setMember(null);
    setRole(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(MEMBER_AUTH_STORAGE_KEY);
  };

  const hasPermission = (module: ModuleName, action: ActionType): boolean => {
    if (!role) return false;
    
    // Super admin has all permissions
    if (user?.isSuperAdmin) return true;

    const permission = role.permissions.find(
      (p: Permission) => p.module === module
    );
    
    return permission?.actions.includes(action) || false;
  };

  const hasAnyPermission = (module: ModuleName): boolean => {
    if (!role) return false;
    if (user?.isSuperAdmin) return true;

    const permission = role.permissions.find(
      (p: Permission) => p.module === module
    );
    
    return permission !== undefined && permission.actions.length > 0;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        member,
        role,
        isAuthenticated: !!user || !!member,
        isLoading,
        login,
        memberLogin: memberLoginHandler,
        logout,
        hasPermission,
        hasAnyPermission
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

