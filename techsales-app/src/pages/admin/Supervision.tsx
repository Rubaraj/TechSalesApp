/**
 * Ambient Supervisor CoPilot — admin Supervision tab.
 *
 * Top: LIVE section — active calls (with elapsed ticker) + a scrolling
 * compliance-alert feed via the supervisor SSE stream. Reconnect uses real
 * exponential backoff; `streamUp` turns on only once the stream is actually
 * connected; 401/403 is terminal (no retry loop).
 * Below: Call Log — persisted call records with agent names, tag chips,
 * flagged badges, and QA scores; rows open the transcript/QA detail page.
 * The alert feed is hydrated from persisted compliance tags on load so it
 * survives navigation/reload.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radio,
  PhoneCall,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  ChevronRight,
  ShieldX,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  listCalls,
  openSupervisorStream,
  SupervisorStreamAuthError,
} from '../../services/supervisorService';
import type {
  CallRecordSummary,
  ProspectEmotion,
  SupervisorEvent,
} from '../../types/supervisor';
import { TAG_CHIP_TONES, EMOTION_CHIP, formatWhen, formatElapsed } from './supervisionUi';

interface LiveCall {
  callSid: string;
  agentName?: string;
  direction: string;
  startedAt: number;
  /** Latest prospect emotion (emotion_shift events; unset until first). */
  emotion?: ProspectEmotion;
}

interface LiveAlert {
  id: string;
  callSid: string;
  agentName?: string;
  phrase: string;
  rule: string;
  suggestion?: string;
  ts: number;
  /** Rebuilt from persisted tags on load (vs. arrived live this session). */
  historic?: boolean;
}

const MAX_ALERTS = 30;

/** Rebuild alert entries from the persisted compliance tags already present
 *  in the fetched call log, so the feed survives navigation/reload. */
function alertsFromRecords(calls: CallRecordSummary[]): LiveAlert[] {
  const out: LiveAlert[] = [];
  for (const c of calls) {
    for (const t of c.tags ?? []) {
      if (t.kind !== 'compliance') continue;
      out.push({
        id: `${c.callSid}-${t.ts}`,
        callSid: c.callSid,
        agentName: c.agentName ?? c.userId,
        phrase: String(t.data.phrase ?? ''),
        rule: String(t.data.rule ?? ''),
        suggestion: t.data.suggestion ? String(t.data.suggestion) : undefined,
        ts: t.ts,
        historic: true,
      });
    }
  }
  return out.sort((a, b) => b.ts - a.ts).slice(0, MAX_ALERTS);
}

