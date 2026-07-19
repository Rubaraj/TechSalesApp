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
import { MongoAiInteractionRepository } from './mongo/MongoAiInteractionRepository.js';
import { JsonAiInteractionRepository } from './json/JsonAiInteractionRepository.js';
import { MongoCallRecordRepository } from './mongo/MongoCallRecordRepository.js';
import { JsonCallRecordRepository } from './json/JsonCallRecordRepository.js';
import { DatabricksCallRecordRepository } from './databricks/DatabricksCallRecordRepository.js';
import { MongoComplianceRuleRepository } from './mongo/MongoComplianceRuleRepository.js';
import { JsonComplianceRuleRepository } from './json/JsonComplianceRuleRepository.js';
import { DatabricksComplianceRuleRepository } from './databricks/DatabricksComplianceRuleRepository.js';
import { DatabricksLeadRepository } from './databricks/DatabricksLeadRepository.js';
import { DatabricksUserRepository } from './databricks/DatabricksUserRepository.js';
import { DatabricksRoleRepository } from './databricks/DatabricksRoleRepository.js';
import { DatabricksDepartmentRepository } from './databricks/DatabricksDepartmentRepository.js';
import { DatabricksEnrollmentRepository } from './databricks/DatabricksEnrollmentRepository.js';
import { DatabricksMemberRepository } from './databricks/DatabricksMemberRepository.js';
import { DatabricksTargetRepository } from './databricks/DatabricksTargetRepository.js';
import { DatabricksAiInteractionRepository } from './databricks/DatabricksAiInteractionRepository.js';

/**
 * Global repository registry.
 *
 * The mode is decided ONCE at backend startup via `initRegistry(connectResult)`
 * and locked for the lifetime of the process. There is no heartbeat, no
 * per-request fallback (see plan §4 "Mode decided once at startup").
 *
 * Phase 1 (Databricks migration) — extended to a third backend `databricks`.
 * The construction site is now a per-entity factory function rather than an
 * inline ternary, because adding a third option to a `cond ? X : Y` expression
 * isn't a clean operation. The contract (what the registry exports) is
 * unchanged; only how each repo is built changed.
 */

interface HealthRepo {
  ping(): { mode: ConnectMode; ts: string };
}

export type LeadRepo = MongoLeadRepository | JsonLeadRepository | DatabricksLeadRepository;
export type UserRepo = MongoUserRepository | JsonUserRepository | DatabricksUserRepository;
export type RoleRepo = MongoRoleRepository | JsonRoleRepository | DatabricksRoleRepository;
export type DepartmentRepo =
  | MongoDepartmentRepository
  | JsonDepartmentRepository
  | DatabricksDepartmentRepository;
export type EnrollmentRepo =
  | MongoEnrollmentRepository
  | JsonEnrollmentRepository
  | DatabricksEnrollmentRepository;
export type MemberRepo =
  | MongoMemberRepository
  | JsonMemberRepository
  | DatabricksMemberRepository;
export type TargetRepo = MongoTargetRepository | JsonTargetRepository | DatabricksTargetRepository;
export type AiInteractionRepo =
  | MongoAiInteractionRepository
  | JsonAiInteractionRepository
  | DatabricksAiInteractionRepository;
export type CallRecordRepo =
  | MongoCallRecordRepository
  | JsonCallRecordRepository
  | DatabricksCallRecordRepository;
export type ComplianceRuleRepo =
  | MongoComplianceRuleRepository
  | JsonComplianceRuleRepository
  | DatabricksComplianceRuleRepository;

export interface Repos {
  health: HealthRepo;
  lead: LeadRepo;
  user: UserRepo;
  role: RoleRepo;
  department: DepartmentRepo;
  enrollment: EnrollmentRepo;
  member: MemberRepo;
  target: TargetRepo;
  aiInteraction: AiInteractionRepo;
  callRecord: CallRecordRepo;
  complianceRule: ComplianceRuleRepo;
}

interface RegistryState {
  mode: ConnectMode;
  repos: Repos;
}

let state: RegistryState | null = null;

