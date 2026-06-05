/**
 * Phase 4 outbound-dial — surfaced when the agent dials a number that
 * matches a known lead. Renders inline in Atlas chat (via ChatPane's
 * lead-suggestion row kind). Click [Open lead] to navigate to the lead's
 * detail page AND bind the call's leadId so post-call notes attribute
 * correctly. Click [Skip] to dismiss.
 *
 * Visual family: matches ApprovalCard — surface-2 background, neutral
 * border, orange action button.
 */
import { useNavigate } from 'react-router-dom';
import { Compass, ArrowRight, X, Sparkles } from 'lucide-react';
import { useAtlas, type AtlasLeadSuggestion } from '../../context/AtlasContext';
import { useCallContext } from '../../context/CallContext';
import { formatPhoneUS } from '../../utils/phoneUtils';

interface Props {
  suggestion: Extract<AtlasLeadSuggestion, { kind: 'identified' }>;
}

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  'New Lead':                { bg: 'rgba(79,147,247,0.16)',  fg: '#4f93f7' },
  'Contacted':               { bg: 'rgba(155,124,246,0.16)', fg: '#9b7cf6' },
  'Appointment Set':         { bg: 'rgba(34,195,224,0.16)',  fg: '#22c3e0' },
  'Enrollment in Progress':  { bg: 'rgba(245,158,11,0.16)',  fg: '#f59e0b' },
  'Enrolled':                { bg: 'rgba(43,189,110,0.18)',  fg: '#2bbd6e' },
  'Dropped':                 { bg: 'rgba(244,83,107,0.16)',  fg: '#f4536b' },
};

function formatRelativeDate(iso?: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Updated today';
  if (diffDays === 1) return 'Updated 1d ago';
  if (diffDays < 30) return `Updated ${diffDays}d ago`;
  if (diffDays < 365) return `Updated ${Math.floor(diffDays / 30)}mo ago`;
  return `Updated ${Math.floor(diffDays / 365)}y ago`;
}

export function IdentifiedLeadCard({ suggestion }: Props): React.JSX.Element {
  const navigate = useNavigate();
  const { consumeLeadSuggestion } = useAtlas();
  const { bindCurrentCallToLead } = useCallContext();
  const { lead, phone } = suggestion;

  const fullName = `${lead.firstName} ${lead.lastName}`.trim();
  const statusTone = lead.leadStatus ? STATUS_TONE[lead.leadStatus] : undefined;
  const relativeDate = formatRelativeDate(lead.updatedAt);

  const onOpen = (): void => {
    bindCurrentCallToLead(lead.leadId);
    consumeLeadSuggestion(suggestion.id);
    navigate(`/leads/${lead.leadId}`);
  };
  const onSkip = (): void => {
    consumeLeadSuggestion(suggestion.id);
  };

  return (
    <div
      className="msg-in flex-shrink-0 overflow-hidden"
      style={{
        background: 'var(--color-atlas-surface-2)',
        border: '1px solid var(--color-atlas-border)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-atlas-card)',
      }}
    >
      {/* Header — Compass icon + "Calling X" + matched pill */}
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <Compass
          className="w-4 h-4"
          style={{ color: 'var(--color-exl-orange-bright)' }}
        />
        <span
          style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-atlas-fg)' }}
        >
          Calling {fullName}
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1"
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-exl-orange-bright)',
            background: 'var(--color-exl-orange-soft)',
            padding: '4px 9px',
            borderRadius: 999,
          }}
        >
          <Sparkles className="w-3 h-3" />
          Matched
        </span>
      </div>

      {/* Body — leadId · status · chips · relative date */}
      <div
        className="px-3.5 py-2.5 flex flex-col gap-2"
        style={{ borderTop: '1px solid var(--color-atlas-border)' }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--color-atlas-fg-muted)',
            }}
          >
            {lead.leadId}
          </span>
          {lead.state && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-atlas-fg-muted)',
              }}
            >
              · {lead.state}
            </span>
          )}
          {statusTone && lead.leadStatus && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 999,
                background: statusTone.bg,
                color: statusTone.fg,
              }}
            >
              {lead.leadStatus}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--color-atlas-fg-muted)' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{formatPhoneUS(phone)}</span>
          {relativeDate && <span>· {relativeDate}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-3.5 pb-3.5 pt-1">
        <button
          onClick={onSkip}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors"
          style={{
            fontSize: 13,
            fontWeight: 600,
            background: 'var(--color-atlas-surface-3)',
            color: 'var(--color-atlas-fg-muted)',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-atlas-surface-4)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-atlas-surface-3)')}
        >
          <X className="w-3.5 h-3.5" />
          Skip
        </button>
        <button
          onClick={onOpen}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors"
          style={{
            fontSize: 13,
            fontWeight: 600,
            background: 'var(--color-exl-orange)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-exl-orange-bright)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-exl-orange)')}
        >
          Open lead
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

