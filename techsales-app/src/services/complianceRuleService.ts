/**
 * Admin-editable compliance rules — FE client for /api/compliance-rules.
 * All endpoints are admin-gated (userId param, POC posture).
 */
import { API_BASE } from '../api/apiBase';

export type ComplianceSeverity = 'info' | 'warn' | 'critical';

export interface ComplianceRule {
  ruleId: string;
  name: string;
  ruleText: string;
  suggestion: string;
  phrases: string[];
  regex?: string;
  severity: ComplianceSeverity;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type ComplianceRuleInput = Omit<ComplianceRule, 'ruleId' | 'createdAt' | 'updatedAt'>;

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function listRules(userId: string): Promise<ComplianceRule[]> {
  const res = await fetch(`${API_BASE}/compliance-rules?userId=${encodeURIComponent(userId)}`);
  const body = (await res.json()) as ApiEnvelope<{ rules: ComplianceRule[] }>;
  if (!body.success) throw new Error(body.error ?? `List failed (${res.status})`);
  return body.data?.rules ?? [];
}

export interface RuleMutationResult {
  /** Null on failure — see `error`. */
  rule: ComplianceRule | null;
  error?: string;
}

export async function createRule(
  userId: string,
  input: ComplianceRuleInput,
): Promise<RuleMutationResult> {
  const res = await fetch(`${API_BASE}/compliance-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, userId }),
  });
  const body = (await res.json()) as ApiEnvelope<ComplianceRule>;
  if (!body.success || !body.data) {
    return { rule: null, error: body.error ?? `Create failed (${res.status})` };
  }
  return { rule: body.data };
}

export async function updateRule(
  userId: string,
  ruleId: string,
  updates: Partial<ComplianceRuleInput>,
): Promise<RuleMutationResult> {
  const res = await fetch(`${API_BASE}/compliance-rules/${encodeURIComponent(ruleId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...updates, userId }),
  });
  const body = (await res.json()) as ApiEnvelope<ComplianceRule>;
  if (!body.success || !body.data) {
    return { rule: null, error: body.error ?? `Update failed (${res.status})` };
  }
  return { rule: body.data };
}

export async function deleteRule(
  userId: string,
  ruleId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `${API_BASE}/compliance-rules/${encodeURIComponent(ruleId)}?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  const body = (await res.json()) as ApiEnvelope<{ deleted: boolean }>;
  if (!body.success) return { ok: false, error: body.error ?? `Delete failed (${res.status})` };
  return { ok: true };
}
