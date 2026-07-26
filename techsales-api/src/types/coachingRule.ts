/**
 * Gap 6 — admin-editable proactive coaching rule. Unlike compliance rules
 * (phrase/regex matchers), these are typed behavioral checks the live
 * proactiveCoach engine evaluates on every final transcript chunk:
 *
 *   talk_ratio        — agent talk share ≥ thresholdPct after minCallSec
 *   monologue         — ≥ maxConsecutiveAgentUtterances without the prospect
 *   missed_discovery  — a discovery item (zip / medications) still missing
 *                       after checkAfterSec
 *
 * Supervisors manage these from Admin › Coaching Rules; the engine loads
 * active rules with the same short-TTL cache pattern as the compliance
 * scanner.
 */
export type CoachingRuleType = 'talk_ratio' | 'monologue' | 'missed_discovery';

export type DiscoveryItem = 'zip' | 'medications';

/** Flat optional param bag — which keys matter depends on `type`. */
export interface CoachingRuleParams {
  /** talk_ratio — fire when agent share of talk chars ≥ this percent. */
  thresholdPct?: number;
  /** talk_ratio — don't evaluate before this many seconds into the call. */
  minCallSec?: number;
  /** monologue — consecutive agent utterances without a prospect line. */
  maxConsecutiveAgentUtterances?: number;
  /** missed_discovery — which discovery item to check. */
  item?: DiscoveryItem;
  /** missed_discovery — fire if still missing after this many seconds. */
  checkAfterSec?: number;
}

export interface CoachingRule {
  ruleId: string;
  /** Short label shown in the editor. */
  name: string;
  type: CoachingRuleType;
  /** The tip shown to the agent when the rule fires. */
  tip: string;
  params: CoachingRuleParams;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}
