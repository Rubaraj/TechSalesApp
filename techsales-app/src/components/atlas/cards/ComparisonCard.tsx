/**
 * Rich-chat — in-chat comparison mini-grid for `compare_plans`.
 * Diff-first: premium/type/carrier rows always shown; benefit rows where
 * plans differ are highlighted, identical benefit rows are summarized in
 * one line. "Open full comparison" deep-links the standalone page
 * (auto-runs via ?ids=).
 */
import { Scale, ExternalLink, Check, Minus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AtlasDisplayCard } from '../../../context/AtlasContext';
import {
  CardChrome,
  CardButton,
  CardDataUnavailable,
} from './CardChrome';
import { asArray, asObj, isNum, isStr } from './cardUtils';

interface ComparedPlan {
  planId: string;
  planName: string;
  carrier?: string;
  planType?: string;
  premium?: number;
  benefits: Record<string, boolean>;
}

interface ComparisonData {
  plans: ComparedPlan[];
  compareUrl?: string;
}

function parseComparison(data: unknown): ComparisonData | null {
  const obj = asObj(data);
  if (!obj) return null;
  const plans: ComparedPlan[] = [];
  for (const raw of asArray(obj.plans)) {
    const p = asObj(raw);
    if (!p || !isStr(p.planId)) continue;
    const benefits: Record<string, boolean> = {};
    for (const rawB of asArray(p.benefits)) {
      const b = asObj(rawB);
      if (b && isStr(b.category)) benefits[b.category] = b.isAvailable !== false;
    }
    plans.push({
      planId: p.planId,
      planName: isStr(p.planName) ? p.planName : p.planId,
      carrier: isStr(p.carrier) ? p.carrier : undefined,
      planType: isStr(p.planType) ? p.planType : undefined,
      premium: isNum(p.premium) ? p.premium : undefined,
      benefits,
    });
  }
  if (plans.length < 2) return null;
  return { plans, compareUrl: isStr(obj.compareUrl) ? obj.compareUrl : undefined };
}

const CELL: React.CSSProperties = { padding: '5px 8px', fontSize: 12, textAlign: 'center' };
const LABEL_CELL: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 11.5,
  color: 'var(--color-atlas-fg-muted)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

export function ComparisonCard({ card }: { card: AtlasDisplayCard }): React.JSX.Element {
  const navigate = useNavigate();
  const parsed = parseComparison(card.data);

  if (!parsed) {
    return (
      <CardChrome icon={Scale} title="Plan comparison">
        <CardDataUnavailable />
      </CardChrome>
    );
  }

  const { plans, compareUrl } = parsed;
  const allCategories = Array.from(
    new Set(plans.flatMap((p) => Object.keys(p.benefits))),
  );
  const differing = allCategories.filter((cat) => {
    const first = plans[0].benefits[cat] ?? false;
    return plans.some((p) => (p.benefits[cat] ?? false) !== first);
  });
  const identicalCount = allCategories.length - differing.length;

  return (
    <CardChrome
      icon={Scale}
      title="Plan comparison"
      pill={`${plans.length} plans`}
      footer={
        compareUrl ? (
          <CardButton primary onClick={() => navigate(compareUrl)}>
            <ExternalLink className="w-3.5 h-3.5" />
            Open full comparison
          </CardButton>
        ) : undefined
      }
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={LABEL_CELL} />
              {plans.map((p) => (
                <th key={p.planId} style={{ ...CELL, padding: '7px 8px' }}>
                  <button
                    onClick={() => navigate(`/plans/${p.planId}`)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--color-atlas-fg)',
                      maxWidth: 120,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'inline-block',
                    }}
                    title={`Open ${p.planName}`}
                  >
                    {p.planName.replace(/^Carrier \d+\s*/, '')}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: '1px solid var(--color-atlas-border-faint, var(--color-atlas-border))' }}>
              <td style={LABEL_CELL}>Premium</td>
              {plans.map((p) => (
                <td key={p.planId} style={{ ...CELL, fontWeight: 700, color: 'var(--color-atlas-fg)' }}>
                  {typeof p.premium === 'number' ? `$${p.premium.toFixed(2)}` : '—'}
                </td>
              ))}
            </tr>
            <tr style={{ borderTop: '1px solid var(--color-atlas-border-faint, var(--color-atlas-border))' }}>
              <td style={LABEL_CELL}>Type · Carrier</td>
              {plans.map((p) => (
                <td key={p.planId} style={{ ...CELL, color: 'var(--color-atlas-fg-muted)' }}>
                  {[p.planType, p.carrier].filter(Boolean).join(' · ') || '—'}
                </td>
              ))}
            </tr>
            {differing.map((cat) => (
              <tr
                key={cat}
                style={{
                  borderTop: '1px solid var(--color-atlas-border-faint, var(--color-atlas-border))',
                  background: 'rgba(234,179,8,0.07)',
                }}
              >
                <td style={LABEL_CELL}>{cat}</td>
                {plans.map((p) => (
                  <td key={p.planId} style={CELL}>
                    {(p.benefits[cat] ?? false) ? (
                      <Check className="w-3.5 h-3.5 inline" style={{ color: '#6ad48f' }} />
                    ) : (
                      <Minus className="w-3.5 h-3.5 inline" style={{ color: 'var(--color-atlas-fg-subtle)' }} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {identicalCount > 0 && (
        <div
          className="px-3.5 py-2"
          style={{
            fontSize: 11.5,
            color: 'var(--color-atlas-fg-subtle)',
            fontStyle: 'italic',
            borderTop: '1px solid var(--color-atlas-border-faint, var(--color-atlas-border))',
          }}
        >
          {identicalCount} matching benefit{identicalCount === 1 ? '' : 's'} across all plans
        </div>
      )}
    </CardChrome>
  );
}
