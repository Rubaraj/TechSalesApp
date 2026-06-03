/**
 * Phase 4 design — Call section embedded in AtlasPanel's top half.
 *
 * Restyled to use the dark atlas-* token set so the call surface reads
 * as a continuation of the Atlas panel (single unified copilot) rather
 * than a separate light card glued on top.
 *
 * Returns null when no call is active.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, AlertTriangle, Radio } from 'lucide-react';
import { useCallContext } from '../../context/CallContext';
import { useCallRuntime } from './CallRuntime';
import { useCallAnalysis } from '../../hooks/useCallAnalysis';
import { CallWaveform } from './CallWaveform';
import { Dialer } from './Dialer';
import { TranscriptBubble } from './TranscriptBubble';
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

  const showIncomingRing = state.direction === 'inbound' && state.callStatus === 'ringing';
  const showDialer = state.callStatus === 'idle' && !showIncomingRing;
  const error = twilioCall.error;

  const headerTitle = showIncomingRing
    ? state.incomingCaller?.leadName ?? state.incomingCaller?.number ?? 'Incoming…'
    : callInProgress
      ? state.dialedNumber
        ? state.dialedNumber
        : 'Call in progress'
      : 'Dialer';

  const handleEnd = (): void => {
    void twilioCall.hangup();
  };

  return (
    <div
      className="flex-1 min-h-0 flex flex-col"
      style={{
        background: 'var(--color-atlas-bg)',
        color: 'var(--color-atlas-fg)',
        borderBottom: '1px solid var(--color-atlas-border)',
      }}
    >
      {/* Header — mic / dialer status + mute / end */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ borderBottom: '1px solid var(--color-atlas-border)' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Radio
            className="w-4 h-4 shrink-0"
            style={{
              color: isListening
                ? 'var(--color-exl-orange-bright)'
                : 'var(--color-atlas-fg-subtle)',
            }}
          />
          <div className="min-w-0 leading-tight">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.08em]"
              style={{ color: 'var(--color-atlas-fg-muted)' }}
            >
              {showDialer ? 'Dialer' : showIncomingRing ? 'Incoming' : 'On call'}
            </p>
            <p
              className="text-[13.5px] font-semibold truncate"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-atlas-fg)',
              }}
            >
              {headerTitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {callInProgress && (
            <span
              className="px-2 py-0.5 rounded-md text-[11px]"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-atlas-fg-muted)',
                background: 'var(--color-atlas-surface-3)',
              }}
            >
              {formatDuration(durationMs)}
            </span>
          )}
          {state.callStatus === 'connected' && (
            <button
              onClick={() => twilioCall.setMute(!state.isMuted)}
              className="p-1.5 rounded-md transition-colors"
              style={{
                background: state.isMuted ? 'rgba(255,107,107,0.16)' : 'transparent',
                color: state.isMuted ? '#ff6b6b' : 'var(--color-atlas-fg-muted)',
              }}
              onMouseEnter={(e) => {
                if (!state.isMuted)
                  e.currentTarget.style.background = 'var(--color-atlas-surface-3)';
              }}
              onMouseLeave={(e) => {
                if (!state.isMuted) e.currentTarget.style.background = 'transparent';
              }}
              aria-label={state.isMuted ? 'Unmute' : 'Mute'}
              title={state.isMuted ? 'Unmute agent mic' : 'Mute agent mic'}
            >
              {state.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
          {callInProgress && !showIncomingRing && (
            <button
              onClick={handleEnd}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-white transition-colors"
              style={{ background: '#dc2626' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#b91c1c')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#dc2626')}
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
        <div
          className="mx-3 mt-2 p-2 rounded-md text-xs flex gap-2"
          style={{
            background: 'rgba(255,107,107,0.10)',
            border: '1px solid rgba(255,107,107,0.35)',
            color: '#ff6b6b',
          }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {showIncomingRing && <IncomingCallView />}

      {showDialer && (
        <Dialer dial={twilioCall.dial} isDialing={twilioCall.isDialing} error={twilioCall.error} />
      )}

      {!showDialer && !showIncomingRing && visibleComplianceFlags.length > 0 && (
        <div
          className="px-3 py-2 space-y-1.5 max-h-32 overflow-y-auto"
          style={{
            borderBottom: '1px solid rgba(255,107,107,0.35)',
            background: 'rgba(255,107,107,0.06)',
          }}
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
          className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-2"
          role="log"
          aria-live="polite"
          aria-label="Live transcript"
          style={{ scrollbarWidth: 'thin' }}
        >
          <p
            className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1"
            style={{ color: 'var(--color-atlas-fg-subtle)' }}
          >
            Live Transcript
          </p>
          {state.transcript.length === 0 && (
            <p
              className="text-xs italic"
              style={{ color: 'var(--color-atlas-fg-muted)' }}
            >
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
              <span
                className="text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ color: 'var(--color-atlas-fg-subtle)' }}
              >
                listening
              </span>
            </div>
          )}
        </div>
      )}

      {!showDialer && !showIncomingRing && <EntitySummary />}
    </div>
  );
}
