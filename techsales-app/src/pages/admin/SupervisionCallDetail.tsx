/**
 * Supervision call detail — transcript viewer with inline tag markers +
 * on-demand QA review scorecard panel. Distinguishes not-found (call may
 * still be persisting) from server errors, both with Retry; re-running a
 * QA review requires an arm-then-confirm second click.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getCall, runQaReview } from '../../services/supervisorService';
import type { CallRecordDetail, CallTag, QaReview } from '../../types/supervisor';
import { TAG_INLINE_TONES, TAG_ICONS, formatWhen, scoreTone } from './supervisionUi';

function tagLabel(tag: CallTag): string {
  if (tag.kind === 'compliance') {
    return `${String(tag.data.rule ?? 'Compliance')} — “${String(tag.data.phrase ?? '')}”`;
  }
  if (tag.kind === 'info') return `Info card: ${String(tag.data.title ?? tag.data.topic ?? '')}`;
  if (tag.kind === 'note') return `${String(tag.data.category ?? 'note')}: ${String(tag.data.text ?? '')}`;
  if (tag.kind === 'emotion') {
    return `Emotion shift: ${String(tag.data.from ?? '?')} → ${String(tag.data.to ?? '?')}`;
  }
  if (tag.kind === 'coaching') return `Coach tip: ${String(tag.data.tip ?? '')}`;
  const keys = Object.keys(tag.data).filter((k) => tag.data[k] !== undefined);
  return `Extracted: ${keys.join(', ')}`;
}

/** Map review-endpoint failures to operator-friendly copy. */
function reviewErrorCopy(error: string, status: number): string {
  if (status === 409) return 'A QA review is already running for this call — give it a few seconds.';
  if (status === 503) return 'The AI provider is not configured on the backend (stub mode).';
  if (error.includes('401')) {
    return 'LLM provider unreachable (auth failed) — check the OpenRouter key / start the VM.';
  }
  // Backend already returns user-friendly copy — show it as-is.
  return error;
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; record: CallRecordDetail }
  | { phase: 'missing' }
  | { phase: 'error' };

