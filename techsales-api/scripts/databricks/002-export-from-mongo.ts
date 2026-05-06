/**
 * Phase 1a — Export every Mongo collection to NDJSON files at
 * `data/databricks-bootstrap/{collection}.ndjson`.
 *
 * Run this on the DEV BOX (where Mongo on the Pi is reachable). Commits the
 * NDJSON files so they travel through git into the org. Inside the org, run
 * `003-load-to-databricks.ts` to push them into the Delta tables.
 *
 *   npm run migrate:export
 *
 * The output is a flat directory of `.ndjson` files, one per logical entity.
 * Each line is a single JSON-encoded document with Mongo internals (`_id`,
 * `__v`) stripped.
 */
import 'dotenv/config';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';

const OUT_DIR = path.resolve('data/databricks-bootstrap');

interface Collection {
  /** Mongo collection name (in `medhub_app` or `medhub_lookup`). */
  collection: string;
  /** Which DB the collection lives in. */
  dbName: 'medhub_app' | 'medhub_lookup';
  /** Output filename (without extension). */
  outFile: string;
  /** Primary-key field on each document. Used for Databricks insert column. */
  pkField: string;
}

const COLLECTIONS: Collection[] = [
  { collection: 'leads',               dbName: 'medhub_app',    outFile: 'leads',               pkField: 'leadId' },
  { collection: 'users',               dbName: 'medhub_app',    outFile: 'users',               pkField: 'userId' },
  { collection: 'roles',               dbName: 'medhub_app',    outFile: 'roles',               pkField: 'roleId' },
  { collection: 'departments',         dbName: 'medhub_app',    outFile: 'departments',         pkField: 'departmentId' },
  { collection: 'enrollments',         dbName: 'medhub_app',    outFile: 'enrollments',         pkField: 'enrollmentId' },
  { collection: 'targets',             dbName: 'medhub_app',    outFile: 'targets',             pkField: 'targetId' },
  { collection: 'aiInteractions',      dbName: 'medhub_app',    outFile: 'ai_interactions',     pkField: 'interactionId' },
  // members + memberAppointments live in medhub_app on the Mongo side (the
  // models are bound to appConn). They MOVE to medhub_lookup on the Databricks
  // side because they're reference-style data once frozen — that reorg happens
  // in the load script, not here. Source DB is medhub_app.
  { collection: 'members',             dbName: 'medhub_app',    outFile: 'members',             pkField: 'memberId' },
  { collection: 'memberAppointments',  dbName: 'medhub_app',    outFile: 'member_appointments', pkField: 'appointmentId' },
];

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI not set in .env — cannot export.');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`[export] writing to ${OUT_DIR}`);

  let totalDocs = 0;
  for (const c of COLLECTIONS) {
    const conn = mongoose.createConnection(uri, { dbName: c.dbName });
    try {
      await conn.asPromise();
      const coll = conn.db?.collection(c.collection);
      if (!coll) {
        console.warn(`[export] ${c.dbName}.${c.collection}: db not ready, skipping`);
        continue;
      }
      const docs = await coll.find({}).toArray();
      const lines = docs.map((doc) => {
        const { _id: _i, __v: _v, ...rest } = doc as Record<string, unknown>;
        return JSON.stringify(rest);
      });
      const outPath = path.join(OUT_DIR, `${c.outFile}.ndjson`);
      await writeFile(outPath, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8');
      console.log(
        `[export] ${c.dbName}.${c.collection.padEnd(22)} → ${path.basename(outPath).padEnd(28)} (${docs.length} docs)`,
      );
      totalDocs += docs.length;
    } finally {
      await conn.close().catch(() => undefined);
    }
  }

  console.log(`[export] done. ${totalDocs} docs across ${COLLECTIONS.length} collections.`);
}

main().catch((err) => {
  console.error('[export] failed:', err);
  process.exit(1);
});
