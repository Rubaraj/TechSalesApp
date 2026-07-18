/**
 * Supervision call detail — transcript viewer with inline tag markers +
 * on-demand QA review scorecard panel.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Info,
  StickyNote,
  Tag,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getCall, runQaReview } from '../../services/supervisorService';
import type { CallRecordDetail, CallTag, QaReview } from '../../types/supervisor';

const TAG_ICONS: Record<string, typeof Info> = {
  compliance: ShieldAlert,
  info: Info,
  entity: Tag,
  note: StickyNote,
};

const TAG_TONES: Record<string, string> = {
  compliance: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-300',
  info: 'border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/15 text-purple-700 dark:text-purple-300',
  entity: 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/15 text-blue-700 dark:text-blue-300',
  note: 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 text-gray-700 dark:text-gray-300',
};

function tagLabel(tag: CallTag): string {
  if (tag.kind === 'compliance') {
    return `${String(tag.data.rule ?? 'Compliance')} — “${String(tag.data.phrase ?? '')}”`;
  }
  if (tag.kind === 'info') return `Info card: ${String(tag.data.title ?? tag.data.topic ?? '')}`;
  if (tag.kind === 'note') return `${String(tag.data.category ?? 'note')}: ${String(tag.data.text ?? '')}`;
  const keys = Object.keys(tag.data).filter((k) => tag.data[k] !== undefined);
  return `Extracted: ${keys.join(', ')}`;
}

export function SupervisionCallDetail() {
  const { callSid } = useParams<{ callSid: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?.userId ?? '';

  const [record, setRecord] = useState<CallRecordDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Loading state flips only inside async continuations (lint: no sync
  // setState in effects); isLoading starts true so first render shows it.
  const load = useCallback(() => {
    if (!userId || !callSid) return;
    getCall(userId, callSid)
      .then(setRecord)
      .finally(() => setIsLoading(false));
  }, [userId, callSid]);

  useEffect(() => {
    load();
  }, [load]);

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
    setIsReviewing(true);
    setReviewError(null);
    const result = await runQaReview(userId, callSid);
    setIsReviewing(false);
    if ('error' in result) {
      setReviewError(result.error);
    } else {
      load();
    }
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
        Loading call…
      </div>
    );
  }
  if (!record) {
    return (
      <div className="py-16 text-center text-gray-500 dark:text-gray-400">Call not found.</div>
    );
  }

  const qa = record.qaReview;

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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {record.callSid}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {record.userId ?? 'unknown agent'} · {record.direction} · {record.durationSec}s ·{' '}
            {new Date(record.startedAt).toLocaleString()}
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
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium bg-orange-600 hover:bg-orange-500 disabled:opacity-60 transition-colors"
        >
          {isReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {qa ? 'Re-run QA review' : 'Run QA review'}
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
                    {line.speaker === 'agent' ? 'Agent' : line.speaker === 'prospect' ? 'Prospect' : '—'}:
                  </span>
                  <span className="text-gray-800 dark:text-gray-200">{line.text}</span>
                </div>
                {(tagsByLineIndex.get(i) ?? []).map((tag, ti) => {
                  const Icon = TAG_ICONS[tag.kind] ?? Info;
                  return (
                    <div
                      key={ti}
                      className={`flex items-start gap-1.5 ml-12 mt-1 px-2.5 py-1.5 rounded-lg border text-xs ${TAG_TONES[tag.kind] ?? TAG_TONES.note}`}
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
  const overallTone =
    qa.overallScore >= 80 ? 'text-green-600 dark:text-green-400' : qa.overallScore >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className={`text-5xl font-bold ${overallTone}`}>{qa.overallScore}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          overall · reviewed {new Date(qa.reviewedAt).toLocaleString()} · {qa.model}
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
