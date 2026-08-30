import type { ServiceResponse } from './baseService';
import { apiGet } from '../api/apiClient';
import { getMode } from '../api/mode';
import type { TargetPeriod } from '../types';

/** Mirrors InsightsMetric in techsales-api/src/services/productivityInsights.ts. */
export type InsightsMetric =
  | 'all'
  | 'New Leads'
  | 'New Enrollments'
  | 'New Appointments'
  | 'Revenue';

export interface TargetProgress {
  targetId: string;
  metric: string;
  period: TargetPeriod;
  /** Per-agent goal as configured in Target Management. */
  targetValue: number;
  /** targetValue x active agents — what the team is measured against. */
  teamTarget: number;
  /** null when the metric has no backend data source yet. */
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
  /** Percent change vs the previous window. null = no basis to compare. */
  deltas: {
    enrollments: number | null;
    leads: number | null;
    appointments: number | null;
    avgConversionRate: number | null;
    totalRevenue: number | null;
  };
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

const _getApi = (period: TargetPeriod, metric: InsightsMetric): Promise<ServiceResponse<InsightsPayload>> =>
  apiGet<InsightsPayload>(
    `/insights/productivity?period=${encodeURIComponent(period)}&metric=${encodeURIComponent(metric)}`,
  );

/**
 * Local mode is the offline fallback AuthContext picks when the API login
 * fails. These figures are a server-side aggregate with no bundled equivalent,
 * so report that honestly rather than showing stale or invented numbers.
 */
const _getLocal = (): Promise<ServiceResponse<InsightsPayload>> =>
  Promise.resolve({
    success: false,
    error: 'Productivity metrics require the backend API.',
    message: 'You are running in offline/local mode, which has no aggregate data source.',
  });

export const getProductivityInsights = (
  period: TargetPeriod,
  metric: InsightsMetric,
): Promise<ServiceResponse<InsightsPayload>> =>
  getMode() === 'local' ? _getLocal() : _getApi(period, metric);
