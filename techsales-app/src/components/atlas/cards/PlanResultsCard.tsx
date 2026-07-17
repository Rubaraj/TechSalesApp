/**
 * Rich-chat — plan search results card for `search_plans`.
 * Rows open the plan detail page; checkboxes select 2-4 plans for the
 * "Compare selected" action (LLM-mediated via chat send).
 */
import { useState } from 'react';
import { FileSearch, ChevronRight, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAtlas, type AtlasDisplayCard } from '../../../context/AtlasContext';
import {
  CardChrome,
  CardButton,
  CardDataUnavailable,
  MoreLine,
} from './CardChrome';
import { asArray, asObj, isNum, isStr } from './cardUtils';

const MAX_ROWS = 6;

interface PlanHit {
  planId: string;
  planName: string;
  planType?: string;
  premium?: number;
}

function parsePlans(data: unknown): { total: number; plans: PlanHit[] } | null {
  const obj = asObj(data);
  if (!obj) return null;
  const plans: PlanHit[] = [];
  for (const raw of asArray(obj.plans)) {
    const p = asObj(raw);
    if (!p || !isStr(p.planId)) continue;
    plans.push({
      planId: p.planId,
      planName: isStr(p.planName) ? p.planName : p.planId,
      planType: isStr(p.planType) ? p.planType : undefined,
      premium: isNum(p.premium) ? p.premium : undefined,
    });
  }
  if (plans.length === 0) return null;
  return { total: isNum(obj.total) ? obj.total : plans.length, plans };
}

export function PlanResultsCard({ card }: { card: AtlasDisplayCard }): React.JSX.Element {
  const navigate = useNavigate();
  const { send, isStreaming } = useAtlas();
  const [selected, setSelected] = useState<string[]>([]);
  const parsed = parsePlans(card.data);

  if (!parsed) {
    return (
      <CardChrome icon={FileSearch} title="Plan results">
        <CardDataUnavailable />
      </CardChrome>
    );
  }

  const visible = parsed.plans.slice(0, MAX_ROWS);
  const toggle = (planId: string): void => {
    setSelected((prev) =>
      prev.includes(planId)
        ? prev.filter((p) => p !== planId)
        : prev.length >= 4
          ? prev
          : [...prev, planId],
    );
  };

  return (
    <CardChrome
      icon={FileSearch}
      title={`Plans (${parsed.total})`}
      pill="Search"
      footer={
        <CardButton
          primary
          disabled={selected.length < 2 || isStreaming}
          onClick={() => void send(`Compare plans ${selected.join(' and ')}`)}
          title={selected.length < 2 ? 'Select 2-4 plans to compare' : undefined}
        >
          <Scale className="w-3.5 h-3.5" />
          Compare selected{selected.length > 0 ? ` (${selected.length})` : ''}
        </CardButton>
      }
    >
      {visible.map((plan) => (
        <div
          key={plan.planId}
          className="flex items-center gap-2.5 px-3.5 py-2 group"
          style={{ borderBottom: '1px solid var(--color-atlas-border-faint, var(--color-atlas-border))' }}
        >
          <input
            type="checkbox"
            checked={selected.includes(plan.planId)}
            disabled={!selected.includes(plan.planId) && selected.length >= 4}
            onChange={() => toggle(plan.planId)}
            className="w-3.5 h-3.5 shrink-0 rounded"
            style={{ accentColor: 'var(--color-exl-orange)' }}
          />
          <button
            onClick={() => navigate(`/plans/${plan.planId}`)}
            className="flex items-center gap-2 min-w-0 flex-1 text-left"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            title={`Open ${plan.planId}`}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-atlas-fg)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {plan.planName}
            </span>
            {plan.planType && (
              <span style={{ fontSize: 10.5, color: 'var(--color-atlas-fg-subtle)' }} className="shrink-0">
                {plan.planType}
              </span>
            )}
            <span
              className="ml-auto shrink-0"
              style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-atlas-fg)' }}
            >
              {typeof plan.premium === 'number' ? `$${plan.premium.toFixed(2)}` : '—'}
              <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--color-atlas-fg-subtle)' }}>
                /mo
              </span>
            </span>
            <ChevronRight
              className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
              style={{ color: 'var(--color-atlas-fg-muted)' }}
            />
          </button>
        </div>
      ))}
      <MoreLine count={parsed.total - visible.length} noun="plans" />
    </CardChrome>
  );
}
