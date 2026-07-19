/**
 * Shared helpers for the Databricks repositories.
 *
 * Storage strategy (Phase 1a — JSON-blob): each Delta table has a single
 * primary-key column plus a `data` STRING column holding the full JSON-
 * encoded entity, plus optional `created_at`/`updated_at` TIMESTAMPs for
 * sorting. Search/filter/sort/paginate happen in JavaScript after a full-
 * table SELECT — fine for POC volumes (~hundreds of rows per entity).
 *
 * This mirrors Mongo's document model exactly so the migration script is a
 * near-identity transform, and keeps each repository file under ~150 lines.
 */
import { env } from '../../config/env.js';
import { qualifiedTable, getDatabricksClient, type DatabricksClient } from './databricksClient.js';

export const APP_TABLES = {
  leads: 'leads',
  users: 'users',
  roles: 'roles',
  departments: 'departments',
  enrollments: 'enrollments',
  targets: 'targets',
  aiInteractions: 'ai_interactions',
  callRecords: 'call_records',
  complianceRules: 'compliance_rules',
} as const;

export const LOOKUP_TABLES = {
  members: 'members',
  memberAppointments: 'member_appointments',
} as const;

export type AppTable = (typeof APP_TABLES)[keyof typeof APP_TABLES];
export type LookupTable = (typeof LOOKUP_TABLES)[keyof typeof LOOKUP_TABLES];

/** `catalog.medhub_app.<table>` */
export function appTable(name: AppTable): string {
  return qualifiedTable(env.DATABRICKS_CATALOG, env.DATABRICKS_APP_SCHEMA, name);
}

/** `catalog.medhub_lookup.<table>` */
export function lookupTable(name: LookupTable): string {
  return qualifiedTable(env.DATABRICKS_CATALOG, env.DATABRICKS_LOOKUP_SCHEMA, name);
}

/** Wraps `getDatabricksClient()` with a typed return so repos don't need to. */
export function db(): DatabricksClient {
  return getDatabricksClient();
}

/**
 * Parse a JSON-blob row into the entity shape. Row shape is `{ data: string,
 * ... }`; we ignore everything except `data` (the indexed scalar columns are
 * for SQL-side filtering, not for the entity payload).
 */
export function parseRow<T>(row: { data?: unknown }): T {
  if (typeof row.data !== 'string') {
    throw new Error('parseRow: row.data is missing or not a string');
  }
  return JSON.parse(row.data) as T;
}

/** Serialize an entity for the `data` column. */
export function serializeEntity<T>(entity: T): string {
  return JSON.stringify(entity);
}

// ---------- in-memory search helpers ----------

export interface InMemorySearchInput<T> {
  rows: T[];
  searchTerm?: string;
  searchFields?: Array<keyof T>;
  filters?: Partial<T>;
  sortBy?: keyof T;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface InMemorySearchResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Apply field filters, free-text search, sort, and pagination to an in-memory
 * array. Used by every Databricks repo's `search()` method. Mirrors the
 * MongoLeadRepository.search() semantics: equality filters + regex-style text
 * search across `searchFields` + sort + page/pageSize bounds.
 */
export function inMemorySearch<T>(input: InMemorySearchInput<T>): InMemorySearchResult<T> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, Math.min(input.pageSize ?? 10, 100));

  let rows = input.rows;
  // Cast through `unknown` once to allow generic record-style access below.
  const asRec = (r: T): Record<string, unknown> => r as unknown as Record<string, unknown>;

  // Filters — equality match, ignore undefined / null / empty string.
  if (input.filters) {
    const entries = Object.entries(input.filters as Record<string, unknown>).filter(
      ([, v]) => v !== undefined && v !== null && v !== '',
    );
    if (entries.length > 0) {
      rows = rows.filter((row) => entries.every(([k, v]) => asRec(row)[k] === v));
    }
  }

  // Free-text search across the named fields, case-insensitive substring match.
  const term = input.searchTerm?.trim().toLowerCase();
  if (term && input.searchFields && input.searchFields.length > 0) {
    rows = rows.filter((row) =>
      (input.searchFields ?? []).some((f) => {
        const v = asRec(row)[f as string];
        return typeof v === 'string' && v.toLowerCase().includes(term);
      }),
    );
  }

  // Sort — undefined/null sort to the end regardless of direction.
  if (input.sortBy) {
    const dir = input.sortDir === 'desc' ? -1 : 1;
    const key = input.sortBy as string;
    rows = [...rows].sort((a, b) => {
      const av = asRec(a)[key];
      const bv = asRec(b)[key];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      if ((av as number | string) < (bv as number | string)) return -1 * dir;
      return 1 * dir;
    });
  }

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const data = rows.slice(start, start + pageSize);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** SELECT all rows from a JSON-blob table; returns parsed entities. */
export async function selectAll<T>(table: string): Promise<T[]> {
  const rows = await db().query<{ data: string }>(`SELECT data FROM ${table}`);
  return rows.map(parseRow<T>);
}

/** SELECT one row by primary key. Returns null if not found. */
export async function selectById<T>(
  table: string,
  pkColumn: string,
  id: string,
): Promise<T | null> {
  const rows = await db().query<{ data: string }>(
    `SELECT data FROM ${table} WHERE ${pkColumn} = ? LIMIT 1`,
    [id],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!row) return null;
  return parseRow<T>(row);
}

/** INSERT a JSON-blob row. PK + JSON + optional timestamps. */
export async function insertRow<T>(
  table: string,
  pkColumn: string,
  pkValue: string,
  entity: T,
  createdAt?: string,
  updatedAt?: string,
): Promise<void> {
  await db().execute(
    `INSERT INTO ${table} (${pkColumn}, data, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [pkValue, serializeEntity(entity), createdAt ?? null, updatedAt ?? null],
  );
}

/** UPDATE the JSON blob (and updated_at) by PK. */
export async function updateRow<T>(
  table: string,
  pkColumn: string,
  pkValue: string,
  entity: T,
  updatedAt?: string,
): Promise<void> {
  await db().execute(
    `UPDATE ${table} SET data = ?, updated_at = ? WHERE ${pkColumn} = ?`,
    [serializeEntity(entity), updatedAt ?? null, pkValue],
  );
}

/** DELETE by PK. Returns true if a row was deleted. */
export async function deleteRow(
  table: string,
  pkColumn: string,
  pkValue: string,
): Promise<boolean> {
  // Databricks doesn't return rowcount cleanly through this driver path, so
  // we check existence first. Two round-trips, but unambiguous.
  const before = await db().query<{ c: number }>(
    `SELECT count(*) as c FROM ${table} WHERE ${pkColumn} = ?`,
    [pkValue],
  );
  const beforeCount = before[0]?.c ?? 0;
  if (beforeCount === 0) return false;
  await db().execute(`DELETE FROM ${table} WHERE ${pkColumn} = ?`, [pkValue]);
  return true;
}
