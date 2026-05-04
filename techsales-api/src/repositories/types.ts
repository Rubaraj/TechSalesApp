/**
 * Shared types for the repository layer. The HTTP response shape (`ServiceResponse<T>`)
 * mirrors the existing FE service contract verbatim — see plan §6 "Pagination & response
 * shapes".
 */

/** The HTTP envelope used by every `/api/*` route. */
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** Pagination wrapper used by `searchX` endpoints. */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Minimal sort spec; matches the FE `SortConfig` shape but uses generic field. */
export type SortDirection = 'asc' | 'desc';

export interface SearchParams<T> {
  /** Free-text search term applied across the resource's text-indexed fields. */
  searchTerm?: string;
  /** Field-level filters; values are compared with `===` for exact match. */
  filters?: Partial<T>;
  /** Field name to sort by — string-typed because we don't constrain to keyof T at runtime. */
  sortBy?: string;
  sortDir?: SortDirection;
  page?: number;
  pageSize?: number;
}

/** Mutable resource repository (app DB collections). */
export interface IRepository<T, ID = string> {
  findAll(): Promise<T[]>;
  findById(id: ID): Promise<T | null>;
  search(params: SearchParams<T>): Promise<Paginated<T>>;
  create(input: Omit<T, 'id'>): Promise<T>;
  update(id: ID, patch: Partial<T>): Promise<T | null>;
  delete(id: ID): Promise<boolean>;
}

/** Read-only repository (lookup DB collections). */
export interface IReadOnlyRepository<T> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  search(params: SearchParams<T>): Promise<Paginated<T>>;
}

/**
 * Phase 6 — `/api/ai/stats` aggregate shapes. Returned by both the Mongo and
 * JSON aiInteraction repos so callers can switch storage without caring.
 */
export interface AiStatsByKind {
  kind: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  cachedInput: number;
  cachedRead: number;
  errors: number;
}

export interface AiStatsAggregate {
  windowMs: number;
  totalCalls: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCachedInput: number;
  totalCachedRead: number;
  /** cachedRead / totalTokensIn — protects against div-by-zero when totalTokensIn = 0. */
  cacheHitRatio: number;
  errors: number;
  errorRate: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  byKind: AiStatsByKind[];
}
