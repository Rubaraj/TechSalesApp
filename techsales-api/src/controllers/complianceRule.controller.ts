/**
 * Admin-editable compliance rules — CRUD for the live-call scanner's rule
 * set. Admin-gated (POC posture: userId query/body param + accessLevel
 * check, same as callQa.controller). Every mutation invalidates the
 * scanner's compiled-rule cache so edits apply to the next call.
 */
import type { Request, Response } from 'express';
import { repos } from '../repositories/registry.js';
import { invalidateRulesCache } from '../ai/tools/complianceCheck.tool.js';
import type { ComplianceRule, ComplianceSeverity } from '../types/index.js';

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

const SEVERITIES: ComplianceSeverity[] = ['info', 'warn', 'critical'];

interface RuleBody {
  name?: string;
  ruleText?: string;
  suggestion?: string;
  phrases?: unknown;
  regex?: string;
  severity?: string;
  isActive?: boolean;
}

/** Validate + normalize a create/update payload. Returns an error string or
 *  the cleaned partial. */
function cleanRuleBody(
  body: RuleBody,
  requireCore: boolean,
): { error: string } | { value: Partial<ComplianceRule> } {
  const value: Partial<ComplianceRule> = {};
  if (body.name !== undefined) value.name = String(body.name).trim();
  if (body.ruleText !== undefined) value.ruleText = String(body.ruleText).trim();
  if (body.suggestion !== undefined) value.suggestion = String(body.suggestion).trim();
  if (body.phrases !== undefined) {
    if (!Array.isArray(body.phrases)) return { error: '`phrases` must be an array of strings' };
    value.phrases = body.phrases.map((p) => String(p).trim()).filter(Boolean);
  }
  if (body.regex !== undefined) {
    const rx = String(body.regex).trim();
    if (rx) {
      try {
        new RegExp(rx, 'i');
      } catch {
        return { error: 'Invalid regular expression in `regex`' };
      }
      value.regex = rx;
    } else {
      value.regex = undefined;
    }
  }
  if (body.severity !== undefined) {
    if (!SEVERITIES.includes(body.severity as ComplianceSeverity)) {
      return { error: '`severity` must be info | warn | critical' };
    }
    value.severity = body.severity as ComplianceSeverity;
  }
  if (body.isActive !== undefined) value.isActive = body.isActive === true;

  if (requireCore) {
    if (!value.name) return { error: '`name` is required' };
    if (!value.ruleText) return { error: '`ruleText` is required' };
    if (!value.suggestion) return { error: '`suggestion` is required' };
    if ((value.phrases?.length ?? 0) === 0 && !value.regex) {
      return { error: 'Provide at least one phrase or a regex' };
    }
  }
  return { value };
}

export async function listComplianceRules(req: Request, res: Response): Promise<void> {
  if (!(await isAdmin(callerUserId(req)))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  const rules = await repos.complianceRule.findAll(false);
  res.json({ success: true, data: { total: rules.length, rules } });
}

export async function createComplianceRule(req: Request, res: Response): Promise<void> {
  if (!(await isAdmin(callerUserId(req)))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  const cleaned = cleanRuleBody((req.body ?? {}) as RuleBody, true);
  if ('error' in cleaned) {
    res.status(400).json({ success: false, error: cleaned.error });
    return;
  }
  const rule = await repos.complianceRule.create({
    name: cleaned.value.name!,
    ruleText: cleaned.value.ruleText!,
    suggestion: cleaned.value.suggestion!,
    phrases: cleaned.value.phrases ?? [],
    ...(cleaned.value.regex ? { regex: cleaned.value.regex } : {}),
    severity: cleaned.value.severity ?? 'warn',
    isActive: cleaned.value.isActive ?? true,
  });
  invalidateRulesCache();
  res.status(201).json({ success: true, data: rule });
}

export async function updateComplianceRule(req: Request, res: Response): Promise<void> {
  if (!(await isAdmin(callerUserId(req)))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  const cleaned = cleanRuleBody((req.body ?? {}) as RuleBody, false);
  if ('error' in cleaned) {
    res.status(400).json({ success: false, error: cleaned.error });
    return;
  }
  const updated = await repos.complianceRule.update(String(req.params.id), cleaned.value);
  if (!updated) {
    res.status(404).json({ success: false, error: 'Rule not found' });
    return;
  }
  invalidateRulesCache();
  res.json({ success: true, data: updated });
}

export async function deleteComplianceRule(req: Request, res: Response): Promise<void> {
  if (!(await isAdmin(callerUserId(req)))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  const deleted = await repos.complianceRule.delete(String(req.params.id));
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Rule not found' });
    return;
  }
  invalidateRulesCache();
  res.json({ success: true, data: { deleted: true } });
}
