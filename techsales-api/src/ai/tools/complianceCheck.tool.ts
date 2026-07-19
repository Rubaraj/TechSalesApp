/**
 * Phase 3a → admin-editable — CMS compliance scanner for agent transcript
 * chunks.
 *
 * Rules now live in the `complianceRules` collection (Admin › Compliance
 * Rules) instead of a hardcoded array. `loadActiveRules()` reads them with a
 * 60s TTL cache (invalidated explicitly by the CRUD controller) and compiles
 * phrase lists + optional advanced regex into RegExps; the per-call scanner
 * stays a pure sync function over the compiled set. First load on an empty
 * collection seeds the 8 legacy rules so behavior never regresses.
 *
 * Match semantics (unchanged):
 *   - Phrase-level, word-boundary anchored, case-insensitive.
 *   - Normalize text first: lowercase + collapse whitespace + strip
 *     trailing-token punctuation (Deepgram returns punctuated mixed-case).
 *   - Returns one entry per matched rule.
 */
import { logger } from '../../config/logger.js';
import { repos } from '../../repositories/registry.js';
import type { ComplianceRule, ComplianceSeverity } from '../../types/index.js';

export interface ComplianceViolation {
  /** The substring that triggered the rule, in original casing (for UI). */
  phrase: string;
  /** Plain-English rule citation. */
  rule: string;
  /** Suggested rephrase the agent could have used. */
  suggestion: string;
  severity: ComplianceSeverity;
  ruleId: string;
  ruleName: string;
}

export interface CompiledRule {
  ruleId: string;
  name: string;
  ruleText: string;
  suggestion: string;
  severity: ComplianceSeverity;
  patterns: RegExp[];
}

const CACHE_TTL_MS = 60_000;
let cache: { rules: CompiledRule[]; at: number } | null = null;
let seeding: Promise<void> | null = null;

/** Call after any rule mutation so the next call reloads immediately. */
export function invalidateRulesCache(): void {
  cache = null;
}

/** Sync view of the compiled cache for the per-chunk hot path. Callers warm
 *  it via `loadActiveRules()` at call start; empty only before first load. */
