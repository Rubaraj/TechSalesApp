/**
 * Training simulator — a trainee practices a sales call against an AI
 * prospect persona (Deepgram Voice Agent). The conversation runs through
 * the SAME live pipeline as real calls: the live transcript + compliance/
 * coaching/emotion chips stream in via the analyze SSE (cloned from the
 * supervisor live view), and after hangup the persisted session can be
 * scored against the QA rubric ("practice scorecard").
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GraduationCap,
  Mic,
  PhoneOff,
  Loader2,
  AlertTriangle,
  Info,
  Sparkles,
  Headphones,
  Volume2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { callService } from '../../services/callService';
import { getCall, runQaReview } from '../../services/supervisorService';
import {
  fetchPersonas,
  simulatorWsUrl,
  type SimulatorPersonaCard,
} from '../../services/simulatorService';
import { startSimulatorAudio, type SimulatorAudioHandle } from '../../services/simulatorAudio';
import type { CallRecordDetail, CallTag, QaReview } from '../../types/supervisor';
import type { TranscriptChunk, ProspectEmotion } from '../../types/call';
import {
  TAG_INLINE_TONES,
  TAG_ICONS,
  EMOTION_CHIP,
  formatElapsed,
  scoreTone,
} from '../admin/supervisionUi';

type Phase =
  | { name: 'pick' }
  | { name: 'connecting' }
  | { name: 'live' }
  | { name: 'loadingRecord' }
  | { name: 'done'; record: CallRecordDetail }
  | { name: 'noRecord' }
  | { name: 'error'; message: string };

function tagLabel(tag: CallTag): string {
  if (tag.kind === 'compliance') {
    return `${String(tag.data.rule ?? 'Compliance')} — “${String(tag.data.phrase ?? '')}”`;
  }
  if (tag.kind === 'coaching') return `Coach tip: ${String(tag.data.tip ?? '')}`;
  if (tag.kind === 'emotion') {
    return `Emotion shift: ${String(tag.data.from ?? '?')} → ${String(tag.data.to ?? '?')}`;
  }
  if (tag.kind === 'note') return `${String(tag.data.category ?? 'note')}: ${String(tag.data.text ?? '')}`;
  if (tag.kind === 'info') return `Info card: ${String(tag.data.title ?? tag.data.topic ?? '')}`;
  const keys = Object.keys(tag.data).filter((k) => tag.data[k] !== undefined);
  return `Extracted: ${keys.join(', ')}`;
}

export function TrainingSimulator() {
  const { user } = useAuth();
  const userId = user?.userId ?? '';

  const [personas, setPersonas] = useState<SimulatorPersonaCard[]>([]);
  const [simEnabled, setSimEnabled] = useState(true);
  const [phase, setPhase] = useState<Phase>({ name: 'pick' });
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);

  // Live-session state (clone of the supervisor live-view shape).
  const [simSid, setSimSid] = useState<string | null>(null);
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [liveTags, setLiveTags] = useState<CallTag[]>([]);
  const [flaggedChunkIds, setFlaggedChunkIds] = useState<Set<string>>(new Set());
  const [liveEmotion, setLiveEmotion] = useState<ProspectEmotion | null>(null);
  const [personaSpeaking, setPersonaSpeaking] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [now, setNow] = useState<number>(() => Date.now());

  // Post-session scorecard.
  const [scorecard, setScorecard] = useState<QaReview | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<SimulatorAudioHandle | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  const endedRef = useRef(false);
  const prevEmotionRef = useRef<ProspectEmotion | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchPersonas()
      .then((d) => {
        setPersonas(d.personas);
        setSimEnabled(d.enabled);
      })
      .catch(() => setPersonas([]));
  }, []);

  useEffect(() => {
    if (phase.name !== 'live') return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase.name]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chunks.length, liveTags.length]);

  const cleanupSession = useCallback((): void => {
    audioRef.current?.stop();
    audioRef.current = null;
    try {
      wsRef.current?.close();
    } catch {
      // already closed
    }
    wsRef.current = null;
    sseAbortRef.current?.abort();
    sseAbortRef.current = null;
  }, []);

  useEffect(() => () => cleanupSession(), [cleanupSession]);

  const pollRecord = useCallback(
    async (sid: string): Promise<void> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = await getCall(userId, sid);
        if (result.record) {
          setPhase({ name: 'done', record: result.record });
          return;
        }
        if (result.status !== 404) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
      setPhase({ name: 'noRecord' });
    },
    [userId],
  );

  const finishSession = useCallback(
    (sid: string | null): void => {
      if (endedRef.current) return;
      endedRef.current = true;
      cleanupSession();
      if (sid) {
        setPhase({ name: 'loadingRecord' });
        void pollRecord(sid);
      } else {
        setPhase({ name: 'pick' });
      }
    },
    [cleanupSession, pollRecord],
  );

  /** Attach the analyze SSE for live transcript + chips (same channel the
   *  supervisor live view uses). */
  const attachSse = useCallback(
    (sid: string): void => {
      const controller = new AbortController();
      sseAbortRef.current = controller;
      void callService
        .openAnalyzeStream({
          callSid: sid,
          userId,
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === 'transcript') {
              setChunks((prev) => {
                const i = prev.findIndex((c) => c.id === event.chunk.id);
                if (i === -1) return [...prev, event.chunk];
                const copy = [...prev];
                copy[i] = event.chunk;
                return copy;
              });
              return;
            }
            if (event.type === 'actions') {
              const ids: string[] = [];
              const tags: CallTag[] = [];
              for (const a of event.actions) {
                if (a.type !== 'compliance_flag') continue;
                if (a.chunkId) ids.push(a.chunkId);
                tags.push({
                  kind: 'compliance',
                  ts: Date.now(),
                  data: { phrase: a.phrase, rule: a.rule, suggestion: a.suggestion },
                });
              }
              if (ids.length > 0) setFlaggedChunkIds((prev) => new Set([...prev, ...ids]));
              if (tags.length > 0) setLiveTags((prev) => [...prev, ...tags]);
              return;
            }
            if (event.type === 'coaching') {
              setLiveTags((prev) => [
                ...prev,
                { kind: 'coaching', ts: event.ts, data: { tip: event.tip, focus: event.focus } },
              ]);
              return;
            }
            if (event.type === 'emotion') {
              setLiveEmotion(event.emotion);
              const prev = prevEmotionRef.current;
              if (event.emotion !== prev) {
                prevEmotionRef.current = event.emotion;
                setLiveTags((tags) => [
                  ...tags,
                  { kind: 'emotion', ts: event.ts, data: { from: prev, to: event.emotion } },
                ]);
              }
              return;
            }
          },
        })
        .catch(() => {
          // Stream errors surface via the WS 'ended'/'error' path instead.
        });
    },
    [userId],
  );

  const startSession = useCallback(
    async (personaId: string): Promise<void> => {
      if (!userId) return;
      setSelectedPersona(personaId);
      setPhase({ name: 'connecting' });
      endedRef.current = false;
      setChunks([]);
      setLiveTags([]);
      setFlaggedChunkIds(new Set());
      setLiveEmotion(null);
      prevEmotionRef.current = null;
      setScorecard(null);
      setScoreError(null);
      setSimSid(null);

      let sessionSid: string | null = null;
      try {
        // Mic + audio first (user gesture context for the AudioContext).
        const ws = new WebSocket(simulatorWsUrl(userId, personaId));
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        const audio = await startSimulatorAudio((frame) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(frame);
        });
        audioRef.current = audio;

        ws.onmessage = (e: MessageEvent) => {
          if (e.data instanceof ArrayBuffer) {
            audio.playFrame(e.data);
            return;
          }
          try {
            const msg = JSON.parse(String(e.data)) as {
              type?: string;
              callSid?: string;
              speaking?: boolean;
              message?: string;
            };
            if (msg.type === 'session' && msg.callSid) {
              sessionSid = msg.callSid;
              setSimSid(msg.callSid);
              setStartedAt(Date.now());
              attachSse(msg.callSid);
              setPhase({ name: 'live' });
              return;
            }
            if (msg.type === 'barge_in') {
              audio.flushPlayback();
              return;
            }
            if (msg.type === 'agent_state') {
              setPersonaSpeaking(msg.speaking === true);
              return;
            }
            if (msg.type === 'error') {
              cleanupSession();
              endedRef.current = true;
              setPhase({ name: 'error', message: msg.message ?? 'Voice agent error' });
              return;
            }
            if (msg.type === 'ended') {
              finishSession(sessionSid);
              return;
            }
          } catch {
            // ignore malformed messages
          }
        };
        ws.onclose = () => finishSession(sessionSid);
        ws.onerror = () => finishSession(sessionSid);
      } catch (err) {
        cleanupSession();
        endedRef.current = true;
        setPhase({
          name: 'error',
          message:
            err instanceof Error && err.name === 'NotAllowedError'
              ? 'Microphone access was denied — allow the mic and try again.'
              : 'Could not start the practice session.',
        });
      }
    },
    [userId, attachSse, cleanupSession, finishSession],
  );

  const endSession = useCallback((): void => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'end' }));
    } else {
      finishSession(simSid);
    }
  }, [finishSession, simSid]);

  const runScorecard = useCallback(async (): Promise<void> => {
    if (phase.name !== 'done') return;
    setIsScoring(true);
    setScoreError(null);
    const result = await runQaReview(userId, phase.record.callSid);
    setIsScoring(false);
    if ('error' in result) setScoreError(result.error);
    else setScorecard(result.scorecard);
  }, [phase, userId]);

  // ---------------------------------------------------------------------------

  if (phase.name === 'pick') {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-orange-600" /> Practice a call
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Pick a prospect persona and have a real voice conversation. Everything works
            exactly like a live call — compliance flags, coaching tips, emotion tracking —
            and afterwards you can score your practice session against the QA rubric.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1.5">
            <Headphones className="w-3.5 h-3.5" /> Use headphones for the best experience.
          </p>
        </div>
        {!simEnabled && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300">
            The training simulator is not enabled on this server.
          </div>
        )}
        <div className="grid sm:grid-cols-3 gap-4">
          {personas.map((p) => (
            <button
              key={p.id}
              disabled={!simEnabled || !userId}
              onClick={() => void startSession(p.id)}
              className="text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:border-orange-400 dark:hover:border-orange-500 hover:shadow-md transition-all disabled:opacity-50"
            >
              <p className="font-semibold text-gray-900 dark:text-white">{p.label}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{p.description}</p>
              <span className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-orange-600 dark:text-orange-400">
                <Mic className="w-4 h-4" /> Start practice
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase.name === 'connecting') {
    return (
      <div className="py-16 text-center text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
        Connecting — allow microphone access if prompted…
      </div>
    );
  }

  if (phase.name === 'live') {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              Practice session
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Live
              </span>
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {personas.find((p) => p.id === selectedPersona)?.label ?? 'Prospect'} ·{' '}
              <span className="font-mono">{formatElapsed(startedAt, now)}</span>
              {liveEmotion && (
                <span
                  className={`ml-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${EMOTION_CHIP[liveEmotion]}`}
                >
                  {liveEmotion}
                </span>
              )}
              {personaSpeaking && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
                  <Volume2 className="w-3.5 h-3.5" /> speaking
                </span>
              )}
            </p>
          </div>
          <button
            onClick={endSession}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium bg-red-600 hover:bg-red-500 transition-colors"
          >
            <PhoneOff className="w-4 h-4" /> End session
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div ref={scrollRef} className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {chunks.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                Say hello — the prospect will answer. Lines appear as you talk.
              </p>
            )}
            {chunks.map((chunk, i) => {
              const flagged = flaggedChunkIds.has(chunk.id);
              const anchored = liveTags.filter((t) => {
                const prevTs = chunks[i]?.timestamp ?? 0;
                const nextTs = chunks[i + 1]?.timestamp ?? Infinity;
                return t.ts >= prevTs && t.ts < nextTs;
              });
              return (
                <div key={chunk.id}>
                  <div
                    className={`flex gap-2 text-sm ${
                      flagged ? 'rounded-lg bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 -mx-1.5' : ''
                    }`}
                  >
                    <span
                      className={`font-bold shrink-0 ${
                        chunk.speaker === 'agent'
                          ? 'text-orange-600 dark:text-orange-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {chunk.speaker === 'agent' ? 'You' : 'Prospect'}:
                    </span>
                    <span className="text-gray-800 dark:text-gray-200">
                      {chunk.text}
                      {flagged && (
                        <AlertTriangle className="inline w-3.5 h-3.5 ml-1.5 -mt-0.5 text-amber-600 dark:text-amber-400" />
                      )}
                    </span>
                  </div>
                  {anchored.map((tag, ti) => {
                    const Icon = TAG_ICONS[tag.kind] ?? Info;
                    return (
                      <div
                        key={ti}
                        className={`flex items-start gap-1.5 ml-10 mt-1 px-2.5 py-1.5 rounded-lg border text-xs ${TAG_INLINE_TONES[tag.kind] ?? TAG_INLINE_TONES.note}`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
                        <span>{tagLabel(tag)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (phase.name === 'loadingRecord') {
    return (
      <div className="py-16 text-center text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
        Wrapping up your session…
      </div>
    );
  }

  if (phase.name === 'noRecord') {
    return (
      <div className="py-16 text-center text-gray-500 dark:text-gray-400 space-y-3">
        <p>No conversation captured — looks like nothing was said. Try again!</p>
        <button
          onClick={() => setPhase({ name: 'pick' })}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white transition-colors"
        >
          Back to personas
        </button>
      </div>
    );
  }

  if (phase.name === 'error') {
    return (
      <div className="py-16 text-center text-gray-500 dark:text-gray-400 space-y-3">
        <AlertTriangle className="w-6 h-6 mx-auto text-amber-500" />
        <p>{phase.message}</p>
        <button
          onClick={() => setPhase({ name: 'pick' })}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white transition-colors"
        >
          Back to personas
        </button>
      </div>
    );
  }

  // phase 'done' — session record + practice scorecard.
  const record = phase.record;
  const qa = scorecard ?? record.qaReview ?? null;
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Practice session complete
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {personas.find((p) => p.id === selectedPersona)?.label ?? 'Prospect'} ·{' '}
            {record.durationSec}s · {record.lines.length} lines
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPhase({ name: 'pick' })}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            New session
          </button>
          <button
            onClick={() => void runScorecard()}
            disabled={isScoring}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium bg-orange-600 hover:bg-orange-500 transition-colors disabled:opacity-60"
          >
            {isScoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isScoring ? 'Scoring…' : qa ? 'Re-run scorecard' : 'Run practice scorecard'}
          </button>
        </div>
      </div>

      {scoreError && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          {scoreError}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Transcript
          </h3>
          <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
            {record.lines.map((line, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span
                  className={`font-bold shrink-0 ${
                    line.speaker === 'agent'
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {line.speaker === 'agent' ? 'You' : 'Prospect'}:
                </span>
                <span className="text-gray-800 dark:text-gray-200">{line.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Practice scorecard
          </h3>
          {!qa ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic py-8 text-center">
              Run the scorecard to see how you did against the QA rubric.
            </p>
          ) : (
            <PracticeScorecard qa={qa} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Simplified scorecard (rubric-driven, mirrors the supervisor view). */
function PracticeScorecard({ qa }: { qa: QaReview }): React.JSX.Element {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className={`text-5xl font-bold ${scoreTone(qa.overallScore)}`}>{qa.overallScore}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">overall / 100</div>
      </div>
      <div className="space-y-3">
        {Object.entries(qa.dimensions).map(([name, dim]) => (
          <div key={name}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-gray-900 dark:text-white capitalize">
                {qa.dimensionLabels?.[name] ?? name}
              </span>
              <span className="font-bold text-gray-900 dark:text-white">{dim.score}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700">
              <div
                className={`h-2 rounded-full ${dim.score >= 80 ? 'bg-green-500' : dim.score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${dim.score}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{dim.evidence}</p>
          </div>
        ))}
      </div>
      {qa.coachingPoints.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            Coaching points
          </h4>
          <ul className="space-y-1.5">
            {qa.coachingPoints.map((p, i) => (
              <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                • {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
