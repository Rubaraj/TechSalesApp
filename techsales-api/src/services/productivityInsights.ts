/**
 * Productivity insights — the aggregate behind `GET /api/insights/productivity`.
 *
 * Everything here is scoped to a period window. That is the whole point: the
 * dashboard previously computed its numbers over unfiltered `findAll()`
 * payloads, so the Period and Metric dropdowns had nothing to act on and the
 * targets section fell back to a hardcoded array.
 *
 * Window math is imported from utils/periodWindow so this and the Atlas
 * `get_my_targets` tool answer "this week" identically.
 *
 * Targets are stored PER AGENT (see data/sample/runtime/targets.json), so the
 * team goal shown here is `targetValue × number of active agents`. That keeps
 * one set of Target rows meaningful for both the per-agent copilot view and
 * this org-wide view without adding a scope field to the model.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { repos } from '../repositories/registry.js';
import { getAllAppointments, type MemberAppointment } from './appointmentReader.js';
import { BOOTSTRAP_PATHS } from '../utils/bootstrap.js';
import { logger } from '../config/logger.js';
import {
  periodWindow,
  previousPeriodWindow,
  inWindow,
  elapsedFraction,
  round1,
  type PeriodWindow,
  type TargetPeriod,
} from '../utils/periodWindow.js';
import type { Enrollment, Lead, Target, User } from '../types/index.js';

/** Dashboard metric filter. 'all' keeps every section unfiltered. */
export type InsightsMetric = 'all' | 'New Leads' | 'New Enrollments' | 'New Appointments' | 'Revenue';

export const INSIGHTS_METRICS: InsightsMetric[] = [
  'all',
  'New Leads',
  'New Enrollments',
  'New Appointments',
  'Revenue',
];

export interface TargetProgress {
  targetId: string;
  metric: string;
  period: TargetPeriod;
  /** Per-agent goal as configured. */
  targetValue: number;
  /** targetValue × activeAgents — what the team is measured against here. */
  teamTarget: number;
  /** null when the metric has no backend data source (e.g. Electronic Kits Sent). */
  actual: number | null;
  expectedToDate: number | null;
  progressPct: number | null;
  onTrack: boolean | null;
  projectedEndOfPeriod: number | null;
  isCurrency: boolean;
  note?: string;
}

export interface AgentRow {
  userId: string;
  name: string;
  enrollments: number;
  leads: number;
  appointments: number;
  revenue: number;
  conversionRate: number;
  targetProgress: number;
}

export interface InsightsPayload {
  period: TargetPeriod;
  metric: InsightsMetric;
  window: { label: string; start: string; end: string; percentElapsed: number };
  totals: {
    enrollments: number;
    leads: number;
    appointments: number;
    avgConversionRate: number;
    totalRevenue: number;
    agentRevenue: number;
    carrierRevenue: number;
    costSavings: number;
  };
  /** Percentage change vs the previous window of the same length. */
  deltas: {
    enrollments: number | null;
    leads: number | null;
    appointments: number | null;
    avgConversionRate: number | null;
    totalRevenue: number | null;
  };
  /** Period-scoped savings split by product, mirroring the FE breakdown card. */
  costSavingsBreakdown: {
    mapd: { count: number; savings: number };
    pdp: { count: number; savings: number };
    medsup: { count: number; savings: number };
    anc: { count: number; savings: number };
    total: number;
  };
  enrollmentSources: Record<string, number>;
  leadLifecycle: Array<{ status: string; count: number }>;
  targets: TargetProgress[];
  agents: AgentRow[];
  activeAgents: number;
}

// --- plan lookup (file-based; there is no plan repository) -------------------

interface PlanRow {
  planId: string;
  product?: string;
}

let planCache: Map<string, PlanRow> | null = null;

async function loadPlans(): Promise<Map<string, PlanRow>> {
  if (planCache) return planCache;
  const file = path.join(BOOTSTRAP_PATHS.lookupDir, 'planInformation.json');
  try {
    const rows = JSON.parse(await fs.readFile(file, 'utf8')) as PlanRow[];
    planCache = new Map(rows.map((p) => [p.planId, p]));
  } catch (err) {
    logger.warn({ err, file }, 'productivityInsights: plan lookup unavailable; revenue will be 0');
    planCache = new Map();
  }
  return planCache;
}

/**
 * Commission split, mirroring techsales-app/src/utils/costSavingsUtils.ts.
 * MAPD/MA/PDP → 15% agent, 75% carrier. Medsup/ANC → 20% agent, 80% carrier.
 */
function revenueFor(e: Enrollment, plans: Map<string, PlanRow>): { agent: number; carrier: number } {
  const product = plans.get(e.planId)?.product;
  const premium = e.premium || 0;
  switch (product) {
    case 'MAPD':
    case 'MA':
    case 'PDP':
      return { agent: premium * 0.15, carrier: premium * 0.75 };
    case 'Medsup':
    case 'ANC':
      return { agent: premium * 0.2, carrier: premium * 0.8 };
    default:
      return { agent: 0, carrier: 0 };
  }
}

