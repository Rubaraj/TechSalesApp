/**
 * Phase 1a — Load NDJSON files at `data/databricks-bootstrap/*.ndjson` into
 * the Delta tables created by `001-init-schema.sql`.
 *
 * Run this INSIDE THE ORG (where Databricks SQL Warehouse is reachable):
 *
 *   $env:DATABRICKS_HOST = '...'
 *   $env:DATABRICKS_HTTP_PATH = '...'
 *   $env:DATABRICKS_TOKEN = '...'
 *   npm run migrate:load
 *
 * Each row becomes an INSERT INTO statement with two columns: the primary
 * key + the JSON blob. created_at/updated_at are pulled from the entity if
 * present (otherwise NULL).
 *
 * Modes:
 *   --mode=replace  (default) — TRUNCATE before insert
 *   --mode=append             — append; primary keys must not collide
 *
 * The script is idempotent in `replace` mode: running twice yields the same
 * row count.
 */
import 'dotenv/config';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { env } from '../../src/config/env.js';
import {
  createDatabricksClient,
  qualifiedTable,
  type DatabricksClient,
} from '../../src/repositories/databricks/databricksClient.js';

const IN_DIR = path.resolve('data/databricks-bootstrap');

interface TableMapping {
  ndjsonFile: string;
  schema: string;
  table: string;
  pkColumn: string;
  pkField: string;
}

const TABLES: TableMapping[] = [
  { ndjsonFile: 'leads.ndjson',               schema: env.DATABRICKS_APP_SCHEMA,    table: 'leads',               pkColumn: 'lead_id',        pkField: 'leadId' },
  { ndjsonFile: 'users.ndjson',               schema: env.DATABRICKS_APP_SCHEMA,    table: 'users',               pkColumn: 'user_id',        pkField: 'userId' },
  { ndjsonFile: 'roles.ndjson',               schema: env.DATABRICKS_APP_SCHEMA,    table: 'roles',               pkColumn: 'role_id',        pkField: 'roleId' },
  { ndjsonFile: 'departments.ndjson',         schema: env.DATABRICKS_APP_SCHEMA,    table: 'departments',         pkColumn: 'department_id',  pkField: 'departmentId' },
  { ndjsonFile: 'enrollments.ndjson',         schema: env.DATABRICKS_APP_SCHEMA,    table: 'enrollments',         pkColumn: 'enrollment_id',  pkField: 'enrollmentId' },
  { ndjsonFile: 'targets.ndjson',             schema: env.DATABRICKS_APP_SCHEMA,    table: 'targets',             pkColumn: 'target_id',      pkField: 'targetId' },
  { ndjsonFile: 'ai_interactions.ndjson',     schema: env.DATABRICKS_APP_SCHEMA,    table: 'ai_interactions',     pkColumn: 'interaction_id', pkField: 'interactionId' },
  { ndjsonFile: 'members.ndjson',             schema: env.DATABRICKS_LOOKUP_SCHEMA, table: 'members',             pkColumn: 'member_id',      pkField: 'memberId' },
  { ndjsonFile: 'member_appointments.ndjson', schema: env.DATABRICKS_LOOKUP_SCHEMA, table: 'member_appointments', pkColumn: 'appointment_id', pkField: 'appointmentId' },
];

interface CliOpts {
  mode: 'replace' | 'append';
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2);
  const modeArg = args.find((a) => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : 'replace';
  if (mode !== 'replace' && mode !== 'append') {
    console.error(`Invalid --mode: ${mode}. Use 'replace' or 'append'.`);
    process.exit(1);
  }
  return { mode: mode as 'replace' | 'append' };
}

async function loadTable(
  client: DatabricksClient,
  m: TableMapping,
  opts: CliOpts,
): Promise<number> {
  const ndjsonPath = path.join(IN_DIR, m.ndjsonFile);
  if (!existsSync(ndjsonPath)) {
    console.warn(`[load] ${m.ndjsonFile} not found, skipping`);
    return 0;
  }
  const raw = await readFile(ndjsonPath, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    console.log(`[load] ${m.ndjsonFile}: 0 rows, skipping`);
    return 0;
  }
  const fq = qualifiedTable(env.DATABRICKS_CATALOG, m.schema, m.table);

  if (opts.mode === 'replace') {
    await client.execute(`TRUNCATE TABLE ${fq}`);
  }

  let inserted = 0;
  for (const line of lines) {
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(line);
    } catch (err) {
      console.warn(`[load] ${m.ndjsonFile}: skipping malformed line — ${(err as Error).message}`);
      continue;
    }
    const pk = String(doc[m.pkField] ?? '');
    if (!pk) {
      console.warn(`[load] ${m.ndjsonFile}: row missing ${m.pkField}, skipping`);
      continue;
    }
    const createdAt = typeof doc.createdAt === 'string' ? doc.createdAt : null;
    const updatedAt = typeof doc.updatedAt === 'string' ? doc.updatedAt : null;
    await client.execute(
      `INSERT INTO ${fq} (${m.pkColumn}, data, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      [pk, JSON.stringify(doc), createdAt, updatedAt],
    );
    inserted++;
  }
  console.log(`[load] ${m.table.padEnd(22)} ← ${m.ndjsonFile.padEnd(28)} (${inserted} rows)`);
  return inserted;
}

async function main(): Promise<void> {
  const opts = parseArgs();
  if (!existsSync(IN_DIR)) {
    console.error(`[load] input directory not found: ${IN_DIR}`);
    console.error('       Run `npm run migrate:export` on the dev box first.');
    process.exit(1);
  }
  const found = await readdir(IN_DIR);
  console.log(`[load] mode=${opts.mode}; ${found.length} files in ${IN_DIR}`);

  const client = createDatabricksClient();
  let total = 0;
  try {
    for (const m of TABLES) {
      total += await loadTable(client, m, opts);
    }
  } finally {
    await client.close();
  }
  console.log(`[load] done. ${total} rows across ${TABLES.length} tables.`);
}

main().catch((err) => {
  console.error('[load] failed:', err);
  process.exit(1);
});
