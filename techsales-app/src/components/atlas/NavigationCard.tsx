/**
 * Phase 4 design — Atlas click-to-go navigation suggestion.
 *
 * Inline card surfaced in the chat stream when Atlas calls `navigateTo`.
 * In Assist mode the agent chooses Open / Dismiss; in Auto Pilot a
 * separate listener auto-routes; in Silent the suggestion is suppressed
 * (filtered upstream).
 *
 * Layout matches the ApprovalCard family — atlas surface-2 with a thin
 * orange-tinted border so it reads as an Atlas-originated card without
 * blending into normal chat messages.
 */
import { useNavigate } from 'react-router-dom';
import { ArrowRight, X, Compass } from 'lucide-react';
import { useAtlas, type AtlasNavigationSuggestion } from '../../context/AtlasContext';

interface Props {
  suggestion: AtlasNavigationSuggestion;
}

export function NavigationCard({ suggestion }: Props): React.JSX.Element {
  const navigate = useNavigate();
  const { consumeNavigationSuggestion } = useAtlas();

  const onOpen = (): void => {
    const consumed = consumeNavigationSuggestion(suggestion.id);
    if (consumed) navigate(consumed.route);
  };
  const onDismiss = (): void => {
    consumeNavigationSuggestion(suggestion.id);
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
      <Compass
        className="w-3.5 h-3.5 shrink-0"
        style={{ color: 'var(--color-exl-orange-bright)' }}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-atlas-fg)',
          }}
        >
          {suggestion.reason}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-atlas-fg-muted)',
            marginTop: 1,
          }}
        >
          {suggestion.route}
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
        onClick={onOpen}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors"
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#fff',
          background: 'var(--color-exl-orange)',
          border: 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-exl-orange-bright)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-exl-orange)')}
      >
        Open
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}
