/**
 * Frontend mirror of the AI types in `techsales-api/src/ai/types.ts`. Phase 3
 * fills in the recommendation shapes; Phase 4 fills in explain / search /
 * compare / drug-coverage. Phase 5 wires chat.
 */

/** Phase 1 echo agent — used by /api/ai/echo. */
export interface AIEchoResult {
  input: string;
  output: string;
  /** ID of the persisted `aiInteractions` row, when the audit write succeeded. */
  interactionId?: string;
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

/** Phase 4 — Plan Explainer (single-plan RAG, agent or member mode). */
export interface AIExplanation {
  planId: string;
  mode: 'agent' | 'member';
  markdown: string;
  generatedAt: string;
  generatedBy: string;
}

/** Phase 4 — Natural-Language Plan Search filters. */
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

/** Phase 4 — Natural-Language Plan Search result row. */
export interface AISearchResultHit {
  planId: string;
  planName: string;
  carrier?: string;
  premium?: number;
  score: number;
  matchedFields: string[];
}

/** Phase 4 — Natural-Language Plan Search result. */
export interface AISearchResult {
  filters: AISearchFilters;
  rephrasedQuery: string;
  rationale: string;
  results: AISearchResultHit[];
}

/** Phase 4 — Plan Comparison entry (one of the 2-4 plans being compared). */
export interface AIComparisonPlan {
  planId: string;
  planName?: string;
  carrier?: string;
  premium?: number;
  planType?: string;
  benefits: Array<{ category: string; isAvailable?: boolean }>;
}

/** Phase 4 — Plan Comparison narrative + grid metadata. */
export interface AIComparison {
  planIds: string[];
  comparison: { plans: AIComparisonPlan[] };
  narrative: string;
  generatedAt: string;
}

/** Phase 4 — Drug Coverage row, one per (planId, drugId) pair. */
export interface AIDrugCoverageRow {
  planId: string;
  drugId: string;
  isCovered: boolean;
  tier?: number;
  priorAuth?: boolean;
  stepTherapy?: boolean;
  qtyLimit?: number;
}

/** Phase 4 — Drug Coverage Q&A response. */
export interface AIDrugAnswer {
  planIds: string[];
  drugIds: string[];
  coverage: AIDrugCoverageRow[];
  narrative: string;
  isSyntheticData: true;
  generatedAt: string;
}

/** Phase 5 — Member chat conversation turn. */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Phase 5 — SSE stream-event union the chat agent yields. Mirrors
 * `ChatStreamEvent` in `techsales-api/src/ai/agents/chatAgent.ts`.
 *
 *   - `token`      : a single LLM token delta (append to the live bubble).
 *   - `tool_start` : the agent is about to call a tool (show in trace).
 *   - `tool_end`   : tool returned (mark complete; latencyMs included).
 *   - `final`      : the assistant's complete response. Persist + clear buffer.
 *   - `error`      : something went wrong; show a toast.
 */
export type ChatStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: unknown; latencyMs: number }
  | { type: 'final'; content: string; interactionId: string }
  | { type: 'error'; error: string };
