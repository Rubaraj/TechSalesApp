/**
 * Phase 4 (M1) — Backfill `assignedTo` on existing lead rows.
 *
 * New field added in `lead.model.ts` for Atlas's "my pipeline" tools. Legacy
 * rows have no value; this script sets `assignedTo = createdBy` so every
 * lead has an owner attribution. Idempotent — re-running is safe; rows that
 * already have `assignedTo` are skipped.
 *
 * Run via: `npx tsx src/scripts/migrate-lead-assignedTo.ts`.
 */
import 'dotenv/config';
import { connectMongo } from '../config/mongo.js';
import { getLeadModel } from '../models/lead.model.js';
import { logger } from '../config/logger.js';

async function main(): Promise<void> {
  const result = await connectMongo();
  if (result.mode !== 'mongo') {
    logger.warn({ mode: result.mode }, 'migrate-lead-assignedTo: not in mongo mode; nothing to do');
    return;
  }
  const Lead = getLeadModel();
  const matchExpr = { $or: [{ assignedTo: { $exists: false } }, { assignedTo: null }, { assignedTo: '' }] };
  const beforeCount = await Lead.countDocuments(matchExpr);
  logger.info({ beforeCount }, 'migrate-lead-assignedTo: rows missing assignedTo');

  if (beforeCount === 0) {
    logger.info('migrate-lead-assignedTo: nothing to backfill');
    return;
  }

  // Aggregation pipeline updates support self-referential set ops on Mongo 4.2+.
  const updateResult = await Lead.updateMany(matchExpr, [
    { $set: { assignedTo: { $ifNull: ['$assignedTo', '$createdBy'] } } },
  ]);
  logger.info(
    { matched: updateResult.matchedCount, modified: updateResult.modifiedCount },
    'migrate-lead-assignedTo: backfill complete',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'migrate-lead-assignedTo: failed');
    process.exit(1);
  });
