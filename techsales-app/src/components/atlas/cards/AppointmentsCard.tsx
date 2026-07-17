/**
 * Rich-chat — appointments agenda card for `get_appointments`.
 * Rows grouped by date with status pills.
 */
import { CalendarDays } from 'lucide-react';
import type { AtlasDisplayCard } from '../../../context/AtlasContext';
import {
  CardChrome,
  CardDataUnavailable,
  MoreLine,
} from './CardChrome';
import { asArray, asObj, isNum, isStr } from './cardUtils';

const MAX_ROWS = 6;

interface ApptRow {
  appointmentId: string;
  memberId?: string;
  type?: string;
  date: string;
  time?: string;
  status?: string;
}

function parseAppointments(data: unknown): { total: number; rows: ApptRow[] } | null {
  const obj = asObj(data);
  if (!obj) return null;
  const rows: ApptRow[] = [];
  for (const raw of asArray(obj.appointments)) {
    const a = asObj(raw);
    if (!a || !isStr(a.appointmentId) || !isStr(a.date)) continue;
    rows.push({
      appointmentId: a.appointmentId,
      memberId: isStr(a.memberId) ? a.memberId : undefined,
      type: isStr(a.type) ? a.type : undefined,
      date: a.date,
      time: isStr(a.time) ? a.time : undefined,
      status: isStr(a.status) ? a.status : undefined,
    });
  }
  if (rows.length === 0) return null;
  return { total: isNum(obj.total) ? obj.total : rows.length, rows };
}

export function AppointmentsCard({ card }: { card: AtlasDisplayCard }): React.JSX.Element {
  const parsed = parseAppointments(card.data);

  if (!parsed) {
    return (
      <CardChrome icon={CalendarDays} title="Appointments">
        <CardDataUnavailable />
      </CardChrome>
    );
  }

  const visible = parsed.rows.slice(0, MAX_ROWS);
  const byDate = new Map<string, ApptRow[]>();
  for (const row of visible) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }

  return (
    <CardChrome icon={CalendarDays} title={`Appointments (${parsed.total})`}>
      {Array.from(byDate.entries()).map(([date, appts]) => (
        <div key={date} style={{ borderBottom: '1px solid var(--color-atlas-border-faint, var(--color-atlas-border))' }}>
          <div
            className="px-3.5 pt-2"
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--color-atlas-fg-subtle)',
            }}
          >
            {date}
          </div>
          {appts.map((a) => (
            <div key={a.appointmentId} className="flex items-center gap-2 px-3.5 py-1.5">
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-atlas-fg)', minWidth: 62 }} className="shrink-0">
                {a.time ?? '—'}
              </span>
              <span
                style={{
                  fontSize: 12.5,
                  color: 'var(--color-atlas-fg-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {[a.type, a.memberId].filter(Boolean).join(' · ')}
              </span>
              {a.status && (
                <span
                  className="ml-auto shrink-0"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 7px',
                    borderRadius: 999,
                    background: 'var(--color-atlas-surface-3)',
                    color: a.status === 'Scheduled' ? '#4f93f7' : 'var(--color-atlas-fg-muted)',
                  }}
                >
                  {a.status}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
      <MoreLine count={parsed.total - visible.length} noun="appointments" />
    </CardChrome>
  );
}
