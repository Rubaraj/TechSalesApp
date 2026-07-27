/**
 * Admin › AI Cost Analysis — utilization + cost of the three AI
 * capabilities (Copilot+chat, QA analysis, Transcription) from the
 * persisted audit logs: bucket totals, per-user and per-call breakdowns,
 * and an editable projection scaling observed averages to an N-agent
 * workforce. All figures are estimates from list prices.
 *
 * Bucket colors (validated for CVD + both surfaces): copilot orange
 * (#f97316 / dark #ea580c), QA violet (#8b5cf6), transcript sky
 * (#0ea5e9 / dark #0284c7); identity is never color-alone — legend +
 * direct labels + tables carry the numbers.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  ClipboardCheck,
  AudioLines,
  DollarSign,
  Loader2,
  Users,
  ChevronUp,
  ChevronDown,
  GraduationCap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getCostAnalysis,
  type CostAnalysis,
  type CostPerCall,
} from '../../services/aiCostService';
import { formatWhen } from './supervisionUi';

const RANGES = [7, 30, 90] as const;

/** Sub-cent amounts need precision; projection amounts read as currency. */
function fmtUsd(v: number): string {
  if (v === 0) return '$0.00';
  if (v >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(v);
  }
  if (v >= 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(5)}`;
}

function fmtNum(v: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(v));
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Sortable columns of the per-call table. */
type CallSortKey = 'startedAt' | 'durationSec' | 'liveInsightUsd' | 'qaReviewUsd' | 'transcriptUsd' | 'totalUsd';

const BUCKETS = [
  {
    key: 'copilotUsd' as const,
    label: 'Copilot + Chat',
    icon: Bot,
    chip: 'bg-orange-500 dark:bg-orange-600',
    hint: 'Atlas agentic copilot, chat, search, compare & recommend agents',
  },
  {
    key: 'qaUsd' as const,
    label: 'QA Analysis',
    icon: ClipboardCheck,
    chip: 'bg-violet-500',
    hint: 'Live-call insight ticks (emotion / coaching / AI compliance) + post-call QA reviews',
  },
  {
    key: 'transcriptUsd' as const,
    label: 'Transcription',
    icon: AudioLines,
    chip: 'bg-sky-500 dark:bg-sky-600',
    hint: 'Deepgram streaming speech-to-text (2 audio streams per call)',
  },
  {
    key: 'trainingUsd' as const,
    label: 'Training',
    icon: GraduationCap,
    chip: 'bg-emerald-500 dark:bg-emerald-600',
    hint: 'Practice sessions: Voice Agent minutes (STT+LLM+TTS) + their insight ticks and practice scorecards',
  },
];

function SortHeader({
  label,
  sortKey,
  sort,
  onToggle,
  align = 'right',
  last = false,
}: {
  label: string;
  sortKey: CallSortKey;
  sort: { key: CallSortKey; dir: 'asc' | 'desc' };
  onToggle: (key: CallSortKey) => void;
  align?: 'left' | 'right';
  last?: boolean;
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.dir === 'desc' ? ChevronDown : ChevronUp;
  return (
    <th className={`py-2 font-semibold ${last ? '' : 'pr-3'} ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => onToggle(sortKey)}
        className={`inline-flex items-center gap-0.5 hover:text-gray-900 dark:hover:text-white transition-colors ${
          active ? 'text-gray-900 dark:text-white' : ''
        }`}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        {active && <Arrow className="w-3 h-3" />}
      </button>
    </th>
  );
}

interface ProjectionInputs {
  agents: number;
  callsPerAgentPerDay: number;
  avgCallMinutes: number;
  reviewedPct: number;
  workdaysPerMonth: number;
  practiceSessionsPerAgentPerMonth: number;
  avgPracticeMinutes: number;
}

