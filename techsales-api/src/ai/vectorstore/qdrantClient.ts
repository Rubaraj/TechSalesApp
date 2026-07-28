/**
 * Singleton `QdrantClient`. Constructed lazily on first call so the server
 * boots cleanly when Qdrant isn't running yet. The first call also issues
 * a fire-and-forget health probe — if Qdrant is unreachable we log a warning
 * but keep the client around (later operations will surface the real error
 * with a useful stack).
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

let cached: QdrantClient | null = null;
let probed = false;

/**
 * Per-request ceiling. The SDK defaults to 300 000 ms and disables socket
 * timeouts entirely, so a Qdrant that accepts the connection and then
 * stalls would block the caller for five minutes — long enough to leave a
 * live voice call silent until the caller hangs up.
 */
const REQUEST_TIMEOUT_MS = 5_000;

export function getQdrantClient(): QdrantClient {
  if (cached) return cached;
  cached = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY && env.QDRANT_API_KEY.trim() !== '' ? env.QDRANT_API_KEY : undefined,
    timeout: REQUEST_TIMEOUT_MS,
  });
  if (!probed) {
    probed = true;
    void cached
      .getCollections()
      .then((res) => {
        logger.info(
          { url: env.QDRANT_URL, collections: res.collections.map((c) => c.name) },
          'Qdrant client connected',
        );
      })
      .catch((err) => {
        logger.warn(
          { err, url: env.QDRANT_URL },
          'Qdrant health probe failed (will retry on first real call)',
        );
      });
  }
  return cached;
}

/** Test seam — drop the cached singleton so a re-import picks up new env. */
export const __resetQdrantClientForTests = (): void => {
  cached = null;
  probed = false;
};
