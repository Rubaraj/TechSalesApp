/**
 * Gap 9 — admin-editable QA rubric CRUD. Admin-gated (POC posture:
 * userId query/body param + accessLevel check, same as the compliance
 * and coaching rule controllers). The rubric model is schemaless, so all
 * validation lives here. Every mutation invalidates the reviewer's
 * rubric cache so edits apply to the next QA review.
 *
 * Dimension `key` is derived once at create (slug of the label) and is
 * IMMUTABLE — regenerating it on label edits would orphan the
 * dimensionLabels snapshots stored on existing reviews.
 */
import type { Request, Response } from 'express';
import { repos } from '../repositories/registry.js';
import {
  invalidateQaRubricCache,
  loadQaRubric,
  slugifyDimensionKey,
} from '../ai/qa/qaRubric.js';
import type { QaRubricItem, QaRubricItemKind } from '../types/index.js';

async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const user = await repos.user.findById(userId);
  if (!user) return false;
  return user.accessLevel === 'admin' || user.isSuperAdmin === true;
}

function callerUserId(req: Request): string {
  return String(
    (req.query.userId as string | undefined) ??
      (req.body as { userId?: string } | undefined)?.userId ??
      '',
  );
}

const KINDS: QaRubricItemKind[] = ['dimension', 'disclosure'];

interface ItemBody {
  kind?: string;
  label?: string;
  description?: string;
  weight?: unknown;
  sortOrder?: unknown;
  isActive?: boolean;
}

function cleanItemBody(
  body: ItemBody,
  requireCore: boolean,
  existingKind?: QaRubricItemKind,
): { error: string } | { value: Partial<QaRubricItem> } {
  const value: Partial<QaRubricItem> = {};
  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind as QaRubricItemKind)) {
      return { error: '`kind` must be dimension | disclosure' };
    }
    if (existingKind && body.kind !== existingKind) {
      return { error: '`kind` cannot be changed after creation' };
    }
    value.kind = body.kind as QaRubricItemKind;
  }
  if (body.label !== undefined) value.label = String(body.label).trim();
  if (body.description !== undefined) value.description = String(body.description).trim();
  if (body.isActive !== undefined) value.isActive = body.isActive === true;

  const kind = value.kind ?? existingKind;
  if (body.weight !== undefined) {
    if (kind !== 'dimension') return { error: '`weight` only applies to dimensions' };
    const w = Number(body.weight);
    if (!Number.isInteger(w) || w < 1 || w > 5) {
      return { error: '`weight` must be an integer between 1 and 5' };
    }
    value.weight = w;
  }
  if (body.sortOrder !== undefined) {
    const s = Number(body.sortOrder);
    if (!Number.isInteger(s) || s < 0 || s > 999) {
      return { error: '`sortOrder` must be an integer between 0 and 999' };
    }
    value.sortOrder = s;
  }

  if (requireCore) {
    if (!value.kind) return { error: '`kind` is required' };
    if (!value.label) return { error: '`label` is required' };
  }
  return { value };
}

export async function listQaRubricItems(req: Request, res: Response): Promise<void> {
  if (!(await isAdmin(callerUserId(req)))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  // Warm/seed: first-ever list on an empty collection seeds the defaults
  // (same path the reviewer uses).
  await loadQaRubric();
  const items = await repos.qaRubricItem.findAll(false);
  items.sort((a, b) => a.sortOrder - b.sortOrder);
  res.json({ success: true, data: { total: items.length, items } });
}

export async function createQaRubricItem(req: Request, res: Response): Promise<void> {
  if (!(await isAdmin(callerUserId(req)))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  const cleaned = cleanItemBody((req.body ?? {}) as ItemBody, true);
  if ('error' in cleaned) {
    res.status(400).json({ success: false, error: cleaned.error });
    return;
  }
  const v = cleaned.value;
  let key: string | undefined;
  if (v.kind === 'dimension') {
    const existing = await repos.qaRubricItem.findAll(false);
    const existingKeys = existing
      .filter((i) => i.kind === 'dimension' && i.key)
      .map((i) => i.key as string);
    key = slugifyDimensionKey(v.label!, existingKeys);
  }
  const item = await repos.qaRubricItem.create({
    kind: v.kind!,
    ...(key ? { key } : {}),
    label: v.label!,
    ...(v.description ? { description: v.description } : {}),
    ...(v.kind === 'dimension' ? { weight: v.weight ?? 3 } : {}),
    sortOrder: v.sortOrder ?? 0,
    isActive: v.isActive ?? true,
  });
  invalidateQaRubricCache();
  res.status(201).json({ success: true, data: item });
}

export async function updateQaRubricItem(req: Request, res: Response): Promise<void> {
  if (!(await isAdmin(callerUserId(req)))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  const existing = await repos.qaRubricItem.findById(String(req.params.id));
  if (!existing) {
    res.status(404).json({ success: false, error: 'Rubric item not found' });
    return;
  }
  const cleaned = cleanItemBody((req.body ?? {}) as ItemBody, false, existing.kind);
  if ('error' in cleaned) {
    res.status(400).json({ success: false, error: cleaned.error });
    return;
  }
  // `key` is never updatable — not even present in the cleaned value.
  const updated = await repos.qaRubricItem.update(existing.itemId, cleaned.value);
  if (!updated) {
    res.status(404).json({ success: false, error: 'Rubric item not found' });
    return;
  }
  invalidateQaRubricCache();
  res.json({ success: true, data: updated });
}

export async function deleteQaRubricItem(req: Request, res: Response): Promise<void> {
  if (!(await isAdmin(callerUserId(req)))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  const deleted = await repos.qaRubricItem.delete(String(req.params.id));
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Rubric item not found' });
    return;
  }
  invalidateQaRubricCache();
  res.json({ success: true, data: { deleted: true } });
}