/** Cost savings, mirroring calculateMonthlyCostSavings: MAPD/MA $20, PDP $18, Medsup/ANC 20% of premium. */
function savingsFor(e: Enrollment, plans: Map<string, PlanRow>): number {
  const product = plans.get(e.planId)?.product;
  const premium = e.premium || 0;
  switch (product) {
    case 'MAPD':
    case 'MA':
      return 20;
    case 'PDP':
      return 18;
    case 'Medsup':
    case 'ANC':
      return premium * 0.2;
    default:
      return 0;
  }
}

const money = (n: number): number => Math.round(n * 100) / 100;

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // null → "no basis to compare"
  return round1(((current - previous) / previous) * 100);
}

/** Leads own no assignment field in seed data, so ownership falls back to createdBy — same rule as MongoLeadRepository.findByAssignedTo. */
const leadOwner = (l: Lead): string | undefined => l.assignedTo ?? l.createdBy;

interface WindowSlice {
  enrollments: Enrollment[];
  leads: Lead[];
  appointments: MemberAppointment[];
  agentRevenue: number;
  carrierRevenue: number;
  costSavings: number;
}

function sliceWindow(
  w: PeriodWindow,
  allEnrollments: Enrollment[],
  allLeads: Lead[],
  allAppointments: MemberAppointment[],
  plans: Map<string, PlanRow>,
): WindowSlice {
  const enrollments = allEnrollments.filter((e) => inWindow(e.enrollmentDate ?? e.createdAt, w));
  const leads = allLeads.filter((l) => inWindow(l.createdAt, w));
  const appointments = allAppointments.filter((a) => inWindow(a.scheduledDate, w));
  let agentRevenue = 0;
  let carrierRevenue = 0;
  let costSavings = 0;
  for (const e of enrollments) {
    const r = revenueFor(e, plans);
    agentRevenue += r.agent;
    carrierRevenue += r.carrier;
    costSavings += savingsFor(e, plans);
  }
  return { enrollments, leads, appointments, agentRevenue, carrierRevenue, costSavings };
}

const conversionOf = (s: WindowSlice): number =>
  s.leads.length === 0 ? 0 : round1((s.enrollments.length / s.leads.length) * 100);