export function getCompiledRulesSync(): CompiledRule[] {
  return cache?.rules ?? [];
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(rule: ComplianceRule): CompiledRule | null {
  const patterns: RegExp[] = [];
  const phrases = (rule.phrases ?? []).map((p) => p.trim()).filter(Boolean);
  if (phrases.length > 0) {
    try {
      patterns.push(new RegExp(`\\b(?:${phrases.map(escapeRegex).join('|')})\\b`, 'i'));
    } catch (err) {
      logger.warn({ err, ruleId: rule.ruleId }, 'compliance rule: phrase compile failed — skipped');
    }
  }
  if (rule.regex) {
    try {
      patterns.push(new RegExp(rule.regex, 'i'));
    } catch (err) {
      logger.warn({ err, ruleId: rule.ruleId }, 'compliance rule: regex compile failed — skipped');
    }
  }
  if (patterns.length === 0) return null;
  return {
    ruleId: rule.ruleId,
    name: rule.name,
    ruleText: rule.ruleText,
    suggestion: rule.suggestion,
    severity: rule.severity ?? 'warn',
    patterns,
  };
}

/**
 * Load + compile the active rule set (TTL-cached). Never throws — on repo
 * failure returns the last cached set (or empty).
 */
export async function loadActiveRules(): Promise<CompiledRule[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rules;
  try {
    let all = await repos.complianceRule.findAll(false);
    if (all.length === 0) {
      // One-time seed of the legacy hardcoded rules (idempotent by count).
      if (!seeding) seeding = seedLegacyRules();
      await seeding;
      seeding = null;
      all = await repos.complianceRule.findAll(false);
    }
    const compiled = all
      .filter((r) => r.isActive)
      .map(compile)
      .filter((r): r is CompiledRule => r !== null);
    cache = { rules: compiled, at: Date.now() };
    return compiled;
  } catch (err) {
    logger.error({ err }, 'compliance rules: load failed — using stale/empty set');
    return cache?.rules ?? [];
  }
}

/**
 * Normalize then scan against a compiled rule set. Pure + sync (per-call
 * hot path); callers load rules once per call via `loadActiveRules()`.
 */
export function scanForViolations(
  agentText: string,
  rules: CompiledRule[],
): ComplianceViolation[] {
  if (!agentText || rules.length === 0) return [];
  const normalized = normalize(agentText);
  const hits: ComplianceViolation[] = [];
  for (const r of rules) {
    for (const pattern of r.patterns) {
      const m = normalized.match(pattern);
      if (m) {
        hits.push({
          phrase: m[0],
          rule: r.ruleText,
          suggestion: r.suggestion,
          severity: r.severity,
          ruleId: r.ruleId,
          ruleName: r.name,
        });
        break; // one hit per rule
      }
    }
  }
  return hits;
}

/** Lowercase + collapse whitespace + strip leading/trailing punctuation
 *  per-token. "Best plan." → "best plan". */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,!?;:]+(?=\s|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Legacy seed (the original 8 hardcoded rules) ---------------------------

const LEGACY_RULES: Array<Omit<ComplianceRule, 'ruleId' | 'createdAt'>> = [
  {
    name: 'Superlatives ("best plan")',
    ruleText: 'No superlatives in Medicare marketing (CMS marketing rule).',
    suggestion: 'Say "a plan that may fit your needs" instead of "the best plan."',
    phrases: [],
    regex: '\\b(?:the|this|that|our|my|a) best plan\\b|\\bbest plan (?:for|to|here|right)\\b',
    severity: 'warn',
    isActive: true,
  },
  {
    name: 'Guarantees',
    ruleText: 'Cannot guarantee benefits or outcomes.',
    suggestion: 'Say "this plan includes…" instead of "guaranteed."',
    phrases: ['guarantee', 'guaranteed', 'guarantees'],
    severity: 'critical',
    isActive: true,
  },
  {
    name: 'Pressure language',
    ruleText: 'Cannot pressure beneficiaries — present options neutrally.',
    suggestion: 'Say "you may want to consider…" instead of "you must."',
    phrases: [],
    regex: "\\byou (?:need to|must) (?:have|enroll|sign|do|get)\\b|\\byou need this\\b",
    severity: 'warn',
    isActive: true,
  },
  {
    name: 'Disparaging Original Medicare',
    ruleText: 'Cannot disparage Original Medicare.',
    suggestion: 'Compare specific benefits rather than disparaging Original Medicare.',
    phrases: [],
    regex: '\\bbetter than (?:original )?medicare\\b',
    severity: 'warn',
    isActive: true,
  },
  {
    name: 'Bandwagon pressure',
    ruleText: 'Cannot use bandwagon pressure.',
    suggestion: 'Say "many people in your area consider…" instead.',
    phrases: [],
    regex: '\\beveryone (?:chooses|picks|wants|buys|takes) this\\b|\\beverybody chooses this\\b',
    severity: 'warn',
    isActive: true,
  },
  {
    name: 'False urgency',
    ruleText: 'Cannot create false urgency outside enrollment windows.',
    suggestion: 'State the enrollment period facts instead.',
    phrases: ['act now', 'hurry'],
    regex: "\\blimited time (?:offer|only)?\\b|\\bdon't wait\\b",
    severity: 'warn',
    isActive: true,
  },
  {
    name: 'Misrepresenting costs ("free")',
    ruleText: 'Cannot misrepresent costs ("free" implies no premium / no cost-share).',
    suggestion: 'Say "this plan has a $0 premium" only if true; otherwise itemize costs.',
    phrases: [],
    regex: "\\bit's free\\b|\\bthis is free\\b|\\bthe plan is free\\b|\\bcompletely free\\b",
    severity: 'critical',
    isActive: true,
  },
  {
    name: 'Health-status questions (non-SNP)',
    ruleText: 'Cannot ask about health status for non-SNP marketing.',
    suggestion: 'Only ask health questions when relevant to SNP eligibility.',
    phrases: [],
    regex:
      '\\b(?:do you have|are you taking) (?:diabetes|high blood pressure|cancer|copd|heart (?:disease|failure))\\b',
    severity: 'critical',
    isActive: true,
  },
];

async function seedLegacyRules(): Promise<void> {
  try {
    for (const rule of LEGACY_RULES) {
      await repos.complianceRule.create(rule);
    }
    logger.info({ count: LEGACY_RULES.length }, 'compliance rules: seeded legacy defaults');
  } catch (err) {
    logger.error({ err }, 'compliance rules: legacy seed failed');
  }
}
