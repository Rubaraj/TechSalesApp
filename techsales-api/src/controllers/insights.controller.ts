import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ServiceResponse } from '../repositories/types.js';
import {
  getProductivityInsights,
  type InsightsPayload,
  type InsightsMetric,
} from '../services/productivityInsights.js';
import { getAllAppointments, getAppointmentsForAgent } from '../services/appointmentReader.js';
import type { MemberAppointment } from '../services/appointmentReader.js';

/**
 * Validate against the real unions rather than defaulting silently — a typo in
 * `?period=` should say so, not quietly return monthly numbers under a weekly
 * heading.
 */
const querySchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).default('monthly'),
  metric: z
    .enum(['all', 'New Leads', 'New Enrollments', 'New Appointments', 'Revenue'])
    .default('all'),
});

export async function getProductivityDashboard(
  req: Request,
  res: Response<ServiceResponse<InsightsPayload>>,
): Promise<void> {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Invalid query parameters',
      message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    });
    return;
  }

  const data = await getProductivityInsights({
    period: parsed.data.period,
    metric: parsed.data.metric as InsightsMetric,
  });
  res.json({ success: true, data });
}

const appointmentQuery = z.object({
  agentId: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function listAppointments(
  req: Request,
  res: Response<ServiceResponse<MemberAppointment[]>>,
): Promise<void> {
  const parsed = appointmentQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid query parameters' });
    return;
  }
  const { agentId, from, to } = parsed.data;

  let rows = agentId ? await getAppointmentsForAgent(agentId) : await getAllAppointments();

  if (from || to) {
    const fromT = from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY;
    const toT = to ? new Date(to).getTime() : Number.POSITIVE_INFINITY;
    if (Number.isNaN(fromT) || Number.isNaN(toT)) {
      res.status(400).json({ success: false, error: 'from/to must be parseable dates' });
      return;
    }
    rows = rows.filter((a) => {
      const t = new Date(a.scheduledDate).getTime();
      return !Number.isNaN(t) && t >= fromT && t <= toT;
    });
  }

  rows.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  res.json({ success: true, data: rows });
}
