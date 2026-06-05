/**
 * Phase 4 outbound-dial — surfaced when the agent dials a number that does
 * NOT match any known lead. Offers to navigate to the new-lead form with
 * the phone prefilled. Renders inline in Atlas chat.
 */
import { useNavigate } from 'react-router-dom';
import { UserPlus, X, Plus } from 'lucide-react';
import { useAtlas, type AtlasLeadSuggestion } from '../../context/AtlasContext';
import { formatPhoneUS } from '../../utils/phoneUtils';

interface Props {
  suggestion: Extract<AtlasLeadSuggestion, { kind: 'create' }>;
}

export function CreateLeadCard({ suggestion }: Props): React.JSX.Element {
  const navigate = useNavigate();
  const { consumeLeadSuggestion } = useAtlas();
  const { phone } = suggestion;

  const onCreate = (): void => {
    consumeLeadSuggestion(suggestion.id);
    navigate(`/leads/new?phone=${encodeURIComponent(phone)}`);
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
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <UserPlus
          className="w-4 h-4"
          style={{ color: 'var(--color-atlas-fg-muted)' }}
        />
        <span
          style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-atlas-fg)' }}
        >
          No matching lead
        </span>
      </div>

      <div
        className="px-3.5 py-2.5 flex flex-col gap-1.5"
        style={{ borderTop: '1px solid var(--color-atlas-border)' }}
      >
        <div style={{ fontSize: 13, color: 'var(--color-atlas-fg)' }}>
          Couldn't find a lead for{' '}
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {formatPhoneUS(phone)}
          </span>
          .
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-atlas-fg-muted)' }}>
          Create a new lead with this phone prefilled?
        </div>
      </div>

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
          onClick={onCreate}
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
          <Plus className="w-3.5 h-3.5" />
          Create lead
        </button>
      </div>
    </div>
  );
}
