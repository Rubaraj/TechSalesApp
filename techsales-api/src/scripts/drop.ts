/**
 * drop.ts
 *
 * Drops both `medhub_app` and `medhub_lookup` on the configured Mongo host.
 * Useful for "start from a clean slate" before `npm run seed`.
 *
 * Run: `npm run drop`
 */
import { connectMongo, appConn, lookupConn } from '../config/mongo.js';
import { logger } from '../config/logger.js';

async function main(): Promise<void> {
  const result = await connectMongo();
  if (!result.ok || !appConn || !lookupConn) {
    logger.error(
      { err: result.error },
      'Cannot drop without a Mongo connection (set FORCE_JSON=false and check Pi reachability)',
    );
    process.exit(1);
  }

  logger.info('Dropping medhub_app');
  await appConn.dropDatabase();
  logger.info('Dropping medhub_lookup');
  await lookupConn.dropDatabase();

  await Promise.allSettled([appConn.close(), lookupConn.close()]);
  logger.info('Drop complete');
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'Drop failed');
  process.exit(1);
});
