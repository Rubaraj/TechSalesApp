import mongoose, { type Connection } from 'mongoose';
import { env, getDataBackend } from './env.js';
import { logger } from './logger.js';

// Two logically separate Mongoose Connections sharing one cluster.
// Models are bound to the appropriate connection in their respective
// model files (Phase 3+). For Phase 1 these are populated at startup
// only when Mongo is reachable.
export let appConn: Connection | undefined;
export let lookupConn: Connection | undefined;

export type ConnectMode = 'mongo' | 'json' | 'databricks';

export interface ConnectResult {
  ok: boolean;
  mode: ConnectMode;
  error?: unknown;
}

/**
 * Attempts to open BOTH connections (`medhub_app` and `medhub_lookup`).
 * If either fails, both are torn down and we report `{ ok:false, mode:'json' }`.
 *
 * This is called ONCE at startup — there is no heartbeat, no per-request
 * retry. The mode is locked for the lifetime of the process. See plan §4.
 *
 * When `DATA_BACKEND='databricks'` is set, we skip Mongo entirely and the
 * registry uses the Databricks SQL Warehouse instead. Required env vars
 * (`DATABRICKS_HOST`, `DATABRICKS_HTTP_PATH`, `DATABRICKS_TOKEN`) are
 * asserted here so a misconfigured boot fails loudly with a clear message
 * rather than crashing on the first repo call.
 */
export async function connectMongo(): Promise<ConnectResult> {
  const backend = getDataBackend();

  if (backend === 'databricks') {
    const missing: string[] = [];
    if (!env.DATABRICKS_HOST) missing.push('DATABRICKS_HOST');
    if (!env.DATABRICKS_HTTP_PATH) missing.push('DATABRICKS_HTTP_PATH');
    if (!env.DATABRICKS_TOKEN) missing.push('DATABRICKS_TOKEN');
    if (missing.length > 0) {
      logger.error(
        { missing },
        'DATA_BACKEND=databricks but required vars are missing; cannot start',
      );
      throw new Error(
        `DATA_BACKEND=databricks requires ${missing.join(', ')} to be set in .env`,
      );
    }
    logger.info(
      { host: env.DATABRICKS_HOST, catalog: env.DATABRICKS_CATALOG },
      'DATA_BACKEND=databricks — skipping Mongo, using Databricks SQL Warehouse',
    );
    return { ok: true, mode: 'databricks' };
  }

  if (backend === 'json') {
    logger.info('DATA_BACKEND=json (or FORCE_JSON=true) — skipping Mongo, using JSON store');
    return { ok: false, mode: 'json' };
  }

  let app: Connection | undefined;
  let lookup: Connection | undefined;
  try {
    app = mongoose.createConnection(env.MONGO_URI, {
      dbName: env.MONGO_APP_DB,
      serverSelectionTimeoutMS: env.MONGO_CONNECT_TIMEOUT_MS,
      appName: 'medhub-techsales-api-app',
    });
    lookup = mongoose.createConnection(env.MONGO_URI, {
      dbName: env.MONGO_LOOKUP_DB,
      serverSelectionTimeoutMS: env.MONGO_CONNECT_TIMEOUT_MS,
      appName: 'medhub-techsales-api-lookup',
    });

    await Promise.all([app.asPromise(), lookup.asPromise()]);

    appConn = app;
    lookupConn = lookup;
    logger.info(
      {
        appDb: env.MONGO_APP_DB,
        lookupDb: env.MONGO_LOOKUP_DB,
      },
      'Mongo connected, mode=mongo',
    );
    return { ok: true, mode: 'mongo' };
  } catch (error) {
    logger.warn(
      { err: error },
      'Mongo unavailable; falling back to JSON repositories (mode=json)',
    );
    // Best-effort cleanup so we don't leak connection attempts.
    await Promise.allSettled([
      app ? app.close(true) : Promise.resolve(),
      lookup ? lookup.close(true) : Promise.resolve(),
    ]);
    appConn = undefined;
    lookupConn = undefined;
    return { ok: false, mode: 'json', error };
  }
}

export const isMongoConnected = (): boolean =>
  appConn?.readyState === 1 && lookupConn?.readyState === 1;

export interface DbHealth {
  name: string;
  readyState: number;
}

/** Returns `{app,lookup}` for /api/health; both are non-null only in mongo mode. */
export const getDbHealth = (): { app: DbHealth; lookup: DbHealth } => ({
  app: {
    name: env.MONGO_APP_DB,
    readyState: appConn?.readyState ?? 0,
  },
  lookup: {
    name: env.MONGO_LOOKUP_DB,
    readyState: lookupConn?.readyState ?? 0,
  },
});
