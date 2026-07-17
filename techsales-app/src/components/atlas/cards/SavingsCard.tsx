/**
 * Rich-chat — cost/savings card for `calc_savings`. Compact per-plan table
 * with the estimated annual cost emphasized.
 */
import { PiggyBank } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AtlasDisplayCard } from '../../../context/AtlasContext';
import {
  CardChrome,
  CardDataUnavailable,
} from './CardChrome';
import { asArray, asObj, isNum, isStr } from './cardUtils';

interface SavingsRow {
  planId: string;
  costSavings?: number;
  estimatedAnnualCost?: number;
}

function parseSavings(data: unknown): SavingsRow[] | null {
  const obj = asObj(data);
  if (!obj) return null;
  const rows: SavingsRow[] = [];
  for (const raw of asArray(obj.rows)) {
    const r = asObj(raw);
    if (!r || !isStr(r.planId)) continue;
    rows.push({
      planId: r.planId,
      costSavings: isNum(r.costSavings) ? r.costSavings : undefined,
      estimatedAnnualCost: isNum(r.estimatedAnnualCost) ? r.estimatedAnnualCost : undefined,
    });
  }
  return rows.length > 0 ? rows : null;
}

const CELL: React.CSSProperties = { padding: '6px 10px', fontSize: 12.5 };

export function SavingsCard({ card }: { card: AtlasDisplayCard }): React.JSX.Element {
  const navigate = useNavigate();
  const rows = parseSavings(card.data);

  if (!rows) {
    return (
      <CardChrome icon={PiggyBank} title="Cost estimate">
        <CardDataUnavailable />
      </CardChrome>
    );
  }

  return (
    <CardChrome icon={PiggyBank} title="Cost estimate" pill={`${rows.length} plan${rows.length === 1 ? '' : 's'}`}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['Plan', 'Est. annual cost', 'Savings'].map((h) => (
                <th
                  key={h}
                  style={{
                    ...CELL,
                    textAlign: h === 'Plan' ? 'left' : 'right',
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--color-atlas-fg-subtle)',
                    borderBottom: '1px solid var(--color-atlas-border)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.planId} style={{ borderBottom: '1px solid var(--color-atlas-border-faint, var(--color-atlas-border))' }}>
                <td style={{ ...CELL, textAlign: 'left' }}>
                  <button
                    onClick={() => navigate(`/plans/${r.planId}`)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: 'var(--color-atlas-fg)',
                      padding: 0,
                    }}
                    title={`Open ${r.planId}`}
                  >
                    {r.planId}
                  </button>
                </td>
                <td style={{ ...CELL, textAlign: 'right', fontWeight: 700, color: 'var(--color-atlas-fg)' }}>
                  {r.estimatedAnnualCost !== undefined ? `$${r.estimatedAnnualCost.toFixed(2)}` : '—'}
                </td>
                <td
                  style={{
                    ...CELL,
                    textAlign: 'right',
                    fontWeight: 700,
                    color: (r.costSavings ?? 0) > 0 ? '#6ad48f' : 'var(--color-atlas-fg-muted)',
                  }}
                >
                  {r.costSavings !== undefined ? `$${r.costSavings.toFixed(2)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardChrome>
  );
}
