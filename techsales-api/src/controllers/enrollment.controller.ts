import type { Request, Response } from 'express';
import type { Enrollment } from '../types/index.js';
import type { ServiceResponse } from '../repositories/types.js';
import { repos } from '../repositories/registry.js';

const param = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '');
const stringOrUndef = (v: unknown): string | undefined => (typeof v === 'string' && v.length ? v : undefined);

export async function getAllEnrollments(req: Request, res: Response<ServiceResponse<Enrollment[]>>): Promise<void> {
  // Support optional ?agentId= and ?leadId= filters via the same endpoint.
  const agentId = stringOrUndef(req.query.agentId);
  const leadId = stringOrUndef(req.query.leadId);
  if (agentId) {
    res.json({ success: true, data: await repos.enrollment.findByAgent(agentId) });
    return;
  }
  if (leadId) {
    res.json({ success: true, data: await repos.enrollment.findByLead(leadId) });
    return;
  }
  res.json({ success: true, data: await repos.enrollment.findAll() });
}

export async function getEnrollmentsByAgent(req: Request, res: Response<ServiceResponse<Enrollment[]>>): Promise<void> {
  res.json({ success: true, data: await repos.enrollment.findByAgent(param(req.params.agentId)) });
}

export async function getEnrollmentsByLead(req: Request, res: Response<ServiceResponse<Enrollment[]>>): Promise<void> {
  res.json({ success: true, data: await repos.enrollment.findByLead(param(req.params.leadId)) });
}

export async function createEnrollment(req: Request, res: Response<ServiceResponse<Enrollment>>): Promise<void> {
  const body = (req.body ?? {}) as Partial<Enrollment> & { createdBy?: string };
  if (!body.createdBy) {
    res.status(400).json({ success: false, error: 'createdBy is required' });
    return;
  }
  const { createdBy, enrollmentId: _ignore, createdAt: _ignore2, ...input } = body;
  const result = await repos.enrollment.create(input as Parameters<typeof repos.enrollment.create>[0], createdBy);
  res.status(201).json({ success: true, data: result, message: 'Enrollment created successfully' });
}
