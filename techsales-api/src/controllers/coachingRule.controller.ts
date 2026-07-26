/**
 * Gap 6 — admin-editable coaching rules CRUD for the proactive coaching
 * engine. Admin-gated (POC posture: userId query/body param + accessLevel
 * check, same as complianceRule.controller). Every mutation invalidates the
 * engine's rule cache so edits apply to the next call.
 */
import type { Request, Response } from 'express';
import { repos } from '../repositories/registry.js';
import {
  invalidateCoachingRulesCache,
  loadCoachingRules,
} from '../ai/live/proactiveCoach.js';
import type {
  CoachingRule,
  CoachingRuleType,
  CoachingRuleParams,
  DiscoveryItem,
} from '../types/index.js';

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

const RULE_TYPES: CoachingRuleType[] = ['talk_ratio', 'monologue', 'missed_discovery'];
const DISCOVERY_ITEMS: DiscoveryItem[] = ['zip', 'medications'];

interface RuleBody {
  name?: string;
  type?: string;
  tip?: string;
  params?: unknown;
  isActive?: boolean;
}

/** Parse a params bag against the rule type. Unknown keys are dropped. */
function cleanParams(
  type: CoachingRuleType,
  raw: unknown,
): { error: string } | { value: CoachingRuleParams } {
  const p = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };
  const value: CoachingRuleParams = {};
  switch (type) {
    case 'talk_ratio': {
      const pct = num(p.thresholdPct);
      const minSec = num(p.minCallSec);
      if (pct !== undefined) {
        if (Number.isNaN(pct) || pct < 50 || pct > 100) {
          return { error: '`thresholdPct` must be a number between 50 and 100' };
        }
        value.thresholdPct = pct;
      }
      if (minSec !== undefined) {
        if (Number.isNaN(minSec) || minSec < 10 || minSec > 3600) {
          return { error: '`minCallSec` must be a number between 10 and 3600' };
        }
        value.minCallSec = minSec;
      }
      break;
    }
    case 'monologue': {
      const max = num(p.maxConsecutiveAgentUtterances);
      if (max !== undefined) {
        if (Number.isNaN(max) || max < 2 || max > 50) {
          return { error: '`maxConsecutiveAgentUtterances` must be a number between 2 and 50' };
        }
        value.maxConsecutiveAgentUtterances = max;
      }
      break;
    }
    case 'missed_discovery': {
      const item = p.item === undefined ? undefined : String(p.item);
      if (item !== undefined) {
        if (!DISCOVERY_ITEMS.includes(item as DiscoveryItem)) {
          return { error: '`item` must be zip | medications' };
        }
        value.item = item as DiscoveryItem;
      }
      const after = num(p.checkAfterSec);
      if (after !== undefined) {
        if (Number.isNaN(after) || after < 30 || after > 3600) {
          return { error: '`checkAfterSec` must be a number between 30 and 3600' };
        }
        value.checkAfterSec = after;
      }
      break;
    }
  }
  return { value };
}

/** Validate + normalize a create/update payload. `existingType` lets PATCH
 *  validate params against the rule's current type when `type` is omitted. */
function cleanRuleBody(
  body: RuleBody,
  requireCore: boolean,
  existingType?: CoachingRuleType,
): { error: string } | { value: Partial<CoachingRule> } {
  const value: Partial<CoachingRule> = {};
  if (body.name !== undefined) value.name = String(body.name).trim();
  if (body.tip !== undefined) value.tip = String(body.tip).trim();
  if (body.type !== undefined) {
    if (!RULE_TYPES.includes(body.type as CoachingRuleType)) {
      return { error: '`type` must be talk_ratio | monologue | missed_discovery' };
    }
    value.type = body.type as CoachingRuleType;
  }
  if (body.isActive !== undefined) value.isActive = body.isActive === true;

  const effectiveType = value.type ?? existingType;
  if (body.params !== undefined) {
    if (!effectiveType) return { error: '`type` is required to validate `params`' };
    const cleaned = cleanParams(effectiveType, body.params);
    if ('error' in cleaned) return cleaned;
    value.params = cleaned.value;
  }

  if (requireCore) {
    if (!value.name) return { error: '`name` is required' };
    if (!value.type) return { error: '`type` is required' };
    if (!value.tip) return { error: '`tip` is required' };
    if (!value.params) value.params = {};
  }
  return { value };
}

export async function listCoachingRules(req: Request, res: Response): Promise<void> {
  if (!(await isAdmin(callerUserId(req)))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  // Warm/seed: first-ever list on an empty collection seeds the defaults
  // (same path the engine uses at call start).
  await loadCoachingRules();
  const rules = await repos.coachingRule.findAll(false);
  res.json({ success: true, data: { total: rules.length, rules } });
}

export async function createCoachingRule(req: Request, res: Response): Promise<void> {
  if (!(await isAdmin(callerUserId(req)))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  const cleaned = cleanRuleBody((req.body ?? {}) as RuleBody, true);
  if ('error' in cleaned) {
    res.status(400).json({ success: false, error: cleaned.error });
    return;
  }
  const rule = await repos.coachingRule.create({
    name: cleaned.value.name!,
    type: cleaned.value.type!,
    tip: cleaned.value.tip!,
    params: cleaned.value.params ?? {},
    isActive: cleaned.value.isActive ?? true,
  });
  invalidateCoachingRulesCache();
  res.status(201).json({ success: true, data: rule });
}

export async function updateCoachingRule(req: Request, res: Response): Promise<void> {
  if (!(await isAdmin(callerUserId(req)))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  const existing = await repos.coachingRule.findById(String(req.params.id));
  if (!existing) {
    res.status(404).json({ success: false, error: 'Rule not found' });
    return;
  }
  const cleaned = cleanRuleBody((req.body ?? {}) as RuleBody, false, existing.type);
  if ('error' in cleaned) {
    res.status(400).json({ success: false, error: cleaned.error });
    return;
  }
  const updated = await repos.coachingRule.update(existing.ruleId, cleaned.value);
  if (!updated) {
    res.status(404).json({ success: false, error: 'Rule not found' });
    return;
  }
  invalidateCoachingRulesCache();
  res.json({ success: true, data: updated });
}

export async function deleteCoachingRule(req: Request, res: Response): Promise<void> {
  if (!(await isAdmin(callerUserId(req)))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  const deleted = await repos.coachingRule.delete(String(req.params.id));
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Rule not found' });
    return;
  }
  invalidateCoachingRulesCache();
  res.json({ success: true, data: { deleted: true } });
}
