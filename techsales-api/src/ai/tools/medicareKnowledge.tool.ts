/**
 * Phase 3a — Static Medicare-term glossary.
 *
 * Plain function (not LangChain `tool()` — Phase 3c wraps it). Called by
 * `callAnalysisAgent` whenever a prospect transcript chunk mentions a known
 * Medicare term. Returns the matching glossary entry or null. When the
 * caller knows the prospect's zipCode AND the term is a plan type, the
 * returned `links` array includes a "View CSNP plans in 33101" link.
 *
 * Source: SALES_IQ_COPILOT.md §6.
 *
 * Term matching:
 *   - Case-insensitive word-boundary regex (avoids "CSNP" matching inside
 *     "shoppo"; avoids "ma" matching inside "match").
 *   - First match wins. If the prospect's chunk mentions multiple terms we
 *     return the first; the dedup logic upstream (per-call shown-topics
 *     Set in callAnalysisAgent) prevents re-firing.
 *   - Bare-mention OR explicit "what is X" both qualify. Both phrasings are
 *     legitimate signals the prospect would benefit from context.
 */

export interface MedicareKnowledgeLink {
  label: string;
  url: string;
}

export interface MedicareKnowledgeEntry {
  /** Stable key used by the per-call dedup set in the agent (e.g. 'CSNP'). */
  topic: string;
  /** Card title shown to the agent. */
  title: string;
  /** 2-3 sentence plain-English explanation. */
  content: string;
  /** Optional links list — populated when the term is a plan type and the
   *  caller supplied a zipCode. */
  links?: MedicareKnowledgeLink[];
}

interface GlossaryRow {
  topic: string;
  /** Regex source pattern (will be wrapped with `\b...\b` and `/i`). */
  match: string;
  title: string;
  content: string;
  /** When set, a `planSearchUrl?type=<planTypeFilter>&zip=<zip>` link is
   *  attached if the caller supplied a zipCode. */
  planTypeFilter?: string;
}

