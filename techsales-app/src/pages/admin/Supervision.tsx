/**
 * Ambient Supervisor CoPilot — admin Supervision tab.
 *
 * Top: LIVE section — active calls + a scrolling compliance-alert feed via
 * the supervisor SSE stream (auto-reconnect with backoff).
 * Below: Call Log — persisted call records with tag chips, flagged badges,
 * and QA scores; rows open the transcript/QA detail page.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radio,
  PhoneCall,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  listCalls,
  openSupervisorStream,
} from '../../services/supervisorService';
import type { CallRecordSummary, SupervisorEvent } from '../../types/supervisor';

interface LiveCall {
  callSid: string;
  agentName?: string;
  direction: string;
  startedAt: number;
}

interface LiveAlert {
  id: string;
  agentName?: string;
  phrase: string;
  rule: string;
  suggestion?: string;
  ts: number;
}

const TAG_TONES: Record<string, string> = {
  compliance: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400',
  entity: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400',
  info: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400',
  note: 'text-gray-600 bg-gray-100 dark:bg-gray-700/40 dark:text-gray-300',
};

export function Supervision() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.userId ?? '';

  const [liveCalls, setLiveCalls] = useState<LiveCall[]>([]);
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [streamUp, setStreamUp] = useState(false);
  const [calls, setCalls] = useState<CallRecordSummary[]>([]);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Loading state flips only inside async continuations (lint: no sync
  // setState in effects); the refresh button sets it in its own handler.
  const refreshLog = useCallback(() => {
    if (!userId) return;
    listCalls({ userId, flaggedOnly, limit: 50 })
      .then(setCalls)
      .catch(() => setCalls([]))
      .finally(() => setIsLoading(false));
  }, [userId, flaggedOnly]);

  useEffect(() => {
    refreshLog();
  }, [refreshLog]);

  // Live SSE with reconnect + backoff.
  const refreshRef = useRef(refreshLog);
  useEffect(() => {
    refreshRef.current = refreshLog;
  }, [refreshLog]);

  useEffect(() => {
    if (!userId) return;
    const ac = new AbortController();
    let backoff = 1000;
    let stopped = false;

    const onEvent = (event: SupervisorEvent): void => {
      if (event.type === 'snapshot') {
        setLiveCalls(event.calls.map((c) => ({ ...c })));
        return;
      }
      if (event.type === 'call_started') {
        setLiveCalls((prev) => [
          ...prev.filter((c) => c.callSid !== event.callSid),
          { callSid: event.callSid, agentName: event.agentName, direction: event.direction, startedAt: event.startedAt },
        ]);
        return;
      }
      if (event.type === 'call_ended') {
        setLiveCalls((prev) => prev.filter((c) => c.callSid !== event.callSid));
        refreshRef.current();
        return;
      }
      if (event.type === 'compliance_flag') {
        setAlerts((prev) => [
          {
            id: `${event.callSid}-${event.ts}`,
            agentName: event.agentName,
            phrase: event.phrase,
            rule: event.rule,
            suggestion: event.suggestion,
            ts: event.ts,
          },
          ...prev,
        ].slice(0, 30));
        return;
      }
      if (event.type === 'qa_completed') {
        refreshRef.current();
      }
    };

    const connect = (): void => {
      if (stopped) return;
      openSupervisorStream({ userId, onEvent, signal: ac.signal })
        .then(() => {
          setStreamUp(false);
          if (!stopped) setTimeout(connect, backoff);
        })
        .catch(() => {
          setStreamUp(false);
          if (!stopped) {
            setTimeout(connect, backoff);
            backoff = Math.min(backoff * 2, 15000);
          }
        });
      setStreamUp(true);
      backoff = 1000;
    };
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

  return (
    <div className="space-y-6">
      {/* LIVE section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Radio className={`w-5 h-5 ${streamUp ? 'text-green-500 animate-pulse' : 'text-gray-400'}`} />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Live</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {streamUp ? 'streaming' : 'reconnecting…'}
          </span>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Active calls */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              Active calls ({liveCalls.length})
            </h3>
            {liveCalls.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">No calls in progress.</p>
            ) : (
              <div className="space-y-2">
                {liveCalls.map((c) => (
                  <div
                    key={c.callSid}
                    className="flex items-center gap-3 p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10"
                  >
                    <PhoneCall className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {c.agentName ?? 'Unknown agent'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {c.direction} · started {new Date(c.startedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
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
                No live compliance flags.
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/15"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {a.agentName ?? 'Agent'}: “{a.phrase}”
                      </span>
                      <span className="ml-auto text-[11px] text-gray-500 shrink-0">
                        {new Date(a.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-red-700 dark:text-red-300 mt-1">{a.rule}</p>
                    {a.suggestion && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        Suggest: {a.suggestion}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Call Log */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
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
                        {new Date(c.startedAt).toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-500">
                        {c.userId ?? '—'} · {c.direction} · {c.durationSec}s
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
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TAG_TONES[kind] ?? TAG_TONES.note}`}
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
