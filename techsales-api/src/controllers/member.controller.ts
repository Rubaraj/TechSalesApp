import type { Request, Response } from 'express';
import type { Member, MemberAppointment } from '../types/index.js';
import type { ServiceResponse } from '../repositories/types.js';
import { repos } from '../repositories/registry.js';

const param = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '');

export async function getMemberById(req: Request, res: Response<ServiceResponse<Member>>): Promise<void> {
  const m = await repos.member.findById(param(req.params.id));
  if (!m) {
    res.status(404).json({ success: false, error: 'Member not found' });
    return;
  }
  res.json({ success: true, data: m });
}

export async function getMemberAppointments(req: Request, res: Response<ServiceResponse<MemberAppointment[]>>): Promise<void> {
  const data = await repos.member.findAppointmentsByMember(param(req.params.id));
  res.json({ success: true, data });
}
