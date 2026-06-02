/**
 * Phase 4 (UI merge) — Extracted body of the old `CallPanel`. Renders the
 * dialer / transcript / compliance alerts / incoming-call view without its
 * own right-docked `<aside>` wrapper, so `AtlasPanel` can embed it in the
 * top half of the unified panel.
 *
 * The visual semantics are preserved exactly — only the outer wrapper is
 * gone. Lifecycle hooks (useCallAnalysis SSE subscription, compliance fade
 * timers, transcript auto-scroll) all live here so the section behaves
 * identically whether mounted standalone or embedded.
 *
 * Returns null when no call is active.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, AlertTriangle } from 'lucide-react';
import { useCallContext } from '../../context/CallContext';
import { useCallRuntime } from './CallRuntime';
import { useCallAnalysis } from '../../hooks/useCallAnalysis';
import { CallWaveform } from './CallWaveform';
import { Dialer } from './Dialer';
import { TranscriptBubble } from './TranscriptBubble';
import { AudioDeviceSelector } from './AudioDeviceSelector';
import { ComplianceAlert } from './ComplianceAlert';
import { EntitySummary } from './EntitySummary';
import { IncomingCallView } from './IncomingCallView';

const COMPLIANCE_FADE_MS = 5_000;

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function CallSection(): React.JSX.Element | null {
  const { state } = useCallContext();

  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!state.isCallActive) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.isCallActive]);

  const twilioCall = useCallRuntime();
  // SSE consumer for diarized transcript chunks (Deepgram → backend → SSE).
  useCallAnalysis();

  const transcriptRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.transcript.length]);

  const durationMs = useMemo(
    () => (state.callStartTime ? now - state.callStartTime : 0),
    [now, state.callStartTime],
  );

  // Compliance flag fade-then-filter (kept from CallPanel).
  const [hiddenFlags, setHiddenFlags] = useState<{
    callId: string | null;
    ids: Set<string>;
  }>(() => ({ callId: null, ids: new Set() }));
  const activeHiddenIds = useMemo(
    () => (hiddenFlags.callId === state.callId ? hiddenFlags.ids : new Set<string>()),
    [hiddenFlags, state.callId],
  );
  useEffect(() => {
    const timers: number[] = [];
    for (const flag of state.complianceFlags) {
      if (!flag.dismissed || activeHiddenIds.has(flag.id)) continue;
      const t = window.setTimeout(() => {
        setHiddenFlags((prev) => {
          const sameCall = prev.callId === state.callId;
          const ids = sameCall ? prev.ids : new Set<string>();
          if (ids.has(flag.id)) return prev;
          const next = new Set(ids);
          next.add(flag.id);
          return { callId: state.callId, ids: next };
        });
      }, COMPLIANCE_FADE_MS);
      timers.push(t);
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [state.complianceFlags, state.callId, activeHiddenIds]);

  const visibleComplianceFlags = useMemo(
    () => state.complianceFlags.filter((f) => !activeHiddenIds.has(f.id)),
    [state.complianceFlags, activeHiddenIds],
  );

  if (!state.isCallActive) return null;

  const callInProgress =
    state.callStatus === 'connecting' ||
    state.callStatus === 'ringing' ||
    state.callStatus === 'connected' ||
    state.callStatus === 'ending';
  const isListening = state.callStatus === 'connected';

  const showIncomingRing =
    state.direction === 'inbound' && state.callStatus === 'ringing';
  const showDialer = state.callStatus === 'idle' && !showIncomingRing;
  const error = twilioCall.error;

  const headerTitle = showIncomingRing
    ? state.incomingCaller?.leadName ?? state.incomingCaller?.number ?? 'Incoming…'
    : callInProgress
      ? state.dialedNumber
        ? `Call · ${state.dialedNumber}`
        : 'Call in progress'
      : 'Dialer';

  const handleEnd = (): void => {
    void twilioCall.hangup();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      {/* Header — dialer status + mute/end controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 min-w-0">
          <Mic
            className={`w-4 h-4 shrink-0 ${
              isListening
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-400'
            }`}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {headerTitle}
            </p>
            {callInProgress && (
              <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
                {formatDuration(durationMs)} · {state.callStatus}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {state.callStatus === 'connected' && (
            <button
              onClick={() => twilioCall.setMute(!state.isMuted)}
              className={`p-1.5 rounded-md transition-colors ${
                state.isMuted
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
              aria-label={state.isMuted ? 'Unmute' : 'Mute'}
              title={state.isMuted ? 'Unmute agent mic' : 'Mute agent mic'}
            >
              {state.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
          {callInProgress && !showIncomingRing && (
            <button
              onClick={handleEnd}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
              aria-label="End call"
              title="End call"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              End
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-2 p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {showIncomingRing && <IncomingCallView />}

      {showDialer && (
        <Dialer
          dial={twilioCall.dial}
          isDialing={twilioCall.isDialing}
          error={twilioCall.error}
        />
      )}

      {!showDialer && !showIncomingRing && visibleComplianceFlags.length > 0 && (
        <div
          className="border-b border-red-200 dark:border-red-800/50 px-3 py-2 space-y-1.5 max-h-32 overflow-y-auto bg-red-50/50 dark:bg-red-900/10"
          role="region"
          aria-label="Compliance alerts"
        >
          {visibleComplianceFlags.map((flag) => (
            <ComplianceAlert key={flag.id} flag={flag} />
          ))}
        </div>
      )}

      {!showDialer && !showIncomingRing && (
        <div
          ref={transcriptRef}
          className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2"
          role="log"
          aria-live="polite"
          aria-label="Live transcript"
        >
          <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
            Live Transcript
          </p>
          {state.transcript.length === 0 && (
            <p className="text-xs italic text-gray-500 dark:text-gray-400">
              {isListening
                ? 'Listening… start speaking and the transcript will appear here.'
                : `Call ${state.callStatus}…`}
            </p>
          )}
          {state.transcript.map((c) => {
            const offsetMs =
              state.callStartTime !== null ? c.timestamp - state.callStartTime : 0;
            return (
              <TranscriptBubble
                key={c.id}
                chunk={c}
                diarized
                offsetLabel={formatDuration(offsetMs)}
              />
            );
          })}
          {isListening && (
            <div className="pt-1 flex items-center gap-2">
              <CallWaveform isActive={isListening} />
              <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
                listening
              </span>
            </div>
          )}
        </div>
      )}

      {isListening && <AudioDeviceSelector />}
      {!showDialer && !showIncomingRing && <EntitySummary />}
    </div>
  );
}
