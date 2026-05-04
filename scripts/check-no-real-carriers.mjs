#!/usr/bin/env node
/**
 * CI guard — fail the build if real carrier names leak into source.
 *
 * Phase 6 added scope for `techsales-api/src/ai/{prompts,agents}/**` on top
 * of the existing trees from the MongoDB plan:
 *   - techsales-app/src/**
 *   - techsales-app/public/**
 *   - techsales-api/data/sample/**
 *   - techsales-api/src/ai/prompts/**   (new in Phase 6)
 *   - techsales-api/src/ai/agents/**    (new in Phase 6)
 *
 * Exit 0 on clean, 1 with file:line:carrier on hits.
 *
 * Run:  node scripts/check-no-real-carriers.mjs
 */
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

// Scoped trees. Each entry is a path relative to REPO_ROOT.
const SCAN_TREES = [
  'techsales-app/src',
  'techsales-app/public',
  'techsales-api/data/sample',
  'techsales-api/src/ai/prompts',
  'techsales-api/src/ai/agents',
];

// Files we never read into the scanner — pure noise.
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.git',
  'coverage',
]);
const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.bin',
  '.lock',
  '.map',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
]);

const CARRIER_PATTERN =
  /\b(aetna|humana|cigna|unitedhealthcare|uhc|bcbs|blue[\s-]?cross|anthem|wellcare|aarp)\b/i;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
      continue;
    }
    if (!entry.isFile()) continue;
    const dot = entry.name.lastIndexOf('.');
    const ext = dot >= 0 ? entry.name.slice(dot).toLowerCase() : '';
    if (SKIP_EXTENSIONS.has(ext)) continue;
    yield full;
  }
}

const hits = [];
for (const tree of SCAN_TREES) {
  const root = join(REPO_ROOT, tree);
  let st;
  try {
    st = statSync(root);
  } catch {
    // tree doesn't exist — that's fine, we just skip it.
    continue;
  }
  if (!st.isDirectory()) continue;
  for (const file of walk(root)) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      // unreadable / binary — skip.
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(CARRIER_PATTERN);
      if (match) {
        hits.push({
          file: relative(REPO_ROOT, file).split(sep).join('/'),
          line: i + 1,
          carrier: match[0],
          excerpt: line.trim().slice(0, 200),
        });
      }
    }
  }
}

if (hits.length === 0) {
  // Plain stdout — keep CI logs grep-friendly.
  process.stdout.write('check-no-real-carriers: clean (no hits)\n');
  process.exit(0);
}

process.stderr.write(
  `check-no-real-carriers: ${hits.length} hit${hits.length === 1 ? '' : 's'}\n`,
);
for (const h of hits) {
  process.stderr.write(`  ${h.file}:${h.line}  [${h.carrier}]  ${h.excerpt}\n`);
}
process.exit(1);