export async function getProductivityInsights(opts: {
  period: TargetPeriod;
  metric: InsightsMetric;
  now?: Date;
}): Promise<InsightsPayload> {
  const now = opts.now ?? new Date();
  const w = periodWindow(opts.period, now);
  const prev = previousPeriodWindow(opts.period, now);
  const elapsed = elapsedFraction(w, now);

  const [allLeads, allEnrollments, allUsers, activeTargets, allAppointments, plans] = await Promise.all([
    repos.lead.findAll(),
    repos.enrollment.findAll(),
    repos.user.findAll(),
    repos.target.findActive(),
    getAllAppointments(),
    loadPlans(),
  ]);

  const cur = sliceWindow(w, allEnrollments, allLeads, allAppointments, plans);
  const pre = sliceWindow(prev, allEnrollments, allLeads, allAppointments, plans);

  const agents = allUsers.filter((u: User) => u.isActive !== false && !u.isSuperAdmin);
  const activeAgents = Math.max(1, agents.length);

  // --- targets for this period, joined to actuals ---------------------------
  const actuals: Record<string, number | null> = {
    'New Leads': cur.leads.length,
    'New Enrollments': cur.enrollments.length,
    'New Appointments': cur.appointments.length,
    Revenue: money(cur.agentRevenue),
    // No backend data source for e-kits — report honestly rather than 0.
    'Electronic Kits Sent': null,
  };

  const targets: TargetProgress[] = activeTargets
    .filter((t: Target) => t.period === opts.period)
    .filter((t: Target) => opts.metric === 'all' || t.metric === opts.metric)
    .map((t: Target) => {
      const teamTarget = t.targetValue * activeAgents;
      const actual = actuals[t.metric] ?? null;
      const isCurrency = t.metric === 'Revenue';
      if (actual === null) {
        return {
          targetId: t.targetId,
          metric: t.metric,
          period: t.period,
          targetValue: t.targetValue,
          teamTarget,
          actual: null,
          expectedToDate: null,
          progressPct: null,
          onTrack: null,
          projectedEndOfPeriod: null,
          isCurrency,
          note: 'no data source for this metric yet',
        };
      }
      const expected = round1(teamTarget * elapsed);
      return {
        targetId: t.targetId,
        metric: t.metric,
        period: t.period,
        targetValue: t.targetValue,
        teamTarget,
        actual,
        expectedToDate: expected,
        progressPct: teamTarget === 0 ? null : Math.round((actual / teamTarget) * 100),
        onTrack: actual >= expected,
        projectedEndOfPeriod: round1(actual / elapsed),
        isCurrency,
      };
    });

  // --- per-agent rows -------------------------------------------------------
  const enrollmentTarget = activeTargets.find(
    (t: Target) => t.metric === 'New Enrollments' && t.period === opts.period,
  );
  const perAgentGoal = enrollmentTarget?.targetValue ?? 0;

  const agentRows: AgentRow[] = agents
    .map((u: User) => {
      const mine = cur.enrollments.filter((e) => e.agentId === u.userId);
      const myLeads = cur.leads.filter((l) => leadOwner(l) === u.userId);
      const myAppts = cur.appointments.filter((a) => a.agentId === u.userId);
      const revenue = mine.reduce((sum, e) => sum + revenueFor(e, plans).agent, 0);
      return {
        userId: u.userId,
        name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.username,
        enrollments: mine.length,
        leads: myLeads.length,
        appointments: myAppts.length,
        revenue: money(revenue),
        conversionRate: myLeads.length === 0 ? 0 : round1((mine.length / myLeads.length) * 100),
        targetProgress:
          perAgentGoal === 0 ? 0 : Math.min(100, Math.round((mine.length / perAgentGoal) * 100)),
      };
    })
    // Surface the metric the user is actually looking at.
    .sort((a, b) => {
      switch (opts.metric) {
        case 'New Leads':
          return b.leads - a.leads;
        case 'New Appointments':
          return b.appointments - a.appointments;
        case 'Revenue':
          return b.revenue - a.revenue;
        default:
          return b.enrollments - a.enrollments;
      }
    });

  // --- cost savings split by product (same window as the total) -------------
  const savingsBreakdown = { mapd: { count: 0, savings: 0 }, pdp: { count: 0, savings: 0 }, medsup: { count: 0, savings: 0 }, anc: { count: 0, savings: 0 } };
  for (const e of cur.enrollments) {
    const product = plans.get(e.planId)?.product;
    const premium = e.premium || 0;
    if (product === 'MAPD' || product === 'MA') {
      savingsBreakdown.mapd.count += 1;
      savingsBreakdown.mapd.savings += 20;
    } else if (product === 'PDP') {
      savingsBreakdown.pdp.count += 1;
      savingsBreakdown.pdp.savings += 18;
    } else if (product === 'Medsup') {
      savingsBreakdown.medsup.count += 1;
      savingsBreakdown.medsup.savings += premium * 0.2;
    } else if (product === 'ANC') {
      savingsBreakdown.anc.count += 1;
      savingsBreakdown.anc.savings += premium * 0.2;
    }
  }

  // --- distributions --------------------------------------------------------
  const leadById = new Map(allLeads.map((l) => [l.leadId, l]));
  const enrollmentSources: Record<string, number> = {
    Web: 0,
    Event: 0,
    Vendor: 0,
    Call: 0,
    Referral: 0,
  };
  for (const e of cur.enrollments) {
    const src = leadById.get(e.leadId)?.source;
    if (src) enrollmentSources[src] = (enrollmentSources[src] ?? 0) + 1;
  }

  const LIFECYCLE = [
    'New Lead',
    'Contacted Lead',
    'Appointment Schedule',
    'Enrollment in progress',
    'Enrolled',
    'Dropped / Lost lead',
  ];
  const leadLifecycle = LIFECYCLE.map((status) => ({
    status,
    count: cur.leads.filter((l) => l.leadStatus === status).length,
  }));

  return {
    period: opts.period,
    metric: opts.metric,
    window: {
      label: w.label,
      start: w.start.toISOString(),
      end: w.end.toISOString(),
      percentElapsed: Math.round(elapsed * 100),
    },
    totals: {
      enrollments: cur.enrollments.length,
      leads: cur.leads.length,
      appointments: cur.appointments.length,
      avgConversionRate: conversionOf(cur),
      totalRevenue: money(cur.agentRevenue + cur.carrierRevenue),
      agentRevenue: money(cur.agentRevenue),
      carrierRevenue: money(cur.carrierRevenue),
      costSavings: money(cur.costSavings),
    },
    deltas: {
      enrollments: pctChange(cur.enrollments.length, pre.enrollments.length),
      leads: pctChange(cur.leads.length, pre.leads.length),
      appointments: pctChange(cur.appointments.length, pre.appointments.length),
      avgConversionRate: pctChange(conversionOf(cur), conversionOf(pre)),
      totalRevenue: pctChange(cur.agentRevenue + cur.carrierRevenue, pre.agentRevenue + pre.carrierRevenue),
    },
    costSavingsBreakdown: {
      mapd: { count: savingsBreakdown.mapd.count, savings: money(savingsBreakdown.mapd.savings) },
      pdp: { count: savingsBreakdown.pdp.count, savings: money(savingsBreakdown.pdp.savings) },
      medsup: { count: savingsBreakdown.medsup.count, savings: money(savingsBreakdown.medsup.savings) },
      anc: { count: savingsBreakdown.anc.count, savings: money(savingsBreakdown.anc.savings) },
      total: money(cur.costSavings),
    },
    enrollmentSources,
    leadLifecycle,
    targets,
    agents: agentRows,
    activeAgents,
  };
}