export function SupervisionCallDetail() {
  const { callSid } = useParams<{ callSid: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.userId ?? '';

  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [rerunArmed, setRerunArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRecord = useCallback(() => {
    if (!userId || !callSid) return;
    getCall(userId, callSid).then((result) => {
      if (result.record) {
        setLoad({ phase: 'ready', record: result.record });
      } else {
        setLoad(result.status === 404 ? { phase: 'missing' } : { phase: 'error' });
      }
    });
  }, [userId, callSid]);

  useEffect(() => {
    fetchRecord();
  }, [fetchRecord]);

  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    },
    [],
  );

  const record = load.phase === 'ready' ? load.record : null;
  const qa = record?.qaReview ?? null;

  const startTs = record?.lines[0]?.ts ?? 0;
  const mmss = (ts: number): string => {
    const sec = Math.max(0, Math.round((ts - startTs) / 1000));
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  };

  /** Tags anchored to the nearest preceding transcript line by ts. */
  const tagsByLineIndex = useMemo(() => {
    const map = new Map<number, CallTag[]>();
    if (!record) return map;
    for (const tag of record.tags) {
      let idx = 0;
      for (let i = 0; i < record.lines.length; i++) {
        if (record.lines[i].ts <= tag.ts) idx = i;
        else break;
      }
      const list = map.get(idx) ?? [];
      list.push(tag);
      map.set(idx, list);
    }
    return map;
  }, [record]);

  const runReview = async (): Promise<void> => {
    if (!userId || !callSid) return;
    // Existing scorecard → require a second click within 3s to overwrite.
    if (qa && !rerunArmed) {
      setRerunArmed(true);
      armTimer.current = setTimeout(() => setRerunArmed(false), 3000);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    setRerunArmed(false);
    setIsReviewing(true);
    setReviewError(null);
    const result = await runQaReview(userId, callSid);
    setIsReviewing(false);
    if ('error' in result) {
      setReviewError(reviewErrorCopy(result.error, result.status));
    } else {
      fetchRecord();
    }
  };

  if (load.phase === 'loading') {
    return (
      <div className="py-16 text-center text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
        Loading call…
      </div>
    );
  }
  if (load.phase === 'missing' || load.phase === 'error') {
    return (
      <div className="py-16 text-center text-gray-500 dark:text-gray-400 space-y-3">
        <p>
          {load.phase === 'missing'
            ? 'Call not found — if it just ended, the record may still be finishing.'
            : "Couldn't load the call (server error)."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => {
              setLoad({ phase: 'loading' });
              fetchRecord();
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
          <button
            onClick={() => navigate('/admin/supervision')}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            Back to Supervision
          </button>
        </div>
      </div>
    );
  }
  if (!record) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/admin/supervision')}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Supervision
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{record.callSid}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {record.agentName ?? record.userId ?? 'unknown agent'} · {record.direction} ·{' '}
            {record.durationSec}s · {formatWhen(record.startedAt)}
            {record.flagged && (
              <span className="ml-2 inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> flagged
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => void runReview()}
          disabled={isReviewing}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium transition-colors disabled:opacity-60 ${
            rerunArmed ? 'bg-red-600 hover:bg-red-500' : 'bg-orange-600 hover:bg-orange-500'
          }`}
        >
          {isReviewing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {isReviewing
            ? 'Reviewing…'
            : rerunArmed
              ? 'Click again to overwrite'
              : qa
                ? 'Re-run QA review'
                : 'Run QA review'}
        </button>
      </div>

      {reviewError && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          {reviewError}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* Transcript with inline tags */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Transcript
          </h3>
          <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
            {record.lines.map((line, i) => (
              <div key={i}>
                <div className="flex gap-2 text-sm">
                  <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500 pt-0.5 shrink-0">
                    {mmss(line.ts)}
                  </span>
                  <span
                    className={`font-bold shrink-0 ${
                      line.speaker === 'agent'
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {line.speaker === 'agent'
                      ? 'Agent'
                      : line.speaker === 'prospect'
                        ? 'Prospect'
                        : '—'}
                    :
                  </span>
                  <span className="text-gray-800 dark:text-gray-200">{line.text}</span>
                </div>
                {(tagsByLineIndex.get(i) ?? []).map((tag, ti) => {
                  const Icon = TAG_ICONS[tag.kind] ?? Info;
                  return (
                    <div
                      key={ti}
                      className={`flex items-start gap-1.5 ml-12 mt-1 px-2.5 py-1.5 rounded-lg border text-xs ${TAG_INLINE_TONES[tag.kind] ?? TAG_INLINE_TONES.note}`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
                      <span>{tagLabel(tag)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* QA scorecard */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            QA scorecard
          </h3>
          {!qa ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic py-8 text-center">
              Not reviewed yet — run the QA review to generate a scorecard.
            </p>
          ) : (
            <Scorecard qa={qa} />
          )}
        </div>
      </div>
    </div>
  );
}

function Scorecard({ qa }: { qa: QaReview }): React.JSX.Element {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className={`text-5xl font-bold ${scoreTone(qa.overallScore)}`}>{qa.overallScore}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          overall · reviewed {formatWhen(qa.reviewedAt)} · {qa.model}
        </div>
      </div>

      <div className="space-y-3">
        {Object.entries(qa.dimensions).map(([name, dim]) => (
          <div key={name}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-gray-900 dark:text-white capitalize">
                {name === 'nextSteps' ? 'Next steps' : name}
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

      {qa.strengths.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
            Strengths
          </h4>
          <ul className="space-y-1">
            {qa.strengths.map((s, i) => (
              <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" /> {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {qa.coachingPoints.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
            Coaching points
          </h4>
          <ul className="space-y-1">
            {qa.coachingPoints.map((s, i) => (
              <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
          Disclosure checklist
        </h4>
        <ul className="space-y-1.5">
          {qa.disclosureChecklist.map((c, i) => (
            <li key={i} className="text-sm flex gap-1.5">
              {c.met ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              )}
              <span className="text-gray-700 dark:text-gray-300">
                {c.item}
                <span className="block text-xs text-gray-500 dark:text-gray-400">{c.evidence}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
