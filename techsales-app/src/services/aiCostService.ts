/**
 * AI cost analysis — FE client for /api/ai/cost-analysis (admin-gated).
 */
import { API_BASE } from '../api/apiBase';

export interface CostTotals {
  copilotUsd: number;
  qaUsd: number;
  transcriptUsd: number;
  trainingUsd: number;
  totalUsd: number;
  llmCalls: number;
  tokens: number;
  callCount: number;
  callMinutes: number;
  simSessionCount: number;
  simMinutes: number;
}

export interface CostByUser {
  userId: string;
  name: string | null;
  copilotUsd: number;
  qaUsd: number;
  transcriptUsd: number;
  trainingUsd: number;
  totalUsd: number;
  llmCalls: number;
  calls: number;
}

export interface CostPerCall {
  callSid: string;
  userId: string | null;
  startedAt: string;
  durationSec: number;
  simulated: boolean;
  liveInsightUsd: number;
  liveTicks: number;
  qaReviewUsd: number;
  transcriptUsd: number;
  voiceAgentUsd: number;
  totalUsd: number;
}

export interface CostAverages {
  perAgentPerDayCopilotUsd: number;
  perCallMinuteLiveUsd: number;
  perCallQaUsd: number;
  perCallTranscriptUsd: number;
  avgCallMinutes: number;
  perSimMinuteUsd: number;
  avgSimSessionMinutes: number;
}

export interface CostAnalysis {
  rangeDays: number;
  since: string;
  pricing: {
    models: Record<string, { inPerMTok: number; outPerMTok: number }>;
    cacheWriteMult: number;
    cacheReadMult: number;
    deepgramPerMin: number;
    streamsPerCall: number;
    simulatorAgentPerMin: number;
  };
  totals: CostTotals;
  byUser: CostByUser[];
  perCall: CostPerCall[];
  averages: CostAverages;
  dataQuality: {
    zeroTokenRows: number;
    fallbackModels: string[];
    unknownModels: string[];
  };
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function getCostAnalysis(userId: string, days: number): Promise<CostAnalysis> {
  const res = await fetch(
    `${API_BASE}/ai/cost-analysis?userId=${encodeURIComponent(userId)}&days=${days}`,
  );
  const body = (await res.json()) as ApiEnvelope<CostAnalysis>;
  if (!body.success || !body.data) {
    throw new Error(body.error ?? `Cost analysis failed (${res.status})`);
  }
  return body.data;
}
