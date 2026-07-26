/**
 * Rich-chat — QA scorecard card for `run_qa_review` / `get_qa_review`
 * (admin-only tools). Overall score, per-dimension bars (rubric-driven),
 * top coaching points, and an "Open in Supervision" link to the full
 * transcript view.
 */
import { ClipboardCheck, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AtlasDisplayCard } from '../../../context/AtlasContext';
import { CardChrome, CardButton, CardDataUnavailable } from './CardChrome';
import { asArray, asObj, isNum, isStr } from './cardUtils';

interface QaDim {
  name: string;
  score: number;
  evidence?: string;
}

interface QaCardData {
  callSid: string;
  overallScore: number;
  dimensions: QaDim[];
  coachingPoints: string[];
}

const DIM_LABELS: Record<string, string> = {
  compliance: 'Compliance',
  discovery: 'Discovery',
  communication: 'Communication',
  nextSteps: 'Next steps',
};

function parseQa(data: unknown): QaCardData | null {
  const obj = asObj(data);
  if (!obj || !isStr(obj.callSid) || !isNum(obj.overallScore)) return null;
  const dims: QaDim[] = [];
  const dimsObj = asObj(obj.dimensions);
  // Gap 9 — dimensions are rubric-driven now: iterate whatever keys the
  // review carries (schema key order is preserved), labeling from the
  // review's own snapshot with the legacy map as fallback.
  const labelsObj = asObj(obj.dimensionLabels);
  if (dimsObj) {
    for (const [key, raw] of Object.entries(dimsObj)) {
      const d = asObj(raw);
      if (d && isNum(d.score)) {
        const snapLabel = labelsObj && isStr(labelsObj[key]) ? labelsObj[key] : undefined;
        dims.push({
          name: snapLabel ?? DIM_LABELS[key] ?? key,
          score: d.score,
          evidence: isStr(d.evidence) ? d.evidence : undefined,
        });
      }
    }
  }
  return {
    callSid: obj.callSid,
    overallScore: obj.overallScore,
    dimensions: dims,
    coachingPoints: asArray(obj.coachingPoints).filter(isStr).slice(0, 3),
  };
}

function scoreTone(score: number): string {
  return score >= 80 ? '#6ad48f' : score >= 60 ? '#eab308' : '#ff6b6b';
}

export function QaScorecardCard({ card }: { card: AtlasDisplayCard }): React.JSX.Element {
  const navigate = useNavigate();
  const parsed = parseQa(card.data);

  if (!parsed) {
    return (
      <CardChrome icon={ClipboardCheck} title="QA scorecard">
        <CardDataUnavailable />
      </CardChrome>
    );
  }

  const tone = scoreTone(parsed.overallScore);

  return (
    <CardChrome
      icon={ClipboardCheck}
      title={`QA scorecard — ${parsed.callSid}`}
      pill={`${parsed.overallScore}/100`}
      footer={
        <CardButton
          onClick={() => navigate(`/admin/supervision/${encodeURIComponent(parsed.callSid)}`)}
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open in Supervision
        </CardButton>
      }
    >
      <div className="px-3.5 py-2.5 flex items-center gap-3">
        <div style={{ fontSize: 30, fontWeight: 800, color: tone, lineHeight: 1 }}>
          {parsed.overallScore}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-atlas-fg-subtle)' }}>overall / 100</div>
      </div>

      <div className="flex flex-col gap-1.5 px-3.5 pb-2.5">
        {parsed.dimensions.map((d) => (
          <div key={d.name}>
            <div className="flex items-baseline justify-between">
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-atlas-fg)' }}>
                {d.name}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: scoreTone(d.score) }}>
                {d.score}
              </span>
            </div>
            <div
              style={{ height: 5, borderRadius: 999, background: 'var(--color-atlas-surface-3)' }}
            >
              <div
                style={{
                  height: 5,
                  borderRadius: 999,
                  width: `${Math.min(100, d.score)}%`,
                  background: scoreTone(d.score),
                  transition: 'width 0.4s var(--ease-soft)',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {parsed.coachingPoints.length > 0 && (
        <div
          className="px-3.5 py-2.5 flex flex-col gap-1"
          style={{ borderTop: '1px solid var(--color-atlas-border)' }}
        >
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-atlas-fg-subtle)',
            }}
          >
            Coaching
          </span>
          {parsed.coachingPoints.map((p, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--color-atlas-fg-muted)' }}>
              • {p}
            </div>
          ))}
        </div>
      )}
    </CardChrome>
  );
}
