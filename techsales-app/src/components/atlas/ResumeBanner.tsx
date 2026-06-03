/**
 * Phase 4 design — "Continuing your previous conversation" banner.
 *
 * Renders at the top of Atlas's chat area when the panel hydrates with
 * prior history. EXL orange tint (exl-orange-soft + exl-orange-line),
 * inline action links: Resume (dismiss banner, keep history) or
 * + Start new (clear & wipe).
 */
import { History, X, Plus } from 'lucide-react';
import { useAtlas } from '../../context/AtlasContext';

export function ResumeBanner(): React.JSX.Element | null {
  const { resumedFromPriorSession, messages, dismissResumeBanner, startNewSession } = useAtlas();

  if (!resumedFromPriorSession || messages.length === 0) return null;

  const userTurns = messages.filter((m) => m.role === 'user').length;
  const label = userTurns === 1 ? '1 turn' : `${userTurns} turns`;

  return (
    <div
      className="msg-in mx-3 mt-3 mb-1 flex items-center gap-2.5 px-3 py-2.5 rounded-[11px]"
      style={{
        background: 'var(--color-exl-orange-soft)',
        border: '1px solid var(--color-exl-orange-line)',
      }}
    >
      <History className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-exl-orange-bright)' }} />
      <span style={{ fontSize: 12.5, color: 'var(--color-atlas-fg)' }}>
        Continuing your previous conversation
        {userTurns > 0 ? ` · ${label}` : ''}
      </span>
      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={dismissResumeBanner}
          className="transition-opacity hover:opacity-70"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-exl-orange-bright)',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          Resume
        </button>
        <button
          onClick={() => {
            if (window.confirm('Start a new session? Your current conversation will be cleared.')) {
              void startNewSession();
            }
          }}
          className="inline-flex items-center gap-1 transition-opacity hover:opacity-70"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-exl-orange-bright)',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <Plus className="w-3 h-3" />
          Start new
        </button>
        <button
          onClick={dismissResumeBanner}
          className="p-0.5 transition-opacity hover:opacity-70"
          aria-label="Dismiss"
          title="Dismiss"
          style={{ background: 'transparent', cursor: 'pointer' }}
        >
          <X className="w-3.5 h-3.5" style={{ color: 'var(--color-atlas-fg-subtle)' }} />
        </button>
      </div>
    </div>
  );
}
