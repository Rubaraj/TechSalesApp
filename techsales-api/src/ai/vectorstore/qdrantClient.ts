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

export function getQdrantClient(): QdrantClient {
  if (cached) return cached;
  cached = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY && env.QDRANT_API_KEY.trim() !== '' ? env.QDRANT_API_KEY : undefined,
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
