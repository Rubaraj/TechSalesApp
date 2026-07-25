/**
 * Gap 1 — Atlas click-to-call suggestion.
 *
 * Inline card surfaced in the chat stream when Atlas calls `start_call` in
 * Assist mode (Auto Pilot dials immediately; no card). Mirrors the
 * NavigationCard layout so both "AI wants to act" cards read as a family.
 */
import { Phone, X } from 'lucide-react';
import { useAtlas, type AtlasDialSuggestion } from '../../context/AtlasContext';
import { useCallContext } from '../../context/CallContext';

interface Props {
  suggestion: AtlasDialSuggestion;
}

export function DialCard({ suggestion }: Props): React.JSX.Element {
  const { consumeDialSuggestion } = useAtlas();
  const { dialNumber, state: callState } = useCallContext();

  const onCall = (): void => {
    const consumed = consumeDialSuggestion(suggestion.id);
    if (!consumed) return;
    dialNumber({
      to: consumed.to,
      ...(consumed.leadId ? { leadId: consumed.leadId } : {}),
      ...(consumed.leadName ? { leadName: consumed.leadName } : {}),
    });
  };
  const onDismiss = (): void => {
    consumeDialSuggestion(suggestion.id);
  };

  return (
    <div
      className="msg-in flex items-center gap-2.5 px-3 py-2"
      style={{
        background: 'var(--color-atlas-surface-2)',
        border: '1px solid var(--color-exl-orange-line)',
        borderRadius: 11,
      }}
    >
      <Phone
        className="w-3.5 h-3.5 shrink-0"
        style={{ color: 'var(--color-exl-orange-bright)' }}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-atlas-fg)' }}>
          Call {suggestion.leadName ?? suggestion.to}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-atlas-fg-muted)',
            marginTop: 1,
          }}
        >
          {suggestion.to}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="p-1 rounded transition-colors"
        style={{ color: 'var(--color-atlas-fg-subtle)', background: 'transparent', cursor: 'pointer' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-atlas-surface-3)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        aria-label="Dismiss"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onCall}
        disabled={callState.isCallActive}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#fff',
          background: 'var(--color-exl-orange)',
          border: 'none',
          cursor: callState.isCallActive ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!callState.isCallActive)
            e.currentTarget.style.background = 'var(--color-exl-orange-bright)';
        }}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-exl-orange)')}
        title={callState.isCallActive ? 'End the current call first' : 'Place the call'}
      >
        <Phone className="w-3 h-3" />
        Call
      </button>
    </div>
  );
}
