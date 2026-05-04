/**
 * Singleton `OllamaEmbeddings`. Lazy-instantiated on first call so the server
 * still boots cleanly when Ollama isn't running yet (Phase 2 indexing is
 * gated behind an explicit npm script anyway).
 *
 * On first construction we kick off a fire-and-forget "warmup" embed so the
 * model is hot in Ollama's process memory before the first real request.
 * Failures are logged but don't crash the process — Phase 2's index script
 * will surface a louder error if the embedder still isn't reachable when
 * actual indexing runs.
 */
import { OllamaEmbeddings } from '@langchain/ollama';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

let cached: OllamaEmbeddings | null = null;
let warmedUp = false;

export function getEmbedder(): OllamaEmbeddings {
  if (cached) return cached;
  cached = new OllamaEmbeddings({
    baseUrl: env.OLLAMA_URL,
    model: env.AI_EMBED_MODEL,
  });
  if (!warmedUp) {
    warmedUp = true;
    void cached
      .embedQuery('warmup')
      .then((vec) => {
        logger.info(
          {
            ollamaUrl: env.OLLAMA_URL,
            model: env.AI_EMBED_MODEL,
            dim: vec.length,
          },
          'Ollama embedder warm-up succeeded',
        );
        if (vec.length !== env.AI_EMBED_DIM) {
          logger.warn(
            { expected: env.AI_EMBED_DIM, actual: vec.length },
            'AI_EMBED_DIM does not match Ollama model output dimension',
          );
        }
      })
      .catch((err) => {
        logger.warn(
          { err, ollamaUrl: env.OLLAMA_URL, model: env.AI_EMBED_MODEL },
          'Ollama embedder warm-up failed (will retry on first real call)',
        );
      });
  }
  return cached;
}

/** Test seam — drop the cached singleton so a re-import picks up new env. */
export const __resetEmbedderForTests = (): void => {
  cached = null;
  warmedUp = false;
};
