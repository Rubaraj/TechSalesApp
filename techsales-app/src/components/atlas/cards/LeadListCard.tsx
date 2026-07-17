/**
 * Rich-chat — lead list card for `search_leads` and `get_my_pipeline`.
 * Normalizes both output shapes: {total, leads[]} and
 * {totalCount, countsByStatus, leads[]}. Rows navigate to the lead; a
 * per-row "Mark contacted" action feeds the propose_status_change flow
 * through the chat (LLM-mediated, existing ApprovalCard approval applies).
 */
import { Users, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAtlas, type AtlasDisplayCard } from '../../../context/AtlasContext';
import {
  CardChrome,
  CardDataUnavailable,
  MoreLine,
} from './CardChrome';
import { STATUS_COLORS, asArray, asObj, isNum, isStr } from './cardUtils';

const MAX_ROWS = 6;

interface LeadRow {
  leadId: string;
  name: string;
  status?: string;
  state?: string;
}

interface LeadListData {
  total: number;
  countsByStatus?: Record<string, number>;
  leads: LeadRow[];
}

function parseLeadList(data: unknown): LeadListData | null {
  const obj = asObj(data);
  if (!obj) return null;
  const leads: LeadRow[] = [];
  for (const raw of asArray(obj.leads)) {
    const l = asObj(raw);
    if (!l || !isStr(l.leadId)) continue;
    leads.push({
      leadId: l.leadId,
      name: isStr(l.name) ? l.name : l.leadId,
      status: isStr(l.status) ? l.status : undefined,
      state: isStr(l.state) ? l.state : undefined,
    });
  }
  if (leads.length === 0) return null;
  const total = isNum(obj.total) ? obj.total : isNum(obj.totalCount) ? obj.totalCount : leads.length;
  const counts = asObj(obj.countsByStatus);
  return {
    total,
    leads,
    countsByStatus: counts
      ? Object.fromEntries(Object.entries(counts).filter(([, v]) => isNum(v))) as Record<string, number>
      : undefined,
  };
}

export function LeadListCard({ card }: { card: AtlasDisplayCard }): React.JSX.Element | null {
  const navigate = useNavigate();
  const { send, isStreaming } = useAtlas();
  const parsed = parseLeadList(card.data);

  if (!parsed) {
    return (
      <CardChrome icon={Users} title="Leads">
        <CardDataUnavailable />
      </CardChrome>
    );
  }

  const visible = parsed.leads.slice(0, MAX_ROWS);

  return (
    <CardChrome icon={Users} title={`Leads (${parsed.total})`} pill={card.tool === 'get_my_pipeline' ? 'Pipeline' : 'Search'}>
      {parsed.countsByStatus && (
        <div className="flex flex-wrap gap-1.5 px-3.5 py-2.5" style={{ borderBottom: '1px solid var(--color-atlas-border-faint, var(--color-atlas-border))' }}>
          {Object.entries(parsed.countsByStatus).map(([status, n]) => (
            <span
              key={status}
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 999,
                color: STATUS_COLORS[status] ?? 'var(--color-atlas-fg-muted)',
                background: 'var(--color-atlas-surface-3)',
              }}
            >
              {status} · {n}
            </span>
          ))}
        </div>
      )}
      <div>
        {visible.map((lead) => (
          <div
            key={lead.leadId}
            className="flex items-center gap-2 px-3.5 py-2 group"
            style={{ borderBottom: '1px solid var(--color-atlas-border-faint, var(--color-atlas-border))' }}
          >
            <button
              onClick={() => navigate(`/leads/${lead.leadId}`)}
              className="flex items-center gap-2 min-w-0 flex-1 text-left"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
              title={`Open ${lead.leadId}`}
            >
              <span
                className="shrink-0"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: STATUS_COLORS[lead.status ?? ''] ?? 'var(--color-atlas-fg-subtle)',
                }}
              />
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
                {lead.name}
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-atlas-fg-subtle)' }} className="shrink-0">
                {lead.status}
                {lead.state ? ` · ${lead.state}` : ''}
              </span>
              <ChevronRight
                className="w-3.5 h-3.5 shrink-0 ml-auto opacity-0 group-hover:opacity-60 transition-opacity"
                style={{ color: 'var(--color-atlas-fg-muted)' }}
              />
            </button>
            {lead.status && lead.status !== 'Contacted Lead' && lead.status !== 'Enrolled' && (
              <button
                onClick={() => void send(`Mark ${lead.leadId} as contacted`)}
                disabled={isStreaming}
                className="shrink-0 transition-colors disabled:opacity-40"
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 7,
                  background: 'var(--color-atlas-surface-3)',
                  color: 'var(--color-atlas-fg-muted)',
                  border: 'none',
                  cursor: isStreaming ? 'not-allowed' : 'pointer',
                }}
                title="Propose moving this lead to Contacted (requires your approval)"
              >
                Mark contacted
              </button>
            )}
          </div>
        ))}
      </div>
      <MoreLine count={parsed.total - visible.length} noun="leads" />
    </CardChrome>
  );
}
