/**
 * Admin-editable compliance rule for the live-call scanner. Replaces the
 * hardcoded RULES array in ai/tools/complianceCheck.tool.ts — supervisors
 * manage these from Admin › Compliance Rules; the scanner loads active
 * rules with a short TTL cache.
 */
export type ComplianceSeverity = 'info' | 'warn' | 'critical';

export interface ComplianceRule {
  ruleId: string;
  /** Short label shown in the editor + supervision surfaces. */
  name: string;
  /** Plain-English rule citation shown to the agent when it fires. */
  ruleText: string;
  /** Suggested rephrase — also the instant coaching tip. */
  suggestion: string;
  /** Phrases matched whole-word, case-insensitive (supervisor-friendly). */
  phrases: string[];
  /** Optional advanced regex (validated at save; case-insensitive). */
  regex?: string;
  severity: ComplianceSeverity;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}
