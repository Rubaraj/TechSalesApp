/**
 * AI cost analysis — aggregates the persisted AI audit logs
 * (aiInteractions) + call records into per-bucket / per-user / per-call
 * cost views, with the observed averages the FE projection card scales
 * to an N-agent workforce. Admin-gated (POC posture: userId query param
 * + accessLevel check). LLM-free — mounted BEFORE the AI_ENABLED guard.
 *
 * Buckets: copilot (atlas/chat/assist agents), qa (post-call review +
 * live insight ticks + legacy live kinds + zero-cost call_analysis
 * stubs), transcript (Deepgram streaming, derived from call durations).
 */
import type { Request, Response } from 'express';
import { repos } from '../repositories/registry.js';
import type { CostRow } from '../repositories/types.js';
import { resolveAgentNames } from '../services/agentNameCache.js';
import {
  BUCKET_BY_KIND,
  PRICING,
  CACHE_WRITE_MULT,
  CACHE_READ_MULT,
  DEEPGRAM_PER_MIN,
  STREAMS_PER_CALL,
  costOfRow,
  transcriptCost,
  resolveModelPrice,
} from '../ai/cost/pricing.js';
import type { AiInteractionKind } from '../ai/llm/callbacks.js';

async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const user = await repos.user.findById(userId);
  if (!user) return false;
  return user.accessLevel === 'admin' || user.isSuperAdmin === true;
}

const UNATTRIBUTED = '(unattributed)';

interface UserCosts {
  userId: string;
  name: string | null;
  copilotUsd: number;
  qaUsd: number;
  transcriptUsd: number;
  totalUsd: number;
  llmCalls: number;
  calls: number;
}

