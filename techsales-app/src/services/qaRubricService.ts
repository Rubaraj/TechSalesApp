/**
 * Gap 9 — admin-editable QA rubric — FE client for /api/qa-rubric.
 * All endpoints are admin-gated (userId param, POC posture).
 */
import { API_BASE } from '../api/apiBase';

export type QaRubricItemKind = 'dimension' | 'disclosure';

export interface QaRubricItem {
  itemId: string;
  kind: QaRubricItemKind;
  /** dimension only — immutable structured-output key. */
  key?: string;
  label: string;
  description?: string;
  weight?: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface QaRubricItemInput {
  kind: QaRubricItemKind;
  label: string;
  description?: string;
  weight?: number;
  sortOrder?: number;
  isActive?: boolean;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function listQaRubricItems(userId: string): Promise<QaRubricItem[]> {
  const res = await fetch(`${API_BASE}/qa-rubric?userId=${encodeURIComponent(userId)}`);
  const body = (await res.json()) as ApiEnvelope<{ items: QaRubricItem[] }>;
  if (!body.success) throw new Error(body.error ?? `List failed (${res.status})`);
  return body.data?.items ?? [];
}

export interface QaRubricMutationResult {
  /** Null on failure — see `error`. */
  item: QaRubricItem | null;
  error?: string;
}

export async function createQaRubricItem(
  userId: string,
  input: QaRubricItemInput,
): Promise<QaRubricMutationResult> {
  const res = await fetch(`${API_BASE}/qa-rubric`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, userId }),
  });
  const body = (await res.json()) as ApiEnvelope<QaRubricItem>;
  if (!body.success || !body.data) {
    return { item: null, error: body.error ?? `Create failed (${res.status})` };
  }
  return { item: body.data };
}

export async function updateQaRubricItem(
  userId: string,
  itemId: string,
  updates: Partial<Omit<QaRubricItemInput, 'kind'>>,
): Promise<QaRubricMutationResult> {
  const res = await fetch(`${API_BASE}/qa-rubric/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...updates, userId }),
  });
  const body = (await res.json()) as ApiEnvelope<QaRubricItem>;
  if (!body.success || !body.data) {
    return { item: null, error: body.error ?? `Update failed (${res.status})` };
  }
  return { item: body.data };
}

export async function deleteQaRubricItem(
  userId: string,
  itemId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `${API_BASE}/qa-rubric/${encodeURIComponent(itemId)}?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  const body = (await res.json()) as ApiEnvelope<{ deleted: boolean }>;
  if (!body.success) return { ok: false, error: body.error ?? `Delete failed (${res.status})` };
  return { ok: true };
}
