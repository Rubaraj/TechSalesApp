/**
 * drop-runtime.ts
 *
 * Deletes every `*.json` under `techsales-api/data/runtime/` — the JSON-mode store.
 * Does NOT touch `techsales-api/data/lookup/` (read-only mirror) or
 * `techsales-api/data/sample/` (regenerable inputs).
 *
 * Run: `npm run drop-runtime`
 *
 * After this, the next backend boot copies fresh files in from
 * `techsales-api/data/sample/runtime/` via `bootstrapJsonStore`.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// techsales-api/src/scripts → techsales-api/
const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = path.join(SERVER_ROOT, 'data', 'runtime');

async function main(): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(RUNTIME_DIR);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      logger.info({ dir: RUNTIME_DIR }, 'Runtime dir does not exist; nothing to do');
      process.exit(0);
    }
    throw err;
  }

  let removed = 0;
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(RUNTIME_DIR, name);
    await fs.unlink(file);
    removed++;
  }

  logger.info({ dir: RUNTIME_DIR, removed }, 'Runtime JSON files deleted');
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'drop-runtime failed');
  process.exit(1);
});
