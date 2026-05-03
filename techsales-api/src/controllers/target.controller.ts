import type { Request, Response } from 'express';
import type { Target } from '../types/index.js';
import type { ServiceResponse } from '../repositories/types.js';
import { repos } from '../repositories/registry.js';

const param = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '');
const stringOrUndef = (v: unknown): string | undefined => (typeof v === 'string' && v.length ? v : undefined);

export async function getAllTargets(_req: Request, res: Response<ServiceResponse<Target[]>>): Promise<void> {
  res.json({ success: true, data: await repos.target.findAll() });
}

export async function getTargetById(req: Request, res: Response<ServiceResponse<Target>>): Promise<void> {
  const t = await repos.target.findById(param(req.params.id));
  if (!t) {
    res.status(404).json({ success: false, error: 'Target not found' });
    return;
  }
  res.json({ success: true, data: t });
}

export async function getTargetsByPeriod(req: Request, res: Response<ServiceResponse<Target[]>>): Promise<void> {
  res.json({ success: true, data: await repos.target.findByPeriod(param(req.params.period)) });
}

export async function getTargetsByMetric(req: Request, res: Response<ServiceResponse<Target[]>>): Promise<void> {
  res.json({ success: true, data: await repos.target.findByMetric(param(req.params.metric)) });
}

export async function getActiveTargets(_req: Request, res: Response<ServiceResponse<Target[]>>): Promise<void> {
  res.json({ success: true, data: await repos.target.findActive() });
}

export async function createTarget(req: Request, res: Response<ServiceResponse<Target>>): Promise<void> {
  const body = (req.body ?? {}) as Partial<Target> & { createdBy?: string };
  if (!body.createdBy) {
    res.status(400).json({ success: false, error: 'createdBy is required' });
    return;
  }
  const { createdBy, targetId: _ignore, createdAt: _ignore2, ...input } = body;
  const result = await repos.target.create(input as Parameters<typeof repos.target.create>[0], createdBy);
  res.status(201).json({ success: true, data: result, message: 'Target created successfully' });
}

export async function updateTarget(req: Request, res: Response<ServiceResponse<Target>>): Promise<void> {
  const updatedBy = stringOrUndef((req.body ?? {}).updatedBy) ?? 'system';
  const { updatedBy: _ignore, ...patch } = (req.body ?? {}) as Partial<Target> & { updatedBy?: string };
  const result = await repos.target.update(param(req.params.id), patch, updatedBy);
  if (!result) {
    res.status(404).json({ success: false, error: 'Target not found' });
    return;
  }
  res.json({ success: true, data: result, message: 'Target updated successfully' });
}

export async function deleteTarget(req: Request, res: Response<ServiceResponse<null>>): Promise<void> {
  const ok = await repos.target.delete(param(req.params.id));
  if (!ok) {
    res.status(404).json({ success: false, error: 'Target not found' });
    return;
  }
  res.json({ success: true, data: null, message: 'Target deleted successfully' });
}

export async function toggleTargetStatus(req: Request, res: Response<ServiceResponse<Target>>): Promise<void> {
  const updatedBy = stringOrUndef((req.body ?? {}).updatedBy) ?? 'system';
  const result = await repos.target.toggleStatus(param(req.params.id), updatedBy);
  if (!result) {
    res.status(404).json({ success: false, error: 'Target not found' });
    return;
  }
  res.json({ success: true, data: result, message: `Target ${result.isActive ? 'activated' : 'deactivated'}` });
}