export async function getCostAnalysis(req: Request, res: Response): Promise<void> {
  const callerUserId = String(req.query.userId ?? '');
  if (!(await isAdmin(callerUserId))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }

  const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const rows = await repos.aiInteraction.findForCostAnalysis(sinceIso);
  // callRecord.list has no date filter and caps at 200 most-recent — filter
  // here. At scale this undercounts ranges with >200 calls; POC-acceptable.
  const allCalls = await repos.callRecord.list({ limit: 200 });
  const calls = allCalls.filter((c) => c.createdAt >= sinceIso);

  // --- Per-row costing + bucket/user accumulation ---------------------------
  const totals = { copilotUsd: 0, qaUsd: 0, transcriptUsd: 0, llmCalls: 0, tokens: 0 };
  const byUser = new Map<string, UserCosts>();
  const userRow = (userId: string): UserCosts => {
    const existing = byUser.get(userId);
    if (existing) return existing;
    const fresh: UserCosts = {
      userId,
      name: null,
      copilotUsd: 0,
      qaUsd: 0,
      transcriptUsd: 0,
      totalUsd: 0,
      llmCalls: 0,
      calls: 0,
    };
    byUser.set(userId, fresh);
    return fresh;
  };

  const fallbackModels = new Set<string>();
  const unknownModels = new Set<string>();
  let zeroTokenRows = 0;

  // Per-call joins (call_qa + call_live_insight carry input.callSid).
  const liveUsdByCall = new Map<string, { usd: number; ticks: number }>();
  const qaUsdByCall = new Map<string, number>();
  // E4 denominators for the projection averages.
  const copilotUserDays = new Set<string>();
  let copilotUsdTotal = 0;
  let liveUsdTotal = 0;
  let qaReviewUsdTotal = 0;
  let qaReviewCount = 0;

  for (const row of rows) {
    const usd = costOfRow(row);
    const bucket = BUCKET_BY_KIND[row.kind as AiInteractionKind] ?? 'copilot';
    const effectiveUser = row.agentUserId ?? row.userId ?? UNATTRIBUTED;
    const isStubRow = row.provider === 'stub' || row.kind === 'call_analysis';

    const price = resolveModelPrice(row.model, row.provider);
    if (price.fallback) fallbackModels.add(row.model);
    else if (price.unpriced && !isStubRow) unknownModels.add(row.model || '(empty)');
    if (row.tokensIn === 0 && row.tokensOut > 0) zeroTokenRows += 1;

    if (!isStubRow) {
      totals.llmCalls += 1;
      totals.tokens += row.tokensIn + row.tokensOut + row.cachedReadTokens;
      userRow(effectiveUser).llmCalls += 1;
    }

    if (bucket === 'copilot') {
      totals.copilotUsd += usd;
      userRow(effectiveUser).copilotUsd += usd;
      if (!isStubRow) {
        copilotUsdTotal += usd;
        copilotUserDays.add(`${effectiveUser}:${row.createdAt.slice(0, 10)}`);
      }
    } else {
      totals.qaUsd += usd;
      userRow(effectiveUser).qaUsd += usd;
      if (row.kind === 'call_live_insight' && row.callSid) {
        const entry = liveUsdByCall.get(row.callSid) ?? { usd: 0, ticks: 0 };
        entry.usd += usd;
        entry.ticks += 1;
        liveUsdByCall.set(row.callSid, entry);
        liveUsdTotal += usd;
      }
      if (row.kind === 'call_qa' && row.callSid) {
        qaUsdByCall.set(row.callSid, (qaUsdByCall.get(row.callSid) ?? 0) + usd);
        qaReviewUsdTotal += usd;
        qaReviewCount += 1;
      }
      // Legacy call_emotion/call_coaching rows lack a verified input shape —
      // they contribute to bucket/user totals only, not the per-call join.
    }
  }

  // --- Transcript costs from call durations ---------------------------------
  let totalCallSec = 0;
  let liveInsightCallSec = 0; // minutes of calls that actually ran insight (E4)
  const perCall = calls.map((c) => {
    const tUsd = transcriptCost(c.durationSec);
    totals.transcriptUsd += tUsd;
    totalCallSec += c.durationSec;
    const owner = c.userId ?? UNATTRIBUTED;
    const u = userRow(owner);
    u.transcriptUsd += tUsd;
    u.calls += 1;
    const live = liveUsdByCall.get(c.callSid);
    if (live) liveInsightCallSec += c.durationSec;
    return {
      callSid: c.callSid,
      userId: c.userId ?? null,
      startedAt: c.startedAt,
      durationSec: c.durationSec,
      liveInsightUsd: live?.usd ?? 0,
      liveTicks: live?.ticks ?? 0,
      qaReviewUsd: qaUsdByCall.get(c.callSid) ?? 0,
      transcriptUsd: tUsd,
      totalUsd: (live?.usd ?? 0) + (qaUsdByCall.get(c.callSid) ?? 0) + tUsd,
    };
  });

  for (const u of byUser.values()) {
    u.totalUsd = u.copilotUsd + u.qaUsd + u.transcriptUsd;
  }
  const names = await resolveAgentNames([...byUser.keys()].filter((u) => u !== UNATTRIBUTED));
  for (const u of byUser.values()) u.name = names.get(u.userId) ?? null;

  const totalUsd = totals.copilotUsd + totals.qaUsd + totals.transcriptUsd;
  const avgCallMinutes = calls.length > 0 ? totalCallSec / 60 / calls.length : 0;

  res.json({
    success: true,
    data: {
      rangeDays: days,
      since: sinceIso,
      pricing: {
        models: PRICING,
        cacheWriteMult: CACHE_WRITE_MULT,
        cacheReadMult: CACHE_READ_MULT,
        deepgramPerMin: DEEPGRAM_PER_MIN,
        streamsPerCall: STREAMS_PER_CALL,
      },
      totals: { ...totals, totalUsd, callCount: calls.length, callMinutes: totalCallSec / 60 },
      byUser: [...byUser.values()].sort((a, b) => b.totalUsd - a.totalUsd),
      perCall: perCall.slice(0, 50),
      averages: {
        // Copilot spend per active copilot-user-day (idle days excluded).
        perAgentPerDayCopilotUsd:
          copilotUserDays.size > 0 ? copilotUsdTotal / copilotUserDays.size : 0,
        // Live-insight spend per minute of calls that actually ran it.
        perCallMinuteLiveUsd:
          liveInsightCallSec > 0 ? liveUsdTotal / (liveInsightCallSec / 60) : 0,
        perCallQaUsd: qaReviewCount > 0 ? qaReviewUsdTotal / qaReviewCount : 0,
        perCallTranscriptUsd:
          calls.length > 0 ? totals.transcriptUsd / calls.length : 0,
        avgCallMinutes,
      },
      dataQuality: {
        zeroTokenRows,
        fallbackModels: [...fallbackModels],
        unknownModels: [...unknownModels],
      },
    },
  });
}