// Source: SALES_IQ_COPILOT.md §6.
const GLOSSARY: GlossaryRow[] = [
  {
    topic: 'CSNP',
    match: 'csnp',
    title: 'CSNP — Chronic Condition Special Needs Plan',
    content:
      'A Medicare Advantage plan for people with specific chronic conditions ' +
      '(e.g. diabetes, heart failure). Coverage and provider networks are ' +
      'tailored to the condition. Eligibility requires documented diagnosis.',
    planTypeFilter: 'CSNP',
  },
  {
    topic: 'DSNP',
    match: 'dsnp',
    title: 'DSNP — Dual Eligible Special Needs Plan',
    content:
      'A Medicare Advantage plan for people enrolled in BOTH Medicare and ' +
      'Medicaid. Often $0 premium, broad coverage, and integrated benefits ' +
      'across both programs.',
    planTypeFilter: 'DSNP',
  },
  {
    topic: 'ISNP',
    match: 'isnp',
    title: 'ISNP — Institutional Special Needs Plan',
    content:
      'A Medicare Advantage plan for people living in or expected to live in ' +
      'an institutional setting (nursing home, long-term care facility) for ' +
      '90 days or longer.',
    planTypeFilter: 'ISNP',
  },
  {
    topic: 'MAPD',
    match: 'mapd|medicare advantage prescription drug',
    title: 'MAPD — Medicare Advantage Prescription Drug',
    content:
      'A Medicare Advantage plan that also includes prescription drug ' +
      'coverage (Part D). Replaces Original Medicare for the member while ' +
      'enrolled.',
    planTypeFilter: 'MAPD',
  },
  {
    topic: 'PDP',
    match: 'pdp',
    title: 'PDP — Prescription Drug Plan (Part D)',
    content:
      'A standalone prescription drug plan that adds Part D coverage to ' +
      'Original Medicare. Used by people who keep Original Medicare instead ' +
      'of joining a Medicare Advantage plan.',
    planTypeFilter: 'PDP',
  },
  {
    topic: 'Medigap',
    match: 'medigap|medicare supplement',
    title: 'Medigap — Medicare Supplement Insurance',
    content:
      'Private insurance that fills cost-sharing gaps in Original Medicare ' +
      '(coinsurance, copays, deductibles). Sold in standardized plan letters ' +
      '(A, B, C, D, F, G, K, L, M, N).',
    planTypeFilter: 'Medigap',
  },
  {
    topic: 'HMO',
    match: 'hmo',
    title: 'HMO — Health Maintenance Organization',
    content:
      'A plan type that requires using providers in the plan network (except ' +
      'emergencies). Usually lower premiums and copays than PPO, with ' +
      'referral requirements for specialists.',
    planTypeFilter: 'HMO',
  },
  {
    topic: 'PPO',
    match: 'ppo',
    title: 'PPO — Preferred Provider Organization',
    content:
      'A plan type that lets the member see out-of-network providers, usually ' +
      'at higher cost-share. No referrals needed for specialists. Higher ' +
      'flexibility than HMO.',
    planTypeFilter: 'PPO',
  },
  {
    topic: 'AEP',
    match: 'aep|annual enrollment period',
    title: 'AEP — Annual Enrollment Period',
    content:
      'October 15 through December 7 each year. The main window when ' +
      'Medicare members can join, switch, or drop Medicare Advantage and ' +
      'Part D plans. Coverage starts January 1.',
  },
  {
    topic: 'OEP',
    match: 'oep|open enrollment period',
    title: 'OEP — Medicare Advantage Open Enrollment Period',
    content:
      'January 1 through March 31. People already in a Medicare Advantage ' +
      'plan can switch to a different MA plan or back to Original Medicare ' +
      '(with optional Part D).',
  },
  {
    topic: 'SEP',
    match: 'sep|special enrollment period',
    title: 'SEP — Special Enrollment Period',
    content:
      'A window outside AEP/OEP triggered by a qualifying life event (move, ' +
      'loss of other coverage, Medicaid status change, etc.) that lets the ' +
      'member change plans.',
  },
  {
    topic: 'LIS',
    match: 'lis|extra help|low income subsidy',
    title: 'LIS — Low Income Subsidy ("Extra Help")',
    content:
      'A federal program that helps Medicare beneficiaries with limited ' +
      'income and resources pay Part D premiums, deductibles, and copays. ' +
      'Automatic for full-benefit dual-eligibles; others can apply.',
  },
  {
    topic: 'IRMAA',
    match: 'irmaa',
    title: 'IRMAA — Income-Related Monthly Adjustment Amount',
    content:
      'An extra Part B and Part D premium that higher-income Medicare ' +
      'beneficiaries pay on top of the standard premium. Based on tax return ' +
      'from two years prior. Income brackets are updated annually.',
  },
  {
    topic: 'Part A',
    match: 'part a',
    title: 'Medicare Part A — Hospital Insurance',
    content:
      'Covers inpatient hospital stays, skilled nursing facility care, ' +
      'hospice, and some home health. Most people qualify premium-free if ' +
      'they or a spouse paid Medicare taxes for 40+ quarters.',
  },
  {
    topic: 'Part B',
    match: 'part b',
    title: 'Medicare Part B — Medical Insurance',
    content:
      'Covers outpatient care, doctor visits, preventive services, durable ' +
      'medical equipment, and some home health. Carries a monthly premium ' +
      '(higher for IRMAA brackets).',
  },
  {
    topic: 'Part D',
    match: 'part d',
    title: 'Medicare Part D — Prescription Drug Coverage',
    content:
      'Outpatient prescription drug coverage. Available as a standalone PDP ' +
      'on top of Original Medicare, or built into MAPD Medicare Advantage ' +
      'plans. Each plan has its own formulary and cost-sharing.',
  },
  {
    topic: 'MBI',
    match: 'mbi|medicare beneficiary identifier',
    title: 'MBI — Medicare Beneficiary Identifier',
    content:
      "The 11-character ID on a beneficiary's red, white, and blue Medicare " +
      'card. Format: e.g., "1AB2-CD3-EF45". Used in place of SSN for ' +
      'Medicare claims and enrollments since 2018.',
  },
  {
    topic: 'SOA',
    match: 'soa|scope of appointment',
    title: 'SOA — Scope of Appointment',
    content:
      'A signed agreement (paper or electronic) that documents which Medicare ' +
      'products the agent and beneficiary will discuss during a sales meeting. ' +
      'Required by CMS before any product-specific conversation.',
  },
  {
    topic: 'Star Rating',
    match: 'star rating|star ratings',
    title: 'Star Rating — CMS Quality Ratings (1–5 stars)',
    content:
      'CMS rates Medicare Advantage and Part D plans annually on quality and ' +
      'performance — 1 star (poor) to 5 stars (excellent). 5-star plans get ' +
      'a Special Enrollment Period any month of the year.',
  },
];

// Pre-compile regexes once at module load.
const COMPILED = GLOSSARY.map((row) => ({
  ...row,
  regex: new RegExp(`\\b(?:${row.match})\\b`, 'i'),
}));

interface LookupOptions {
  /** When set and the matched term is a plan type, a plan-search link is
   *  attached pointing at the filtered /plans page. */
  zipCode?: string;
}

/**
 * Scan `text` for the first matching glossary term. Returns the entry or
 * null. Match semantics: case-insensitive word-boundary; first hit wins.
 */
export function lookupMedicareTerm(
  text: string,
  opts: LookupOptions = {},
): MedicareKnowledgeEntry | null {
  if (!text) return null;
  const normalized = normalize(text);
  for (const row of COMPILED) {
    if (row.regex.test(normalized)) {
      const entry: MedicareKnowledgeEntry = {
        topic: row.topic,
        title: row.title,
        content: row.content,
      };
      if (opts.zipCode && row.planTypeFilter) {
        entry.links = [
          {
            label: `View ${row.planTypeFilter} plans in ${opts.zipCode}`,
            url: `/plans?type=${encodeURIComponent(row.planTypeFilter)}&zip=${encodeURIComponent(opts.zipCode)}`,
          },
        ];
      }
      return entry;
    }
  }
  return null;
}

/** Lowercase + collapse whitespace + strip trailing punctuation. Deepgram
 *  returns punctuated mixed-case; without this `\bAEP\b` misses "AEP." */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
