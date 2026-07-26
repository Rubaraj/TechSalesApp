/**
 * Gap 6 — admin-editable coaching rules — FE client for /api/coaching-rules.
 * All endpoints are admin-gated (userId param, POC posture).
 */
import { API_BASE } from '../api/apiBase';

export type CoachingRuleType = 'talk_ratio' | 'monologue' | 'missed_discovery';
export type DiscoveryItem = 'zip' | 'medications';

export interface CoachingRuleParams {
  thresholdPct?: number;
  minCallSec?: number;
  maxConsecutiveAgentUtterances?: number;
  item?: DiscoveryItem;
  checkAfterSec?: number;
}

export interface CoachingRule {
  ruleId: string;
  name: string;
  type: CoachingRuleType;
  tip: string;
  params: CoachingRuleParams;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type CoachingRuleInput = Omit<CoachingRule, 'ruleId' | 'createdAt' | 'updatedAt'>;

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function listCoachingRules(userId: string): Promise<CoachingRule[]> {
  const res = await fetch(`${API_BASE}/coaching-rules?userId=${encodeURIComponent(userId)}`);
  const body = (await res.json()) as ApiEnvelope<{ rules: CoachingRule[] }>;
  if (!body.success) throw new Error(body.error ?? `List failed (${res.status})`);
  return body.data?.rules ?? [];
}

export interface CoachingRuleMutationResult {
  /** Null on failure — see `error`. */
  rule: CoachingRule | null;
  error?: string;
}

export async function createCoachingRule(
  userId: string,
  input: CoachingRuleInput,
): Promise<CoachingRuleMutationResult> {
  const res = await fetch(`${API_BASE}/coaching-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, userId }),
  });
  const body = (await res.json()) as ApiEnvelope<CoachingRule>;
  if (!body.success || !body.data) {
    return { rule: null, error: body.error ?? `Create failed (${res.status})` };
  }
  return { rule: body.data };
}

export async function updateCoachingRule(
  userId: string,
  ruleId: string,
  updates: Partial<CoachingRuleInput>,
): Promise<CoachingRuleMutationResult> {
  const res = await fetch(`${API_BASE}/coaching-rules/${encodeURIComponent(ruleId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...updates, userId }),
  });
  const body = (await res.json()) as ApiEnvelope<CoachingRule>;
  if (!body.success || !body.data) {
    return { rule: null, error: body.error ?? `Update failed (${res.status})` };
  }
  return { rule: body.data };
}

export async function deleteCoachingRule(
  userId: string,
  ruleId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `${API_BASE}/coaching-rules/${encodeURIComponent(ruleId)}?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  const body = (await res.json()) as ApiEnvelope<{ deleted: boolean }>;
  if (!body.success) return { ok: false, error: body.error ?? `Delete failed (${res.status})` };
  return { ok: true };
}
