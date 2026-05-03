/**
 * transform-sample-data.ts
 *
 * Reads sanitized JSON from `techsales-app/src/data/{runtime,lookup}` and
 * writes carrier-sanitized output to `techsales-api/data/sample/{runtime,lookup}`.
 *
 * Phase 2a already rewrote real carrier names in the FE source, so this is
 * primarily a copy step. The case-preservation regex from plan §5 still runs
 * as a safety net so any newly added file or stray brand string is rewritten
 * before the seeder ever sees it.
 *
 * Run: `npm run transform-data`
 *
 * Idempotent — safe to re-run on any change to the FE source.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// techsales-api/src/scripts → repo root is three levels up
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const FE_DATA_DIR = path.join(REPO_ROOT, 'techsales-app', 'src', 'data');
const SERVER_DATA_DIR = path.join(REPO_ROOT, 'server', 'data');
const SAMPLE_DIR = path.join(SERVER_DATA_DIR, 'sample');

// Per plan §5 + Phase 2a addendum (WellCare → Carrier 6).
const CARRIER_MAP: Record<string, string> = {
  'Blue Cross Blue Shield': 'Carrier 5',
  Aetna: 'Carrier 1',
  Humana: 'Carrier 2',
  UnitedHealthcare: 'Carrier 3',
  Cigna: 'Carrier 4',
  WellCare: 'Carrier 6',
};

const ABBREV_MAP: Record<string, string> = {
  UHC: 'C3',
  BCBS: 'C5',
  BlueCross: 'Carrier 5',
};

// Per plan §5: word-bounded URL host substrings must redirect to example.com/<slug>.
const URL_CARRIER_SLUGS: Record<string, string> = {
  aetna: 'carrier1',
  humana: 'carrier2',
  unitedhealthcare: 'carrier3',
  uhc: 'carrier3',
  cigna: 'carrier4',
  bluecross: 'carrier5',
  bcbs: 'carrier5',
  wellcare: 'carrier6',
};

// Files we deliberately ignore (per task instructions — not in §8 collection map).
const IGNORED_RUNTIME_FILES = new Set([
  'lisEligibility.json',
  'medicaidEligibility.json',
  'ekit.json',
  'soa.json',
]);

/** Preserve casing of `orig` when emitting `repl`. */
function matchCase(orig: string, repl: string): string {
  if (orig === orig.toUpperCase()) return repl.toUpperCase();
  if (orig === orig.toLowerCase()) return repl.toLowerCase();
  return repl;
}

function transformText(s: string): string {
  let out = s;
  // CARRIER_MAP: case-insensitive, with case preservation.
  for (const [from, to] of Object.entries(CARRIER_MAP)) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), (m) => matchCase(m, to));
  }
  // ABBREV_MAP: case-sensitive — only replace literal `UHC` / `BCBS` / `BlueCross`.
  for (const [from, to] of Object.entries(ABBREV_MAP)) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'g'), to);
  }
  return out;
}

/** Rewrites URLs that contain real carrier hostnames to example.com/<slug>/<rest>. */
function transformUrl(url: string): string {
  // Cheap pre-check.
  if (!/^https?:\/\//i.test(url)) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname.toLowerCase();
  for (const [needle, slug] of Object.entries(URL_CARRIER_SLUGS)) {
    if (host.includes(needle)) {
      const tail = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
      const search = parsed.search;
      return `https://example.com/${slug}${tail}${search}`;
    }
  }
  return url;
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

/**
 * Walks a JSON tree and applies:
 *   - case-preserving carrier text replacement to every string
 *   - URL transform to any string starting with http(s)://
 *   - rename `existingAetnaMember` → `existingCarrier1Member` on object keys
 */
function transformValue(value: JsonValue): JsonValue {
  if (value === null) return value;
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) return transformUrl(value);
    return transformText(value);
  }
  if (Array.isArray(value)) {
    return value.map(transformValue);
  }
  if (typeof value === 'object') {
    const out: { [k: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value)) {
      const newKey = k === 'existingAetnaMember' ? 'existingCarrier1Member' : k;
      out[newKey] = transformValue(v);
    }
    return out;
  }
  return value;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => e.name);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return [];
    throw err;
  }
}

interface TransformStats {
  bucket: 'runtime' | 'lookup';
  fileCount: number;
  skipped: string[];
}

async function transformBucket(
  bucket: 'runtime' | 'lookup',
): Promise<TransformStats> {
  const srcDir = path.join(FE_DATA_DIR, bucket);
  const dstDir = path.join(SAMPLE_DIR, bucket);
  await ensureDir(dstDir);

  const files = await listJsonFiles(srcDir);
  const skipped: string[] = [];
  let written = 0;

  for (const fname of files) {
    if (bucket === 'runtime' && IGNORED_RUNTIME_FILES.has(fname)) {
      skipped.push(fname);
      continue;
    }
    const srcPath = path.join(srcDir, fname);
    const dstPath = path.join(dstDir, fname);
    const raw = await fs.readFile(srcPath, 'utf8');

    let parsed: JsonValue;
    try {
      parsed = JSON.parse(raw) as JsonValue;
    } catch (err) {
      logger.error({ err, file: srcPath }, 'Failed to parse JSON; skipping');
      continue;
    }
    const transformed = transformValue(parsed);
    // Pretty-print so diffs are reviewable in git.
    const out = JSON.stringify(transformed, null, 2) + '\n';
    await fs.writeFile(dstPath, out, 'utf8');
    written++;
  }

  return { bucket, fileCount: written, skipped };
}

async function main(): Promise<void> {
  logger.info(
    {
      from: FE_DATA_DIR,
      to: SAMPLE_DIR,
    },
    'Transform: starting carrier-sanitized copy',
  );

  await ensureDir(SAMPLE_DIR);

  const runtimeStats = await transformBucket('runtime');
  const lookupStats = await transformBucket('lookup');

  logger.info(
    {
      runtime: runtimeStats,
      lookup: lookupStats,
    },
    'Transform: complete',
  );
}

main().catch((err) => {
  logger.error({ err }, 'Transform failed');
  process.exit(1);
});
