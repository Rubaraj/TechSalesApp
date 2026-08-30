import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../config/logger.js';
import { buildRebasePlan, rebaseDoc, describePlan, type RebasePlan } from './rebaseSeedDates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate the server root regardless of whether we're running from `src/` (tsx)
// or `dist/` (compiled). Both layouts have `<root>/<src|dist>/utils/bootstrap.<ts|js>`,
// so the parent of the parent is the server root.
const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const SAMPLE_DIR = path.join(SERVER_ROOT, 'data', 'sample');
const RUNTIME_DIR = path.join(SERVER_ROOT, 'data', 'runtime');
const LOOKUP_DIR = path.join(SERVER_ROOT, 'data', 'lookup');

interface BootstrapResult {
  ran: boolean;
  copied: string[];
  skipped: string[];
}

const exists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

/**
 * Build the date-rebase mapping from the sample activity spine, so the JSON
 * store bootstraps with the same rolled-forward dates the Mongo seeder writes.
 * Without this, `DATA_BACKEND=json` would serve the raw historical snapshot and
 * every period-scoped view would be empty.
 */
const buildSampleRebasePlan = async (srcDir: string): Promise<RebasePlan | null> => {
  const spine: string[] = [];
  for (const [file, field] of [
    ['leads.json', 'createdAt'],
    ['enrollments.json', 'enrollmentDate'],
  ] as const) {
    try {
      const rows = JSON.parse(await fs.readFile(path.join(srcDir, file), 'utf8')) as Record<string, unknown>[];
      for (const r of rows) {
        const v = r[field];
        if (typeof v === 'string') spine.push(v);
      }
    } catch {
      // Missing sample file — the caller already warns about that.
    }
  }
  return buildRebasePlan(spine, new Date());
};

const copyMissingFiles = async (
  srcDir: string,
  destDir: string,
  rebasePlan: RebasePlan | null = null,
): Promise<{ copied: string[]; skipped: string[] }> => {
  const copied: string[] = [];
  const skipped: string[] = [];

  if (!(await exists(srcDir))) {
    return { copied, skipped };
  }

  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.json')) continue;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (await exists(dest)) {
      skipped.push(entry.name);
      continue;
    }
    if (rebasePlan) {
      const rows = JSON.parse(await fs.readFile(src, 'utf8')) as unknown;
      if (Array.isArray(rows)) {
        for (const row of rows as Record<string, unknown>[]) rebaseDoc(row, rebasePlan);
        await fs.writeFile(dest, `${JSON.stringify(rows, null, 2)}
`, 'utf8');
      } else {
        await fs.copyFile(src, dest);
      }
    } else {
      await fs.copyFile(src, dest);
    }
    copied.push(entry.name);
  }
  return { copied, skipped };
};

/**
 * Phase 1 bootstrap (plan §4 "JSON repository persistence"):
 *
 *  - For each filename in `techsales-api/data/sample/{runtime,lookup}/`, copy to
 *    `techsales-api/data/{runtime,lookup}/<file>` ONLY IF the destination is missing
 *    (operator owns the runtime dir; never clobber).
 *  - To force re-seed: `npm run drop-runtime` then restart.
 *  - In Phase 1 the sample dir may not exist yet (it's created by the Phase 2b
 *    transform script). When that happens we log a warning and skip — it's
 *    only a hard failure if the backend is in JSON MODE *and* there's no
 *    sample data, which is checked by the caller.
 */
export async function bootstrapJsonStore(opts: {
  panicIfSampleMissing: boolean;
}): Promise<BootstrapResult> {
  const sampleExists = await exists(SAMPLE_DIR);
  if (!sampleExists) {
    const msg =
      `Sample data dir is missing: ${SAMPLE_DIR}. ` +
      `Run \`npm run transform-data\` (Phase 2b) to generate it.`;
    if (opts.panicIfSampleMissing) {
      throw new Error(msg);
    }
    logger.warn({ sampleDir: SAMPLE_DIR }, msg);
    return { ran: false, copied: [], skipped: [] };
  }

  // Roll activity dates forward on the way in, matching what `npm run seed`
  // writes to Mongo. Lookup data carries no activity dates, so it copies as-is.
  const rebasePlan = await buildSampleRebasePlan(path.join(SAMPLE_DIR, 'runtime'));
  if (rebasePlan) {
    logger.info(describePlan(rebasePlan), 'Bootstrap: rebasing sample dates forward');
  }

  const runtime = await copyMissingFiles(
    path.join(SAMPLE_DIR, 'runtime'),
    RUNTIME_DIR,
    rebasePlan,
  );
  const lookup = await copyMissingFiles(
    path.join(SAMPLE_DIR, 'lookup'),
    LOOKUP_DIR,
  );

  const copied = [
    ...runtime.copied.map((n) => `runtime/${n}`),
    ...lookup.copied.map((n) => `lookup/${n}`),
  ];
  const skipped = [
    ...runtime.skipped.map((n) => `runtime/${n}`),
    ...lookup.skipped.map((n) => `lookup/${n}`),
  ];

  if (copied.length > 0) {
    logger.info({ copied }, 'Bootstrap: copied sample files into runtime/lookup');
  }
  if (skipped.length > 0) {
    logger.debug({ skipped }, 'Bootstrap: skipped existing files');
  }
  return { ran: true, copied, skipped };
}

export const BOOTSTRAP_PATHS = {
  serverRoot: SERVER_ROOT,
  sampleDir: SAMPLE_DIR,
  runtimeDir: RUNTIME_DIR,
  lookupDir: LOOKUP_DIR,
};
