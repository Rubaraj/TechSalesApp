import type { ConnectMode, ConnectResult } from '../config/mongo.js';
import { logger } from '../config/logger.js';
import { MongoLeadRepository } from './mongo/MongoLeadRepository.js';
import { JsonLeadRepository } from './json/JsonLeadRepository.js';
import { MongoUserRepository } from './mongo/MongoUserRepository.js';
import { JsonUserRepository } from './json/JsonUserRepository.js';
import { MongoRoleRepository } from './mongo/MongoRoleRepository.js';
import { JsonRoleRepository } from './json/JsonRoleRepository.js';
import { MongoDepartmentRepository } from './mongo/MongoDepartmentRepository.js';
import { JsonDepartmentRepository } from './json/JsonDepartmentRepository.js';
import { MongoEnrollmentRepository } from './mongo/MongoEnrollmentRepository.js';
import { JsonEnrollmentRepository } from './json/JsonEnrollmentRepository.js';
import { MongoMemberRepository } from './mongo/MongoMemberRepository.js';
import { JsonMemberRepository } from './json/JsonMemberRepository.js';
import { MongoTargetRepository } from './mongo/MongoTargetRepository.js';
import { JsonTargetRepository } from './json/JsonTargetRepository.js';

/**
 * Global repository registry.
 *
 * The mode is decided ONCE at backend startup via `initRegistry(connectResult)`
 * and locked for the lifetime of the process. There is no heartbeat, no
 * per-request fallback (see plan §4 "Mode decided once at startup").
 */

interface HealthRepo {
  ping(): { mode: ConnectMode; ts: string };
}

export type LeadRepo = MongoLeadRepository | JsonLeadRepository;
export type UserRepo = MongoUserRepository | JsonUserRepository;
export type RoleRepo = MongoRoleRepository | JsonRoleRepository;
export type DepartmentRepo = MongoDepartmentRepository | JsonDepartmentRepository;
export type EnrollmentRepo = MongoEnrollmentRepository | JsonEnrollmentRepository;
export type MemberRepo = MongoMemberRepository | JsonMemberRepository;
export type TargetRepo = MongoTargetRepository | JsonTargetRepository;

export interface Repos {
  health: HealthRepo;
  lead: LeadRepo;
  user: UserRepo;
  role: RoleRepo;
  department: DepartmentRepo;
  enrollment: EnrollmentRepo;
  member: MemberRepo;
  target: TargetRepo;
}

interface RegistryState {
  mode: ConnectMode;
  repos: Repos;
}

let state: RegistryState | null = null;

const buildHealthRepo = (mode: ConnectMode): HealthRepo => ({
  ping: () => ({ mode, ts: new Date().toISOString() }),
});

const isMongo = (mode: ConnectMode): boolean => mode === 'mongo';

export function initRegistry(connectResult: ConnectResult): void {
  if (state) {
    throw new Error('initRegistry called twice — registry is a singleton.');
  }
  const mode = connectResult.mode;
  const mongo = isMongo(mode);
  state = {
    mode,
    repos: {
      health: buildHealthRepo(mode),
      lead: mongo ? new MongoLeadRepository() : new JsonLeadRepository(),
      user: mongo ? new MongoUserRepository() : new JsonUserRepository(),
      role: mongo ? new MongoRoleRepository() : new JsonRoleRepository(),
      department: mongo ? new MongoDepartmentRepository() : new JsonDepartmentRepository(),
      enrollment: mongo ? new MongoEnrollmentRepository() : new JsonEnrollmentRepository(),
      member: mongo ? new MongoMemberRepository() : new JsonMemberRepository(),
      target: mongo ? new MongoTargetRepository() : new JsonTargetRepository(),
    },
  };
  logger.info({ mode }, 'Repository registry initialized');
}

export const getMode = (): ConnectMode => {
  if (!state) throw new Error('Registry not initialized. Call initRegistry() first.');
  return state.mode;
};

export const repos = new Proxy({} as Repos, {
  get(_target, prop) {
    if (!state) {
      throw new Error('Registry not initialized. Call initRegistry() first.');
    }
    if (typeof prop === 'symbol') return undefined;
    return state.repos[prop as keyof Repos];
  },
});

export const __resetRegistryForTests = (): void => {
  state = null;
};
