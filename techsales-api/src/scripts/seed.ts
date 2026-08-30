/**
 * seed.ts
 *
 * Reads `techsales-api/data/sample/{runtime,lookup}/*.json` and writes both Mongo
 * databases on the Pi.
 *
 * Per plan §8 — does NOT use Mongoose `model()` definitions (Phase 3+ owns
 * those). Uses the underlying driver via `appConn.collection(name)` so the
 * seeder is independent of model schemas.
 *
 * Flags:
 *   npm run seed                       upsert by business key (idempotent)
 *   npm run seed -- --reset            drop both DBs, then insert
 *   npm run seed -- --reset --app      reset only medhub_app
 *   npm run seed -- --reset --lookup   reset only medhub_lookup
 *   npm run seed -- --only=leads,users only seed listed collections
 *   npm run seed -- --no-rebase        keep the snapshot's original dates
 *
 * By default, activity dates are rolled forward so the newest lead/enrollment
 * lands on the day you seed (see rebaseSeedDates.ts). Without that, every
 * period-scoped view goes empty as the snapshot ages.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connection } from 'mongoose';
import { connectMongo, appConn, lookupConn } from '../config/mongo.js';
import { logger } from '../config/logger.js';
import { createIndexesForCollection } from './createIndexes.js';
import {
  buildRebasePlan,
  rebaseDoc,
  describePlan,
  type RebasePlan,
} from '../utils/rebaseSeedDates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// techsales-api/src/scripts → techsales-api/
const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const SAMPLE_DIR = path.join(SERVER_ROOT, 'data', 'sample');

interface CollectionPlan {
  /** sample filename without extension, relative to bucket */
  fileBase: string;
  bucket: 'runtime' | 'lookup';
  db: 'app' | 'lookup';
  collection: string;
  /** business key field used as upsert criterion */
  businessKey: string;
}

/**
 * Maps each sample JSON file to its target collection + business key.
 * Filenames per plan §8 — runtime files match collection names, lookup
 * files are renamed (planInformation → plans, etc.).
 */
const COLLECTION_PLAN: CollectionPlan[] = [
  // app DB — runtime files map 1:1 to collection names
  { fileBase: 'leads', bucket: 'runtime', db: 'app', collection: 'leads', businessKey: 'leadId' },
  { fileBase: 'users', bucket: 'runtime', db: 'app', collection: 'users', businessKey: 'userId' },
  { fileBase: 'roles', bucket: 'runtime', db: 'app', collection: 'roles', businessKey: 'roleId' },
  { fileBase: 'departments', bucket: 'runtime', db: 'app', collection: 'departments', businessKey: 'departmentId' },
  { fileBase: 'enrollments', bucket: 'runtime', db: 'app', collection: 'enrollments', businessKey: 'enrollmentId' },
  { fileBase: 'members', bucket: 'runtime', db: 'app', collection: 'members', businessKey: 'memberId' },
  { fileBase: 'memberAppointments', bucket: 'runtime', db: 'app', collection: 'memberAppointments', businessKey: 'appointmentId' },
  { fileBase: 'targets', bucket: 'runtime', db: 'app', collection: 'targets', businessKey: 'targetId' },

  // lookup DB — file names rewritten to match collection names per plan §8
  { fileBase: 'planInformation', bucket: 'lookup', db: 'lookup', collection: 'plans', businessKey: 'planId' },
  { fileBase: 'benefitData', bucket: 'lookup', db: 'lookup', collection: 'benefits', businessKey: 'benefitId' },
  { fileBase: 'premiumInformation', bucket: 'lookup', db: 'lookup', collection: 'premiums', businessKey: 'premiumId' },
  { fileBase: 'starRatings', bucket: 'lookup', db: 'lookup', collection: 'starRatings', businessKey: 'ratingId' },
  { fileBase: 'drugData', bucket: 'lookup', db: 'lookup', collection: 'drugs', businessKey: 'drugId' },
  { fileBase: 'pharmacyData', bucket: 'lookup', db: 'lookup', collection: 'pharmacies', businessKey: 'pharmacyId' },
  { fileBase: 'providerData', bucket: 'lookup', db: 'lookup', collection: 'providers', businessKey: 'providerId' },
  { fileBase: 'zipStateCounty', bucket: 'lookup', db: 'lookup', collection: 'zipStateCounty', businessKey: 'zipCode' },
];

