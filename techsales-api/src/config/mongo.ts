import mongoose, { type Connection } from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

// Two logically separate Mongoose Connections sharing one cluster.
// Models are bound to the appropriate connection in their respective
// model files (Phase 3+). For Phase 1 these are populated at startup
// only when Mongo is reachable.
export let appConn: Connection | undefined;
export let lookupConn: Connection | undefined;

export type ConnectMode = 'mongo' | 'json';

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
 */
export async function connectMongo(): Promise<ConnectResult> {
  if (env.FORCE_JSON) {
    logger.info('FORCE_JSON=true — skipping Mongo connection, using JSON store');
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
