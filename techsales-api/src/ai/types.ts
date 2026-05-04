/**
 * Shared shapes for the AI pipeline. Phase 1 only fully populates a couple of
 * these — the rest are intentional skeletons that later phases (recommend,
 * explain, search, compare, drug-coverage, chat) will flesh out. We declare
 * them up front so FE/BE share a stable type surface from day one.
 */

/** Phase 1 echo agent — used by /api/ai/echo. */
export interface AIEchoResult {
  input: string;
  output: string;
}

/** Phase 3 — Lead-triggered Plan Recommendation. One row in the ranked list. */
export interface AIRecommendationItem {
  planId: string;
  planName: string;
  carrier: string;
  /** 0-100 fit score against the lead profile. */
  matchScore: number;
  monthlyPremium: number;
  estimatedAnnualCost: number;
  /** Percentage of the lead's tagged drugs covered by this plan (0-100). */
  drugCoveragePercent: number;
  /** Short prose explaining why this plan ranked where it did. */
  rationale: string;
  /** Up to 5 short bullet highlights for the recommendation card. */
  keyHighlights: string[];
}

/** Phase 3 — Full payload returned by /api/ai/recommend. */
export interface AIRecommendation {
  recommendations: AIRecommendationItem[];
  /** ISO timestamp the agent finished generating the result. */
  generatedAt: string;
}

/**
 * Phase 4 — Plan Explainer (single-plan RAG, agent or member mode).
 *
 * The body is a single markdown blob — `agent` mode produces a structured,
 * technical breakdown (Overview, Key Benefits, Premium & Cost Sharing,
 * Network, Star Rating, Trade-offs); `member` mode produces a short, plain-
 * English explainer aimed at a 6th-grade reading level.
 */
export interface AIExplanation {
  planId: string;
  mode: 'agent' | 'member';
  markdown: string;
  generatedAt: string;
  /** Model id that produced the explanation (e.g. "claude-opus-4-7"). */
  generatedBy: string;
}

/** Phase 4 — Natural-Language Plan Search filters parsed from a free-text query. */
export interface AISearchFilters {
  state?: string;
  planType?: 'HMO' | 'PPO' | 'POS' | 'RPPO' | 'PDP' | 'DSNP' | 'CSNP' | 'ISNP' | 'Medigap';
  maxPremium?: number;
  minStarRating?: number;
  carrier?: string;
  hasDental?: boolean;
  hasVision?: boolean;
  hasHearing?: boolean;
}

/** Phase 4 — Natural-Language Plan Search result. */
export interface AISearchResultHit {
  planId: string;
  planName: string;
  carrier?: string;
  premium?: number;
  score: number;
  /** Fields that contributed to the match (vector vs bm25 vs both). */
  matchedFields: string[];
}

export interface AISearchResult {
  filters: AISearchFilters;
  /** Canonicalised user query, fed to the embedder for the semantic side. */
  rephrasedQuery: string;
  /** One-sentence justification for the chosen filters. */
  rationale: string;
  results: AISearchResultHit[];
}

/** Phase 4 — Plan Comparison. Side-by-side data + AI narrative diff. */
export interface AIComparisonPlan {
  planId: string;
  planName?: string;
  carrier?: string;
  premium?: number;
  planType?: string;
  benefits: Array<{ category: string; isAvailable?: boolean }>;
}

export interface AIComparison {
  planIds: string[];
  comparison: { plans: AIComparisonPlan[] };
  narrative: string;
  generatedAt: string;
}

/** Phase 4 — Drug Coverage Q&A. */
export interface AIDrugCoverageRow {
  planId: string;
  drugId: string;
  isCovered: boolean;
  tier?: number;
  priorAuth?: boolean;
  stepTherapy?: boolean;
  qtyLimit?: number;
}

export interface AIDrugAnswer {
  planIds: string[];
  drugIds: string[];
  coverage: AIDrugCoverageRow[];
  narrative: string;
  /** Always true — the formulary feed is synthetic pilot data. */
  isSyntheticData: true;
  generatedAt: string;
}

/** Phase 5 — Member chat conversation turn. */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
