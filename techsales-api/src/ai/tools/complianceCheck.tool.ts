/**
 * Phase 3a — Regex-based CMS compliance scanner for agent transcript chunks.
 *
 * Plain function (not LangChain `tool()` — Phase 3c wraps it). Source:
 * SALES_IQ_COPILOT.md §7.
 *
 * Match semantics (per plan-review feedback):
 *   - Phrase-level, not word-level. "best plan" matches "the best plan" but
 *     NOT "best of the rest". Drops false-positive rate dramatically.
 *   - Case-insensitive. Word-boundary on phrase ends.
 *   - Normalize text first: lowercase + collapse whitespace + strip
 *     trailing-token punctuation. Deepgram returns punctuated mixed-case.
 *   - Returns one entry per matched rule (multiple rules can fire on the
 *     same utterance — "you must enroll in this best plan now" trips
 *     multiple guards).
 */

export interface ComplianceViolation {
  /** The substring that triggered the rule, in original casing (for UI). */
  phrase: string;
  /** Plain-English rule citation. */
  rule: string;
  /** Suggested rephrase the agent could have used. */
  suggestion: string;
}

interface RuleDef {
  pattern: RegExp;
  rule: string;
  suggestion: string;
}

// Phrase-level patterns. Each one MUST match at word boundaries on both
// ends to avoid matching inside larger words (e.g. "guarantee" inside
// "guaranteed" — both are valid hits here, hence the alternation).
const RULES: RuleDef[] = [
  {
    // Match "best plan" only as part of a noun phrase — i.e. preceded by an
    // article/demonstrative (the/this/that/our/my/a) OR followed by a
    // specifying preposition (for/to/here/right). Both anchors stop the
    // false-positive on "best of the rest" / "best of options".
    pattern: /\b(?:the|this|that|our|my|a) best plan\b|\bbest plan (?:for|to|here|right)\b/i,
    rule: 'No superlatives in Medicare marketing (CMS marketing rule).',
    suggestion: 'Say "a plan that may fit your needs" instead of "the best plan."',
  },
  {
    pattern: /\bguarantee(?:d|s)?\b/i,
    rule: 'Cannot guarantee benefits or outcomes.',
    suggestion: 'Say "this plan includes…" instead of "guaranteed."',
  },
  {
    pattern: /\byou (?:need to|must) (?:have|enroll|sign|do|get)\b|\byou need this\b/i,
    rule: 'Cannot pressure beneficiaries — present options neutrally.',
    suggestion: 'Say "you may want to consider…" instead of "you must."',
  },
  {
    pattern: /\bbetter than (?:original )?medicare\b/i,
    rule: 'Cannot disparage Original Medicare.',
    suggestion: 'Compare specific benefits rather than disparaging Original Medicare.',
  },
  {
    pattern: /\beveryone (?:chooses|picks|wants|buys|takes) this\b|\beverybody chooses this\b/i,
    rule: 'Cannot use bandwagon pressure.',
    suggestion: 'Say "many people in your area consider…" instead.',
  },
  {
    pattern: /\bact now\b|\blimited time (?:offer|only)?\b|\bdon't wait\b|\bhurry\b/i,
    rule: 'Cannot create false urgency outside enrollment windows.',
    suggestion: 'State the enrollment period facts instead.',
  },
  {
    pattern: /\bit's free\b|\bthis is free\b|\bthe plan is free\b|\bcompletely free\b/i,
    rule: 'Cannot misrepresent costs ("free" implies no premium / no cost-share).',
    suggestion: 'Say "this plan has a $0 premium" only if true; otherwise itemize costs.',
  },
  {
    pattern: /\b(?:do you have|are you taking) (?:diabetes|high blood pressure|cancer|copd|heart (?:disease|failure))\b/i,
    rule: 'Cannot ask about health status for non-SNP marketing.',
    suggestion: 'Only ask health questions when relevant to SNP eligibility.',
  },
];

/**
 * Normalize then scan. Returns one ComplianceViolation per matched rule
 * (rules are mutually exclusive in spirit but a single utterance can trip
 * several — return all hits so the agent sees every issue).
 */
export function scanForViolations(agentText: string): ComplianceViolation[] {
  if (!agentText) return [];
  const normalized = normalize(agentText);
  const hits: ComplianceViolation[] = [];
  for (const r of RULES) {
    const m = normalized.match(r.pattern);
    if (m) {
      hits.push({
        phrase: m[0],
        rule: r.rule,
        suggestion: r.suggestion,
      });
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
