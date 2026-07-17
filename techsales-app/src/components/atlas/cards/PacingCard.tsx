/**
 * Rich-chat — targets pacing card for `get_my_targets`. Progress bars per
 * metric with the pro-rated expected-to-date tick; on-track green, behind
 * amber. Null-actual metrics (no data source) render their note muted.
 */
import { Target } from 'lucide-react';
import type { AtlasDisplayCard } from '../../../context/AtlasContext';
import {
  CardChrome,
  CardDataUnavailable,
} from './CardChrome';
import { asArray, asObj, isNum, isStr } from './cardUtils';

interface TargetRow {
  metric: string;
  targetValue: number;
  actualToDate: number | null;
  expectedToDate?: number;
  paceDelta?: number;
  onTrack?: boolean;
  progressPct?: number;
  projectedEndOfPeriod?: number;
  note?: string;
}

interface PacingData {
  period: string;
  window?: string;
  percentOfPeriodElapsed?: number;
  targets: TargetRow[];
  note?: string;
}

function parsePacing(data: unknown): PacingData | null {
  const obj = asObj(data);
  if (!obj || !isStr(obj.period)) return null;
  const targets: TargetRow[] = [];
  for (const raw of asArray(obj.targets)) {
    const t = asObj(raw);
    if (!t || !isStr(t.metric) || !isNum(t.targetValue)) continue;
    targets.push({
      metric: t.metric,
      targetValue: t.targetValue,
      actualToDate: isNum(t.actualToDate) ? t.actualToDate : null,
      expectedToDate: isNum(t.expectedToDate) ? t.expectedToDate : undefined,
      paceDelta: isNum(t.paceDelta) ? t.paceDelta : undefined,
      onTrack: typeof t.onTrack === 'boolean' ? t.onTrack : undefined,
      progressPct: isNum(t.progressPct) ? t.progressPct : undefined,
      projectedEndOfPeriod: isNum(t.projectedEndOfPeriod) ? t.projectedEndOfPeriod : undefined,
      note: isStr(t.note) ? t.note : undefined,
    });
  }
  return {
    period: obj.period,
    window: isStr(obj.window) ? obj.window : undefined,
    percentOfPeriodElapsed: isNum(obj.percentOfPeriodElapsed) ? obj.percentOfPeriodElapsed : undefined,
    targets,
    note: isStr(obj.note) ? obj.note : undefined,
  };
}

export function PacingCard({ card }: { card: AtlasDisplayCard }): React.JSX.Element {
  const parsed = parsePacing(card.data);

  if (!parsed) {
    return (
      <CardChrome icon={Target} title="Target pacing">
        <CardDataUnavailable />
      </CardChrome>
    );
  }

  const elapsed = parsed.percentOfPeriodElapsed;

  return (
    <CardChrome
      icon={Target}
      title={`Target pacing — ${parsed.period}`}
      pill={elapsed !== undefined ? `${elapsed}% elapsed` : undefined}
    >
      {parsed.targets.length === 0 && (
        <div className="px-3.5 py-3" style={{ fontSize: 12.5, color: 'var(--color-atlas-fg-subtle)' }}>
          {parsed.note ?? 'No active targets for this period.'}
        </div>
      )}
      <div className="flex flex-col gap-1 py-1">
        {parsed.targets.map((t) => {
          if (t.actualToDate === null) {
            return (
              <div key={t.metric} className="px-3.5 py-1.5">
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-atlas-fg-muted)' }}>
                  {t.metric}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-atlas-fg-subtle)', fontStyle: 'italic' }}>
                  {t.note ?? 'No data source yet'}
                </div>
              </div>
            );
          }
          const tone = t.onTrack === false ? '#eab308' : '#6ad48f';
          const pct = Math.min(100, t.progressPct ?? Math.round((t.actualToDate / t.targetValue) * 100));
          return (
            <div key={t.metric} className="px-3.5 py-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-atlas-fg)' }}>
                  {t.metric}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--color-atlas-fg-muted)' }}>
                  <b style={{ color: tone, fontWeight: 700 }}>{t.actualToDate}</b>
                  {' / '}
                  {t.targetValue}
                  {t.expectedToDate !== undefined && (
                    <span style={{ color: 'var(--color-atlas-fg-subtle)' }}>
                      {' '}(pace: {t.expectedToDate})
                    </span>
                  )}
                </span>
              </div>
              <div
                className="relative mt-1"
                style={{ height: 6, borderRadius: 999, background: 'var(--color-atlas-surface-3)' }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${pct}%`,
                    borderRadius: 999,
                    background: tone,
                    transition: 'width 0.4s var(--ease-soft)',
                  }}
                />
                {elapsed !== undefined && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${Math.min(100, elapsed)}%`,
                      top: -2,
                      bottom: -2,
                      width: 2,
                      background: 'var(--color-atlas-fg-subtle)',
                      opacity: 0.7,
                    }}
                    title={`Expected pace at ${elapsed}% of period`}
                  />
                )}
              </div>
              {t.onTrack === false && t.projectedEndOfPeriod !== undefined && (
                <div style={{ fontSize: 10.5, color: 'var(--color-atlas-fg-subtle)', marginTop: 3 }}>
                  Projected end of period: {t.projectedEndOfPeriod}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CardChrome>
  );
}