export function Supervision() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.userId ?? '';

  const [liveCalls, setLiveCalls] = useState<LiveCall[]>([]);
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [streamUp, setStreamUp] = useState(false);
  const [streamDenied, setStreamDenied] = useState(false);
  const [calls, setCalls] = useState<CallRecordSummary[]>([]);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [agentFilter, setAgentFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  // Last-write-wins guard: only the newest in-flight list request may land.
  const fetchSeq = useRef(0);
  const hydratedAlerts = useRef(false);

  // Loading state flips only inside async continuations (lint: no sync
  // setState in effects); the refresh button sets it in its own handler.
  const refreshLog = useCallback(() => {
    if (!userId) return;
    const seq = ++fetchSeq.current;
    listCalls({
      userId,
      flaggedOnly,
      ...(agentFilter ? { agentUserId: agentFilter } : {}),
      limit: 50,
    })
      .then((result) => {
        if (seq !== fetchSeq.current) return; // stale response
        setCalls(result);
        // One-time hydration of the alert feed from persisted tags (only for
        // the unfiltered view so the feed isn't narrowed by filters).
        if (!hydratedAlerts.current && !flaggedOnly && !agentFilter) {
          hydratedAlerts.current = true;
          setAlerts((prev) => {
            const merged = [...prev, ...alertsFromRecords(result)];
            const seen = new Set<string>();
            return merged
              .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
              .sort((a, b) => b.ts - a.ts)
              .slice(0, MAX_ALERTS);
          });
        }
      })
      .catch(() => {
        if (seq === fetchSeq.current) setCalls([]);
      })
      .finally(() => {
        if (seq === fetchSeq.current) setIsLoading(false);
      });
  }, [userId, flaggedOnly, agentFilter]);

  useEffect(() => {
    refreshLog();
  }, [refreshLog]);

  // 1s ticker for live-call durations — runs only while calls are active.
  useEffect(() => {
    if (liveCalls.length === 0) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [liveCalls.length]);

  // Live SSE with real exponential backoff + honest streamUp.
  const refreshRef = useRef(refreshLog);
  useEffect(() => {
    refreshRef.current = refreshLog;
  }, [refreshLog]);

  useEffect(() => {
    if (!userId) return undefined;
    const ac = new AbortController();
    let stopped = false;
    let delay = 1000;

    const onEvent = (event: SupervisorEvent): void => {
      // First event = genuinely connected: reset the backoff ladder.
      delay = 1000;
      if (event.type === 'snapshot') {
        setLiveCalls(event.calls.map((c) => ({ ...c })));
        return;
      }
      if (event.type === 'call_started') {
        setLiveCalls((prev) => [
          ...prev.filter((c) => c.callSid !== event.callSid),
          {
            callSid: event.callSid,
            agentName: event.agentName,
            direction: event.direction,
            startedAt: event.startedAt,
          },
        ]);
        return;
      }
      if (event.type === 'call_ended') {
        setLiveCalls((prev) => prev.filter((c) => c.callSid !== event.callSid));
        refreshRef.current();
        return;
      }
      if (event.type === 'compliance_flag') {
        setAlerts((prev) =>
          [
            {
              id: `${event.callSid}-${event.ts}`,
              callSid: event.callSid,
              agentName: event.agentName,
              phrase: event.phrase,
              rule: event.rule,
              suggestion: event.suggestion,
              ts: event.ts,
            },
            ...prev,
          ].slice(0, MAX_ALERTS),
        );
        return;
      }
      if (event.type === 'emotion_shift') {
        setLiveCalls((prev) =>
          prev.map((c) => (c.callSid === event.callSid ? { ...c, emotion: event.emotion } : c)),
        );
        return;
      }
      if (event.type === 'qa_completed') {
        refreshRef.current();
      }
    };

    const scheduleReconnect = (): void => {
      if (stopped) return;
      const wait = delay;
      delay = Math.min(delay * 2, 15000);
      setTimeout(connect, wait);
    };

    function connect(): void {
      if (stopped) return;
      openSupervisorStream({
        userId,
        onEvent,
        onOpen: () => {
          if (!stopped) setStreamUp(true);
        },
        signal: ac.signal,
      })
        .then(() => {
          // Clean close — reconnect on the current ladder step.
          setStreamUp(false);
          scheduleReconnect();
        })
        .catch((err: unknown) => {
          setStreamUp(false);
          if (stopped || (err as { name?: string })?.name === 'AbortError') return;
          if (err instanceof SupervisorStreamAuthError) {
            setStreamDenied(true); // terminal — no retry loop
            return;
          }
          scheduleReconnect();
        });
    }
    connect();

    return () => {
      stopped = true;
      ac.abort();
    };
  }, [userId]);

  const tagCounts = (record: CallRecordSummary): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const t of record.tags ?? []) counts[t.kind] = (counts[t.kind] ?? 0) + 1;
    return counts;
  };

  /** QA overview computed from the fetched log (no extra endpoint). */
  const qaStats = useMemo(() => {
    const total = calls.length;
    const flagged = calls.filter((c) => c.flagged).length;
    const reviewed = calls.filter((c) => c.qaReview);
    const avgScore =
      reviewed.length > 0
        ? Math.round(
            reviewed.reduce((sum, c) => sum + (c.qaReview?.overallScore ?? 0), 0) /
              reviewed.length,
          )
        : null;
    return { total, flagged, reviewedCount: reviewed.length, avgScore };
  }, [calls]);

  /** Distinct agents present in the current log for the filter dropdown. */
  const agentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of calls) {
      if (c.userId) map.set(c.userId, c.agentName ?? c.userId);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [calls]);

  return (
    <div className="space-y-6">
      {/* LIVE section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Radio
            className={`w-5 h-5 ${streamUp ? 'text-green-500 animate-pulse' : 'text-gray-400'}`}
          />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Live</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {streamDenied ? 'not authorized' : streamUp ? 'streaming' : 'reconnecting…'}
          </span>
        </div>

        {streamDenied ? (
          <div className="flex items-center gap-2 p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/15 text-sm text-red-700 dark:text-red-300">
            <ShieldX className="w-4 h-4 shrink-0" />
            Your account is not authorized for the supervisor stream.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Active calls */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Active calls ({liveCalls.length})
              </h3>
              {liveCalls.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                  No calls in progress.
                </p>
              ) : (
                <div className="space-y-2">
                  {liveCalls.map((c) => (
                    // Gap 10 — click a live call to watch its transcript
                    // stream in real time (SupervisionCallDetail live mode).
                    <button
                      key={c.callSid}
                      onClick={() =>
                        navigate(`/admin/supervision/${encodeURIComponent(c.callSid)}`, {
                          state: {
                            live: true,
                            startedAt: c.startedAt,
                            agentName: c.agentName,
                            direction: c.direction,
                          },
                        })
                      }
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 hover:bg-green-100/60 dark:hover:bg-green-900/25 text-left transition-colors"
                      title={`started ${new Date(c.startedAt).toLocaleTimeString()} — click to watch live`}
                    >
                      <PhoneCall className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {c.agentName ?? 'Unknown agent'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {c.direction} ·{' '}
                          <span className="font-mono">{formatElapsed(c.startedAt, now)}</span>
                        </p>
                      </div>
                      {c.emotion && (
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${EMOTION_CHIP[c.emotion]}`}
                          title={`Prospect sounds ${c.emotion}`}
                        >
                          {c.emotion}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Compliance alert feed */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Compliance alerts
              </h3>
              {alerts.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                  No compliance flags yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {alerts.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/admin/supervision/${encodeURIComponent(a.callSid)}`)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                        a.historic
                          ? 'border-red-100 dark:border-red-900/60 bg-red-50/30 dark:bg-red-900/5 hover:bg-red-50/60 dark:hover:bg-red-900/15'
                          : 'border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/15 hover:bg-red-100/70 dark:hover:bg-red-900/25'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {a.agentName ?? 'Agent'}: “{a.phrase}”
                        </span>
                        <span className="ml-auto text-[11px] text-gray-500 shrink-0">
                          {formatWhen(a.ts)}
                        </span>
                      </div>
                      <p className="text-xs text-red-700 dark:text-red-300 mt-1">{a.rule}</p>
                      {a.suggestion && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                          Suggest: {a.suggestion}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* QA overview stats (from the currently-filtered log) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Recorded calls', value: String(qaStats.total) },
          {
            label: 'Flagged',
            value:
              qaStats.total > 0
                ? `${qaStats.flagged} (${Math.round((qaStats.flagged / qaStats.total) * 100)}%)`
                : '0',
            tone: qaStats.flagged > 0 ? 'text-red-600 dark:text-red-400' : undefined,
          },
          { label: 'QA reviewed', value: `${qaStats.reviewedCount}/${qaStats.total}` },
          {
            label: 'Avg QA score',
            value: qaStats.avgScore !== null ? String(qaStats.avgScore) : '—',
            tone:
              qaStats.avgScore === null
                ? undefined
                : qaStats.avgScore >= 80
                  ? 'text-green-600 dark:text-green-400'
                  : qaStats.avgScore >= 60
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400',
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3"
          >
            <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {s.label}
            </p>
            <p className={`text-xl font-bold ${s.tone ?? 'text-gray-900 dark:text-white'}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Call Log */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Call log</h2>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => setFlaggedOnly(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            Flagged only
          </label>
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="text-sm px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            <option value="">All agents</option>
            {agentOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setIsLoading(true);
              refreshLog();
            }}
            className="ml-auto p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {calls.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic py-6 text-center">
            {isLoading ? 'Loading…' : 'No recorded calls yet.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {calls.map((c) => {
              const counts = tagCounts(c);
              return (
                <button
                  key={c.callSid}
                  onClick={() => navigate(`/admin/supervision/${c.callSid}`)}
                  className="w-full flex items-center gap-3 py-3 px-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatWhen(c.startedAt)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {c.agentName ?? c.userId ?? '—'} · {c.direction} · {c.durationSec}s
                      </span>
                      {c.flagged && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400">
                          <AlertTriangle className="w-3 h-3" /> FLAGGED
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {Object.entries(counts).map(([kind, n]) => (
                        <span
                          key={kind}
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TAG_CHIP_TONES[kind] ?? TAG_CHIP_TONES.note}`}
                        >
                          {kind} · {n}
                        </span>
                      ))}
                    </div>
                  </div>
                  {c.qaReview ? (
                    <span
                      className={`text-sm font-bold px-2.5 py-1 rounded-lg ${
                        c.qaReview.overallScore >= 80
                          ? 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400'
                          : c.qaReview.overallScore >= 60
                            ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400'
                            : 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400'
                      }`}
                    >
                      QA {c.qaReview.overallScore}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-gray-500">not reviewed</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