export function AiCostAnalysis() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.userId ?? '';

  // Per-call table sorting — cost-heavy calls first by default.
  const [callSort, setCallSort] = useState<{ key: CallSortKey; dir: 'asc' | 'desc' }>({
    key: 'totalUsd',
    dir: 'desc',
  });
  const toggleCallSort = (key: CallSortKey): void => {
    setCallSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' },
    );
  };

  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<CostAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [proj, setProj] = useState<ProjectionInputs>({
    agents: 100,
    callsPerAgentPerDay: 30,
    avgCallMinutes: 3,
    reviewedPct: 100,
    workdaysPerMonth: 22,
    practiceSessionsPerAgentPerMonth: 4,
    avgPracticeMinutes: 5,
  });
  const [projSeeded, setProjSeeded] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getCostAnalysis(userId, days);
      setData(result);
      // Seed observed averages once (keep admin edits after).
      if (!projSeeded && result.averages.avgCallMinutes > 0) {
        setProj((p) => ({
          ...p,
          avgCallMinutes: Math.max(0.5, Number(result.averages.avgCallMinutes.toFixed(1))),
          ...(result.averages.avgSimSessionMinutes > 0
            ? {
                avgPracticeMinutes: Math.max(
                  0.5,
                  Number(result.averages.avgSimSessionMinutes.toFixed(1)),
                ),
              }
            : {}),
        }));
        setProjSeeded(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId, days, projSeeded]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedCalls = useMemo<CostPerCall[]>(() => {
    if (!data) return [];
    const rows = [...data.perCall];
    const { key, dir } = callSort;
    rows.sort((a, b) => {
      const av = key === 'startedAt' ? Date.parse(a.startedAt) : a[key];
      const bv = key === 'startedAt' ? Date.parse(b.startedAt) : b[key];
      return dir === 'desc' ? bv - av : av - bv;
    });
    return rows;
  }, [data, callSort]);

  const projection = useMemo(() => {
    if (!data) return null;
    const a = data.averages;
    const callsPerMonth = proj.agents * proj.callsPerAgentPerDay * proj.workdaysPerMonth;
    const callMinutesPerMonth = callsPerMonth * proj.avgCallMinutes;
    const transcript =
      callMinutesPerMonth * data.pricing.streamsPerCall * data.pricing.deepgramPerMin;
    const live = callMinutesPerMonth * a.perCallMinuteLiveUsd;
    const qaReviews = callsPerMonth * (proj.reviewedPct / 100) * a.perCallQaUsd;
    const copilot = proj.agents * proj.workdaysPerMonth * a.perAgentPerDayCopilotUsd;
    // Training: observed all-in per-minute rate when sim data exists;
    // otherwise list agent rate + live-tick rate + one review per session.
    const practiceMinutes =
      proj.agents * proj.practiceSessionsPerAgentPerMonth * proj.avgPracticeMinutes;
    const training =
      a.perSimMinuteUsd > 0
        ? practiceMinutes * a.perSimMinuteUsd
        : practiceMinutes * (data.pricing.simulatorAgentPerMin + a.perCallMinuteLiveUsd) +
          proj.agents * proj.practiceSessionsPerAgentPerMonth * a.perCallQaUsd;
    const total = transcript + live + qaReviews + copilot + training;
    return {
      callsPerMonth,
      callMinutesPerMonth,
      copilot,
      qa: live + qaReviews,
      live,
      qaReviews,
      transcript,
      training,
      total,
      perAgent: proj.agents > 0 ? total / proj.agents : 0,
    };
  }, [data, proj]);

  if (isLoading && !data) {
    return (
      <div className="py-16 text-center text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
        Crunching audit logs…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-16 text-center text-gray-500 dark:text-gray-400">
        {error ?? 'No data.'}
      </div>
    );
  }

  const totals = data.totals;

  return (
    <div className="space-y-6">
      {/* Header + range selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
          Estimated AI spend computed per audit-log row (cache-aware token pricing) and per
          call (transcription minutes). List prices — the gateway may add a small fee.
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                days === r
                  ? 'bg-orange-600 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* Bucket tiles + total */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {BUCKETS.map((b) => {
          const Icon = b.icon;
          const usd = totals[b.key];
          const share = totals.totalUsd > 0 ? (usd / totals.totalUsd) * 100 : 0;
          return (
            <div
              key={b.key}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
              title={b.hint}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${b.chip}`} />
                <Icon className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {b.label}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                {fmtUsd(usd)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {share.toFixed(0)}% of spend
              </div>
            </div>
          );
        })}
        <div className="bg-gray-900 dark:bg-gray-950 rounded-xl border border-gray-700 p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Total ({data.rangeDays}d)
            </span>
          </div>
          <div className="text-2xl font-bold text-white tabular-nums">
            {fmtUsd(totals.totalUsd)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {fmtNum(totals.llmCalls)} LLM calls · {fmtNum(totals.tokens)} tokens ·{' '}
            {fmtNum(totals.callMinutes)} call min
            {totals.simSessionCount > 0 ? ` · ${totals.simSessionCount} practice` : ''}
          </div>
        </div>
      </div>

      {/* Distribution bar */}
      {totals.totalUsd > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Spend distribution
          </h3>
          <div className="flex h-4 rounded-full overflow-hidden gap-0.5 bg-gray-100 dark:bg-gray-700">
            {BUCKETS.map((b) => {
              const pct = (totals[b.key] / totals.totalUsd) * 100;
              if (pct <= 0) return null;
              return (
                <div
                  key={b.key}
                  className={`${b.chip} first:rounded-l-full last:rounded-r-full`}
                  style={{ width: `${pct}%` }}
                  title={`${b.label}: ${fmtUsd(totals[b.key])} (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
            {BUCKETS.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                <span className={`w-2.5 h-2.5 rounded-full ${b.chip}`} />
                {b.label}
                <span className="font-semibold tabular-nums">{fmtUsd(totals[b.key])}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* Per-user table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Cost per user
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="py-2 pr-3 font-semibold">User</th>
                  <th className="py-2 pr-3 font-semibold text-right">Copilot</th>
                  <th className="py-2 pr-3 font-semibold text-right">QA</th>
                  <th className="py-2 pr-3 font-semibold text-right">Transcript</th>
                  <th className="py-2 pr-3 font-semibold text-right">Training</th>
                  <th className="py-2 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.byUser.map((u) => (
                  <tr key={u.userId} className="border-b border-gray-100 dark:border-gray-700/60 last:border-0">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {u.name ?? u.userId}
                      </span>
                      <span className="text-xs text-gray-400 ml-1.5">
                        {u.calls > 0 ? `${u.calls} calls` : ''}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtUsd(u.copilotUsd)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtUsd(u.qaUsd)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtUsd(u.transcriptUsd)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtUsd(u.trainingUsd)}</td>
                    <td className="py-2 text-right tabular-nums font-semibold text-gray-900 dark:text-white">{fmtUsd(u.totalUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-call table — sortable, cost-desc by default; call links open
         *  the Supervision transcript view. */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Cost per call
          </h3>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <SortHeader label="Call" sortKey="startedAt" sort={callSort} onToggle={toggleCallSort} align="left" />
                  <SortHeader label="Duration" sortKey="durationSec" sort={callSort} onToggle={toggleCallSort} />
                  <SortHeader label="Live AI" sortKey="liveInsightUsd" sort={callSort} onToggle={toggleCallSort} />
                  <SortHeader label="QA review" sortKey="qaReviewUsd" sort={callSort} onToggle={toggleCallSort} />
                  <SortHeader label="Transcript" sortKey="transcriptUsd" sort={callSort} onToggle={toggleCallSort} />
                  <SortHeader label="Total" sortKey="totalUsd" sort={callSort} onToggle={toggleCallSort} last />
                </tr>
              </thead>
              <tbody>
                {sortedCalls.map((c) => (
                  <tr key={c.callSid} className="border-b border-gray-100 dark:border-gray-700/60 last:border-0">
                    <td className="py-2 pr-3">
                      <button
                        onClick={() =>
                          navigate(`/admin/supervision/${encodeURIComponent(c.callSid)}`)
                        }
                        className="font-mono text-xs text-orange-600 dark:text-orange-400 hover:underline"
                        title="Open call transcript"
                      >
                        …{c.callSid.slice(-8)}
                      </button>
                      {c.simulated && (
                        <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                          SIM
                        </span>
                      )}
                      <span className="block text-[11px] text-gray-400">
                        {formatWhen(c.startedAt)}
                        {c.liveTicks > 0 ? ` · ${c.liveTicks} ticks` : ''}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtDuration(c.durationSec)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtUsd(c.liveInsightUsd)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-gray-700 dark:text-gray-300">{fmtUsd(c.qaReviewUsd)}</td>
                    <td
                      className="py-2 pr-3 text-right tabular-nums text-gray-700 dark:text-gray-300"
                      title={c.simulated ? 'Voice agent minutes (STT+LLM+TTS bundled)' : undefined}
                    >
                      {c.simulated ? fmtUsd(c.voiceAgentUsd) : fmtUsd(c.transcriptUsd)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold text-gray-900 dark:text-white">{fmtUsd(c.totalUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Projection */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
          Workforce projection
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Monthly cost scaled from the observed averages above — edit the assumptions live.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {(
            [
              ['agents', 'Agents', 1, 10000],
              ['callsPerAgentPerDay', 'Calls / agent / day', 1, 500],
              ['avgCallMinutes', 'Avg call minutes', 0.5, 120],
              ['reviewedPct', '% calls QA-reviewed', 0, 100],
              ['workdaysPerMonth', 'Workdays / month', 1, 31],
              ['practiceSessionsPerAgentPerMonth', 'Practice sessions / agent / month', 0, 100],
              ['avgPracticeMinutes', 'Avg practice minutes', 0.5, 60],
            ] as Array<[keyof ProjectionInputs, string, number, number]>
          ).map(([key, label, min, max]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {label}
              </label>
              <input
                type="number"
                min={min}
                max={max}
                step={key === 'avgCallMinutes' || key === 'avgPracticeMinutes' ? 0.5 : 1}
                value={proj[key]}
                onChange={(e) =>
                  setProj((p) => ({ ...p, [key]: Number(e.target.value) || 0 }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          ))}
        </div>
        {projection && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {BUCKETS.map((b) => {
              const value =
                b.key === 'copilotUsd'
                  ? projection.copilot
                  : b.key === 'qaUsd'
                    ? projection.qa
                    : b.key === 'transcriptUsd'
                      ? projection.transcript
                      : projection.training;
              return (
                <div key={b.key} className="rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    <span className={`w-2 h-2 rounded-full ${b.chip}`} />
                    {b.label} / month
                  </div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                    {fmtUsd(value)}
                  </div>
                  {b.key === 'qaUsd' && (
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      live {fmtUsd(projection.live)} + reviews {fmtUsd(projection.qaReviews)}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="rounded-lg bg-gray-900 dark:bg-gray-950 border border-gray-700 p-4">
              <div className="text-xs font-semibold text-gray-400 mb-1">
                Total / month · {proj.agents} agents
              </div>
              <div className="text-xl font-bold text-white tabular-nums">
                {fmtUsd(projection.total)}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {fmtUsd(projection.perAgent)} per agent · {fmtNum(projection.callsPerMonth)}{' '}
                calls · {fmtNum(projection.callMinutesPerMonth)} min
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Assumptions + data quality */}
      <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1">
        <p>
          Pricing: {Object.entries(data.pricing.models)
            .map(([m, p]) => `${m} $${p.inPerMTok}/$${p.outPerMTok} per MTok`)
            .join(' · ')}{' '}
          · cache write ×{data.pricing.cacheWriteMult}, read ×{data.pricing.cacheReadMult} ·
          Deepgram ${data.pricing.deepgramPerMin}/min × {data.pricing.streamsPerCall} streams ·
          Voice Agent ${data.pricing.simulatorAgentPerMin}/min (training).
        </p>
        {(data.dataQuality.fallbackModels.length > 0 ||
          data.dataQuality.unknownModels.length > 0 ||
          data.dataQuality.zeroTokenRows > 0) && (
          <p>
            Data quality:{' '}
            {data.dataQuality.fallbackModels.length > 0 &&
              `${data.dataQuality.fallbackModels.length} model id(s) priced at the default tier (${data.dataQuality.fallbackModels.join(', ')}). `}
            {data.dataQuality.unknownModels.length > 0 &&
              `Unpriced models: ${data.dataQuality.unknownModels.join(', ')}. `}
            {data.dataQuality.zeroTokenRows > 0 &&
              `${data.dataQuality.zeroTokenRows} row(s) missing input-token counts (undercounted).`}
          </p>
        )}
      </div>
    </div>
  );
}