interface CliFlags {
  reset: boolean;
  resetApp: boolean;
  resetLookup: boolean;
  only: string[] | null;
  /** Seed the raw snapshot dates instead of rolling them forward to today. */
  noRebase: boolean;
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    reset: false,
    resetApp: false,
    resetLookup: false,
    only: null,
    noRebase: false,
  };
  for (const arg of argv) {
    if (arg === '--reset') flags.reset = true;
    else if (arg === '--app') flags.resetApp = true;
    else if (arg === '--lookup') flags.resetLookup = true;
    else if (arg === '--no-rebase') flags.noRebase = true;
    else if (arg.startsWith('--only=')) {
      flags.only = arg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  // --reset alone means both. --reset --app means only app. --reset --lookup means only lookup.
  if (flags.reset && !flags.resetApp && !flags.resetLookup) {
    flags.resetApp = true;
    flags.resetLookup = true;
  }
  return flags;
}

async function readSampleFile(plan: CollectionPlan): Promise<Record<string, unknown>[]> {
  const file = path.join(SAMPLE_DIR, plan.bucket, `${plan.fileBase}.json`);
  const raw = await fs.readFile(file, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array in ${file}, got ${typeof parsed}`);
  }
  return parsed as Record<string, unknown>[];
}

function pickConn(plan: CollectionPlan): Connection {
  const conn = plan.db === 'app' ? appConn : lookupConn;
  if (!conn) throw new Error(`No connection for db=${plan.db}`);
  return conn;
}

async function dropDb(conn: Connection, label: string): Promise<void> {
  logger.info({ db: label }, 'Dropping database');
  await conn.dropDatabase();
}

async function seedCollection(
  plan: CollectionPlan,
  mode: 'upsert' | 'insert',
  rebasePlan: RebasePlan | null,
): Promise<{ count: number }> {
  const docs = await readSampleFile(plan);
  // Roll the fixed historical snapshot forward so period-scoped views ("today",
  // "this week") are populated whenever the seed is run. Lookup data carries no
  // activity dates, so this is a no-op there.
  if (rebasePlan) {
    for (const doc of docs) rebaseDoc(doc, rebasePlan);
  }
  const conn = pickConn(plan);
  const coll = conn.collection(plan.collection);

  if (docs.length === 0) {
    logger.warn({ collection: plan.collection }, 'No documents in sample file');
    return { count: 0 };
  }

  if (mode === 'insert') {
    await coll.insertMany(docs);
  } else {
    // Upsert by business key. Use bulkWrite with replaceOne+upsert so that
    // re-running with mutated source data refreshes documents.
    const ops = docs.map((doc) => {
      const keyVal = doc[plan.businessKey];
      if (keyVal === undefined || keyVal === null) {
        throw new Error(
          `Document in ${plan.collection} missing businessKey ${plan.businessKey}: ${JSON.stringify(doc).slice(0, 120)}`,
        );
      }
      return {
        replaceOne: {
          filter: { [plan.businessKey]: keyVal },
          replacement: doc,
          upsert: true,
        },
      };
    });
    await coll.bulkWrite(ops, { ordered: false });
  }

  // Indexes after data — same spec is a no-op so this is idempotent.
  await createIndexesForCollection(conn, plan.collection);

  return { count: docs.length };
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  // Sanity-check the sample dir exists.
  try {
    await fs.access(SAMPLE_DIR);
  } catch {
    logger.error(
      { sampleDir: SAMPLE_DIR },
      'Sample directory missing — run `npm run transform-data` first',
    );
    process.exit(1);
  }

  // Force a Mongo connection — JSON mode is meaningless for the seeder.
  const result = await connectMongo();
  if (!result.ok || !appConn || !lookupConn) {
    logger.error({ err: result.error }, 'Cannot seed without a Mongo connection');
    process.exit(1);
  }

  // Filter to the requested subset of collections.
  const plans = flags.only
    ? COLLECTION_PLAN.filter((p) => flags.only!.includes(p.collection))
    : COLLECTION_PLAN;

  if (flags.only && plans.length === 0) {
    logger.error({ only: flags.only }, 'No collections matched --only filter');
    process.exit(1);
  }

  // Drop step. With --only, we never drop a whole DB — that would wipe
  // unrelated collections. The user ran `--only` precisely to scope writes.
  if ((flags.resetApp || flags.resetLookup) && !flags.only) {
    if (flags.resetApp) {
      await dropDb(appConn, 'medhub_app');
    }
    if (flags.resetLookup) {
      await dropDb(lookupConn, 'medhub_lookup');
    }
  } else if ((flags.resetApp || flags.resetLookup) && flags.only) {
    logger.warn(
      'Both --reset and --only specified: skipping DB drop (--only narrows scope, --reset would wipe siblings).',
    );
  }

  const dropped = flags.resetApp || flags.resetLookup;
  const seedMode: 'upsert' | 'insert' = dropped ? 'insert' : 'upsert';

  // Build the date-rebase mapping ONCE, from the activity spine (lead
  // createdAt + enrollment enrollmentDate), and share it across every
  // collection. A single mapping is what keeps leads older than their own
  // enrollments — see rebaseSeedDates.ts.
  let rebasePlan: RebasePlan | null = null;
  if (!flags.noRebase) {
    const spine: string[] = [];
    for (const p of COLLECTION_PLAN) {
      if (p.collection !== 'leads' && p.collection !== 'enrollments') continue;
      const docs = await readSampleFile(p);
      for (const d of docs) {
        const v = p.collection === 'leads' ? d.createdAt : d.enrollmentDate;
        if (typeof v === 'string') spine.push(v);
      }
    }
    rebasePlan = buildRebasePlan(spine, new Date());
    if (rebasePlan) {
      logger.info(describePlan(rebasePlan), 'Rebasing seed dates forward');
    } else {
      logger.warn('Could not build a date-rebase plan; seeding raw snapshot dates');
    }
  } else {
    logger.info('--no-rebase: seeding raw snapshot dates');
  }

  let total = 0;
  for (const plan of plans) {
    // If only one of the DBs was dropped, the other still uses upsert mode.
    const wasDropped =
      (plan.db === 'app' && flags.resetApp && !flags.only) ||
      (plan.db === 'lookup' && flags.resetLookup && !flags.only);
    const thisMode: 'upsert' | 'insert' = wasDropped ? 'insert' : 'upsert';
    try {
      const { count } = await seedCollection(plan, thisMode, rebasePlan);
      logger.info(
        { collection: plan.collection, db: plan.db, count, mode: thisMode },
        'Seeded',
      );
      total += count;
    } catch (err) {
      logger.error({ err, collection: plan.collection }, 'Seed failed for collection');
      throw err;
    }
  }

  logger.info({ total, seedMode }, 'Seed complete');

  await Promise.allSettled([appConn.close(), lookupConn.close()]);
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
