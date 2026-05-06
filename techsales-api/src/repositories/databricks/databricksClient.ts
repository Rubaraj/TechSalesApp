/**
 * Databricks SQL Warehouse client — single shared connection per process.
 *
 * Wraps `@databricks/sql` with two thin convenience methods:
 *  - `query<T>(sql, params)` for SELECTs (returns row array)
 *  - `execute(sql, params)` for INSERT / UPDATE / DELETE / COPY INTO etc.
 *
 * All call sites use parameter binding — never string-interpolate user input
 * into SQL. Identifiers (catalog/schema/table names) are inlined because the
 * Thrift protocol doesn't allow parameterized identifiers; we sanitize via a
 * `qualifiedTable()` helper that quotes them with backticks.
 *
 * The client is lazy: the first call opens the session; subsequent calls reuse
 * it. On process exit the session is closed (best-effort).
 *
 * Designed so every public method is unit-testable with a mocked client —
 * tests never need a live Databricks workspace.
 */
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

// We import lazily so dev boxes that don't have `@databricks/sql` installed
// can still boot in mongo/json mode without a hard runtime error.
type DBSqlClientModule = typeof import('@databricks/sql');
type DBSqlClient = InstanceType<DBSqlClientModule['DBSQLClient']>;
type DBSqlSession = Awaited<ReturnType<DBSqlClient['openSession']>>;

export interface DatabricksClientOptions {
  /** Override the global env-driven config (used by tests). */
  host?: string;
  httpPath?: string;
  token?: string;
}

export interface DatabricksClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  close(): Promise<void>;
}

let cached: DatabricksClient | null = null;

/**
 * Returns the lazy-initialized client. Idempotent — calling it twice returns
 * the same instance.
 */
export function getDatabricksClient(opts: DatabricksClientOptions = {}): DatabricksClient {
  if (cached) return cached;
  cached = createDatabricksClient(opts);
  return cached;
}

/**
 * Test-only — drop the cached client so the next `getDatabricksClient()` call
 * builds a fresh one. Mirrors `__resetRegistryForTests` in the registry.
 */
export function __resetDatabricksClientForTests(): void {
  cached = null;
}

/**
 * Build a new client instance. Exported separately so tests can substitute
 * a mock without going through the cache. Real call sites use
 * `getDatabricksClient()` instead.
 */
export function createDatabricksClient(opts: DatabricksClientOptions = {}): DatabricksClient {
  const host = (opts.host ?? env.DATABRICKS_HOST ?? '').replace(/^https?:\/\//, '');
  const httpPath = opts.httpPath ?? env.DATABRICKS_HTTP_PATH ?? '';
  const token = opts.token ?? env.DATABRICKS_TOKEN ?? '';

  if (!host || !httpPath || !token) {
    throw new Error(
      'createDatabricksClient: DATABRICKS_HOST, DATABRICKS_HTTP_PATH and DATABRICKS_TOKEN must be set',
    );
  }

  let clientPromise: Promise<DBSqlClient> | null = null;
  let sessionPromise: Promise<DBSqlSession> | null = null;

  const ensureSession = async (): Promise<DBSqlSession> => {
    if (!clientPromise) {
      clientPromise = (async () => {
        // Lazy dynamic import so this module doesn't crash mongo/json mode if
        // the package isn't installed.
        const mod = (await import('@databricks/sql')) as DBSqlClientModule;
        const client = new mod.DBSQLClient();
        await client.connect({ host, path: httpPath, token });
        return client;
      })();
    }
    if (!sessionPromise) {
      sessionPromise = clientPromise.then((c) => c.openSession());
    }
    return sessionPromise;
  };

  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const session = await ensureSession();
      const opSql = bindPositionalParams(sql, params);
      const op = await session.executeStatement(opSql, { runAsync: true });
      try {
        const result = (await op.fetchAll()) as T[];
        return result;
      } finally {
        await op.close();
      }
    },
    async execute(sql: string, params: unknown[] = []): Promise<void> {
      const session = await ensureSession();
      const opSql = bindPositionalParams(sql, params);
      const op = await session.executeStatement(opSql, { runAsync: true });
      try {
        await op.fetchAll();
      } finally {
        await op.close();
      }
    },
    async close(): Promise<void> {
      try {
        if (sessionPromise) {
          const s = await sessionPromise;
          await s.close();
        }
        if (clientPromise) {
          const c = await clientPromise;
          await c.close();
        }
      } catch (err) {
        logger.warn({ err }, 'databricks client close failed (non-fatal)');
      } finally {
        clientPromise = null;
        sessionPromise = null;
      }
    },
  };
}

/**
 * Inline positional `?` placeholders with literal values. The `@databricks/sql`
 * driver does not support a server-side prepared-statement API, so we have to
 * bake values into the SQL ourselves. Numbers / booleans / nulls / Dates are
 * inlined directly; strings are single-quoted with `'` doubled. Arrays / objects
 * are JSON-stringified and quoted.
 *
 * NEVER pass un-validated user-provided strings into SQL identifier slots
 * (catalog/schema/table) — those are not parameterized; use `qualifiedTable()`.
 */
export function bindPositionalParams(sql: string, params: unknown[]): string {
  if (params.length === 0) return sql;
  let i = 0;
  const out = sql.replace(/\?/g, () => {
    const v = params[i++];
    return formatLiteral(v);
  });
  if (i !== params.length) {
    throw new Error(
      `bindPositionalParams: SQL has ${i} placeholders but ${params.length} params supplied`,
    );
  }
  return out;
}

function formatLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Cannot bind non-finite number');
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === 'string') return quoteString(v);
  // Arrays / plain objects → serialize as JSON, then quote the resulting string.
  // Repos that store complex columns as JSON STRING use this path.
  return quoteString(JSON.stringify(v));
}

function quoteString(s: string): string {
  // Spark SQL default mode (`spark.sql.parser.escapedStringLiterals=false`)
  // treats `\` as an escape character inside string literals. Our payloads
  // are JSON blobs that contain `\"`, `\\`, `\n` etc. — without doubling
  // the backslashes here, every `\\` in JSON would collapse to `\`, every
  // `\n` would become a literal newline, and `JSON.parse` on the way back
  // out would throw or silently corrupt the entity.
  // Order: backslash first (so we don't accidentally interfere with the
  // quote-doubling on subsequent passes), then single quote.
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

/**
 * Build a fully qualified `catalog`.`schema`.`table` identifier with backticks.
 * Names are validated to contain only [A-Za-z0-9_] characters — anything else
 * throws (defense against accidental injection via env mis-config).
 */
export function qualifiedTable(
  catalog: string,
  schema: string,
  table: string,
): string {
  const safe = (s: string, label: string): string => {
    if (!/^[A-Za-z0-9_]+$/.test(s)) {
      throw new Error(`Invalid Databricks ${label}: ${s} (must match /^[A-Za-z0-9_]+$/)`);
    }
    return s;
  };
  return `\`${safe(catalog, 'catalog')}\`.\`${safe(schema, 'schema')}\`.\`${safe(table, 'table')}\``;
}
