import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User, Role, Permission, ModuleName, ActionType, Member } from '../types';
import usersData from '../data/runtime/users.json';
import rolesData from '../data/runtime/roles.json';
import membersData from '../data/runtime/members.json';
import {
  setMode,
  clearMode,
  setDataSource,
  getDataSource,
  setAiEnabled as persistAiEnabled,
  getAiEnabled,
  setAiProvider as persistAiProvider,
  getAiProvider,
  setTwilioEnabled as persistTwilioEnabled,
  getTwilioEnabled,
  probeBackendMode,
  type DataSource,
  type AiProvider,
} from '../api/mode';
import { API_BASE } from '../api/apiBase';

interface AuthContextType {
  user: User | null;
  member: Member | null;
  role: Role | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** What's backing the data shown in the UI: `'mongo'` (Pi via API) or `'json'`
   * (either backend's JSON-store mode or FE bundled fallback). `null` until login. */
  dataSource: DataSource | null;
  /** Whether the backend's `AI_ENABLED` flag is currently true. Mirrors
   * `/api/health.aiEnabled`; refreshed at login. `false` until login. */
  aiEnabled: boolean;
  /** Active LLM provider on the backend (`'ollama'` | `'anthropic'`). Mirrors
   * `/api/health.aiProvider`; refreshed at login. `null` until login or when
   * AI is disabled. Drives the header AI badge. */
  aiProvider: AiProvider | null;
  /** Phase 2 — whether Twilio+Deepgram call pipeline is enabled. Mirrors
   * `/api/health.twilioEnabled`; refreshed at login. */
  twilioEnabled: boolean;
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
  const [dataSource, setDataSourceState] = useState<DataSource | null>(null);
  const [aiEnabled, setAiEnabledState] = useState<boolean>(false);
  const [aiProvider, setAiProviderState] = useState<AiProvider | null>(null);
  const [twilioEnabled, setTwilioEnabledState] = useState<boolean>(false);

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

    // Rehydrate data source from sessionStorage (set at login).
    const storedSource = getDataSource();
    if (storedSource) setDataSourceState(storedSource);

    // Rehydrate AI flag from sessionStorage (set at login). Default false.
    setAiEnabledState(getAiEnabled());
    setAiProviderState(getAiProvider());
    setTwilioEnabledState(getTwilioEnabled());

    setIsLoading(false);
  }, []);

  /**
   * Decides the UI `dataSource` and `aiEnabled` flag based on the resolved
   * app mode after login.
   *
   * - `local` → bundled JSON; AI is OFF (no backend to call).
   * - `api`   → probe `/api/health`. dataSource defaults to `'mongo'` on
   *             probe failure (optimistic: the login API just succeeded).
   *             aiEnabled defaults to `false` on probe failure — we'd rather
   *             hide AI UI than 501 the user mid-flow.
   */
  const resolveBackendState = async (
    resolvedMode: 'api' | 'local',
  ): Promise<{
    dataSource: DataSource;
    aiEnabled: boolean;
    aiProvider: AiProvider | null;
    twilioEnabled: boolean;
  }> => {
    if (resolvedMode === 'local') {
      return { dataSource: 'json', aiEnabled: false, aiProvider: null, twilioEnabled: false };
    }
    const probed = await probeBackendMode();
    return {
      dataSource: probed.dataSource ?? 'mongo',
      aiEnabled: probed.aiEnabled,
      aiProvider: probed.aiProvider,
      twilioEnabled: probed.twilioEnabled,
    };
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    // Plan §6/§7 — try the API first; on network error or 5xx fall back to
    // bundled JSON. 4xx (bad creds) does NOT trigger fallback.
    let apiUser: User | null = null;
    let apiAttempted = true;
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const body = (await res.json()) as { success: boolean; data?: { user: User } };
        if (body.success && body.data?.user) {
          apiUser = body.data.user;
        }
      } else if (res.status >= 400 && res.status < 500) {
        // Authoritative "bad creds" — never silently succeed against local copy.
        return false;
      }
      // 5xx → fall through to local
    } catch {
      // Network error → fall back
      apiAttempted = false;
    }

    let resolvedUser: User | null = apiUser;
    let resolvedMode: 'api' | 'local' = 'api';
    if (!resolvedUser) {
      // Local fallback: accept any password, match by username.
      const foundUser = users.find(
        (u) => u.username.toLowerCase() === username.toLowerCase() && u.isActive,
      );
      if (!foundUser) return false;
      resolvedUser = foundUser;
      resolvedMode = 'local';
    } else if (!apiAttempted) {
      resolvedMode = 'local';
    }

    const userRole = roles.find((r) => r.roleId === resolvedUser!.roleId) || null;
    const updatedUser: User = { ...resolvedUser, lastLoginAt: new Date().toISOString() };

    setUser(updatedUser);
    setRole(userRole);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedUser));
    setMode(resolvedMode);

    // Resolve and persist what's actually backing the data (for the header
    // badge) plus the AI feature flag (for `useAiEnabled`).
    const {
      dataSource: source,
      aiEnabled: ai,
      aiProvider: provider,
      twilioEnabled: twilio,
    } = await resolveBackendState(resolvedMode);
    setDataSource(source);
    setDataSourceState(source);
    persistAiEnabled(ai);
    setAiEnabledState(ai);
    persistAiProvider(provider);
    setAiProviderState(provider);
    persistTwilioEnabled(twilio);
    setTwilioEnabledState(twilio);

    return true;
  };

  const memberLoginHandler = async (
    policyNumber: string,
    dateOfBirth: string
  ): Promise<boolean> => {
    // Mirrors agent login: try API first, on network error / 5xx fall back to
    // bundled members.json. 4xx is authoritative bad creds — no fallback.
    let apiMember: Member | null = null;
    let apiAttempted = true;
    try {
      const res = await fetch(`${API_BASE}/auth/member-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policyNumber, dateOfBirth }),
      });
      if (res.ok) {
        const body = (await res.json()) as { success: boolean; data?: { member: Member } };
        if (body.success && body.data?.member) {
          apiMember = body.data.member;
        }
      } else if (res.status >= 400 && res.status < 500) {
        return false;
      }
    } catch {
      apiAttempted = false;
    }

    let resolvedMember: Member | null = apiMember;
    let resolvedMode: 'api' | 'local' = 'api';
    if (!resolvedMember) {
      const members = (membersData as unknown) as Member[];
      const found = members.find(
        (m) => m.policyNumber.toLowerCase() === policyNumber.toLowerCase().trim()
            && m.dateOfBirth === dateOfBirth
            && m.isActive
      );
      if (!found) return false;
      resolvedMember = found;
      resolvedMode = 'local';
    } else if (!apiAttempted) {
      resolvedMode = 'local';
    }

    setMember(resolvedMember);
    setUser(null);
    setRole(null);
    localStorage.setItem(MEMBER_AUTH_STORAGE_KEY, JSON.stringify(resolvedMember));
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setMode(resolvedMode);

    const {
      dataSource: source,
      aiEnabled: ai,
      aiProvider: provider,
      twilioEnabled: twilio,
    } = await resolveBackendState(resolvedMode);
    setDataSource(source);
    setDataSourceState(source);
    persistAiEnabled(ai);
    setAiEnabledState(ai);
    persistAiProvider(provider);
    setAiProviderState(provider);
    persistTwilioEnabled(twilio);
    setTwilioEnabledState(twilio);

    return true;
  };

  const logout = async () => {
    // QA H2 — End any active call (await Twilio Device destroy) BEFORE
    // clearing auth state. Otherwise WebRTC keeps the mic hot after logout.
    // Dynamic import avoids touching CallContext at module load.
    try {
      const { endActiveCallAsyncIfAny } = await import('./CallContext');
      await endActiveCallAsyncIfAny();
    } catch {
      // best-effort
    }
    // Capture userId BEFORE clearing state so clearMode can wipe the
    // per-user call sessionStorage key (QA H3).
    const userIdForClear = user?.userId ?? null;
    setUser(null);
    setMember(null);
    setRole(null);
    setDataSourceState(null);
    setAiEnabledState(false);
    setAiProviderState(null);
    setTwilioEnabledState(false);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(MEMBER_AUTH_STORAGE_KEY);
    clearMode(userIdForClear);
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
        dataSource,
        aiEnabled,
        aiProvider,
        twilioEnabled,
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

