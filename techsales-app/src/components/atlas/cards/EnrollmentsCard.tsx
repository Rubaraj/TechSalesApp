/**
 * Rich-chat — enrollment history card for `get_enrollments`.
 * Rows link to the lead record (no agent-side enrollment detail page).
 */
import { ClipboardList, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AtlasDisplayCard } from '../../../context/AtlasContext';
import {
  CardChrome,
  CardDataUnavailable,
  MoreLine,
} from './CardChrome';
import { asArray, asObj, isNum, isStr } from './cardUtils';

const MAX_ROWS = 6;

const ENROLLMENT_STATUS_COLORS: Record<string, string> = {
  Submitted: '#4f93f7',
  Pending: '#eab308',
  Approved: '#6ad48f',
  Active: '#6ad48f',
  Rejected: '#ff6b6b',
  Cancelled: '#ff6b6b',
};

interface EnrollmentRow {
  enrollmentId: string;
  leadId?: string;
  planId?: string;
  status?: string;
  enrollmentDate?: string;
  premium?: number;
}

function parseEnrollments(data: unknown): { total: number; rows: EnrollmentRow[] } | null {
  const obj = asObj(data);
  if (!obj) return null;
  const rows: EnrollmentRow[] = [];
  for (const raw of asArray(obj.enrollments)) {
    const e = asObj(raw);
    if (!e || !isStr(e.enrollmentId)) continue;
    rows.push({
      enrollmentId: e.enrollmentId,
      leadId: isStr(e.leadId) ? e.leadId : undefined,
      planId: isStr(e.planId) ? e.planId : undefined,
      status: isStr(e.status) ? e.status : undefined,
      enrollmentDate: isStr(e.enrollmentDate) ? e.enrollmentDate : undefined,
      premium: isNum(e.premium) ? e.premium : undefined,
    });
  }
  if (rows.length === 0) return null;
  return { total: isNum(obj.total) ? obj.total : rows.length, rows };
}

export function EnrollmentsCard({ card }: { card: AtlasDisplayCard }): React.JSX.Element {
  const navigate = useNavigate();
  const parsed = parseEnrollments(card.data);

  if (!parsed) {
    return (
      <CardChrome icon={ClipboardList} title="Enrollments">
        <CardDataUnavailable />
      </CardChrome>
    );
  }

  const visible = parsed.rows.slice(0, MAX_ROWS);

  return (
    <CardChrome icon={ClipboardList} title={`Enrollments (${parsed.total})`}>
      {visible.map((e) => (
        <button
          key={e.enrollmentId}
          onClick={() => e.leadId && navigate(`/leads/${e.leadId}`)}
          className="w-full flex items-center gap-2 px-3.5 py-2 text-left group"
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--color-atlas-border-faint, var(--color-atlas-border))',
            cursor: e.leadId ? 'pointer' : 'default',
          }}
          title={e.leadId ? `Open ${e.leadId}` : undefined}
        >
          <span
            className="shrink-0"
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: ENROLLMENT_STATUS_COLORS[e.status ?? ''] ?? 'var(--color-atlas-fg-subtle)',
            }}
          />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-atlas-fg)' }} className="shrink-0">
            {e.planId ?? e.enrollmentId}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-atlas-fg-subtle)' }}>
            {[e.status, e.enrollmentDate].filter(Boolean).join(' · ')}
          </span>
          <span className="ml-auto shrink-0" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-atlas-fg)' }}>
            {typeof e.premium === 'number' ? `$${e.premium.toFixed(2)}/mo` : ''}
          </span>
          {e.leadId && (
            <ChevronRight
              className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
              style={{ color: 'var(--color-atlas-fg-muted)' }}
            />
          )}
        </button>
      ))}
      <MoreLine count={parsed.total - visible.length} noun="enrollments" />
    </CardChrome>
  );
}