const buildHealthRepo = (mode: ConnectMode): HealthRepo => ({
  ping: () => ({ mode, ts: new Date().toISOString() }),
});

// Per-entity factories — one switch each. Adding a fourth backend later means
// extending each switch (TypeScript's `default: never` keeps that honest).
const buildLeadRepo = (mode: ConnectMode): LeadRepo => {
  switch (mode) {
    case 'mongo':
      return new MongoLeadRepository();
    case 'json':
      return new JsonLeadRepository();
    case 'databricks':
      return new DatabricksLeadRepository();
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
};
const buildUserRepo = (mode: ConnectMode): UserRepo => {
  switch (mode) {
    case 'mongo':
      return new MongoUserRepository();
    case 'json':
      return new JsonUserRepository();
    case 'databricks':
      return new DatabricksUserRepository();
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
};
const buildRoleRepo = (mode: ConnectMode): RoleRepo => {
  switch (mode) {
    case 'mongo':
      return new MongoRoleRepository();
    case 'json':
      return new JsonRoleRepository();
    case 'databricks':
      return new DatabricksRoleRepository();
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
};
const buildDepartmentRepo = (mode: ConnectMode): DepartmentRepo => {
  switch (mode) {
    case 'mongo':
      return new MongoDepartmentRepository();
    case 'json':
      return new JsonDepartmentRepository();
    case 'databricks':
      return new DatabricksDepartmentRepository();
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
};
const buildEnrollmentRepo = (mode: ConnectMode): EnrollmentRepo => {
  switch (mode) {
    case 'mongo':
      return new MongoEnrollmentRepository();
    case 'json':
      return new JsonEnrollmentRepository();
    case 'databricks':
      return new DatabricksEnrollmentRepository();
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
};
const buildMemberRepo = (mode: ConnectMode): MemberRepo => {
  switch (mode) {
    case 'mongo':
      return new MongoMemberRepository();
    case 'json':
      return new JsonMemberRepository();
    case 'databricks':
      return new DatabricksMemberRepository();
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
};
const buildTargetRepo = (mode: ConnectMode): TargetRepo => {
  switch (mode) {
    case 'mongo':
      return new MongoTargetRepository();
    case 'json':
      return new JsonTargetRepository();
    case 'databricks':
      return new DatabricksTargetRepository();
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
};
const buildAiInteractionRepo = (mode: ConnectMode): AiInteractionRepo => {
  switch (mode) {
    case 'mongo':
      return new MongoAiInteractionRepository();
    case 'json':
      return new JsonAiInteractionRepository();
    case 'databricks':
      return new DatabricksAiInteractionRepository();
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
};

const buildCallRecordRepo = (mode: ConnectMode): CallRecordRepo => {
  switch (mode) {
    case 'mongo':
      return new MongoCallRecordRepository();
    case 'json':
      return new JsonCallRecordRepository();
    case 'databricks':
      return new DatabricksCallRecordRepository();
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
};

const buildComplianceRuleRepo = (mode: ConnectMode): ComplianceRuleRepo => {
  switch (mode) {
    case 'mongo':
      return new MongoComplianceRuleRepository();
    case 'json':
      return new JsonComplianceRuleRepository();
    case 'databricks':
      return new DatabricksComplianceRuleRepository();
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown backend: ${String(_exhaustive)}`);
    }
  }
};

export function initRegistry(connectResult: ConnectResult): void {
  if (state) {
    throw new Error('initRegistry called twice — registry is a singleton.');
  }
  const mode = connectResult.mode;
  state = {
    mode,
    repos: {
      health: buildHealthRepo(mode),
      lead: buildLeadRepo(mode),
      user: buildUserRepo(mode),
      role: buildRoleRepo(mode),
      department: buildDepartmentRepo(mode),
      enrollment: buildEnrollmentRepo(mode),
      member: buildMemberRepo(mode),
      target: buildTargetRepo(mode),
      aiInteraction: buildAiInteractionRepo(mode),
      callRecord: buildCallRecordRepo(mode),
      complianceRule: buildComplianceRuleRepo(mode),
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
