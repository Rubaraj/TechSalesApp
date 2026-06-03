/**
 * Phase 4 design — Atlas autonomy mode toggle (Silent · Assist · Auto Pilot).
 *
 * Segmented control matching the Claude Design "segmented" variant:
 * dark surface-3 track, orange-filled active pill with subtle shadow,
 * muted inactive labels, icon + label per segment. The mode set itself
 * (silent / assist / auto) is the same — only the chrome changed.
 *
 * Label abbreviation: "Auto" (not "Auto Pilot") keeps the segmented
 * control inside the Atlas panel header even at the 360px min width.
 * Full mode name is preserved in the title/tooltip for clarity.
 */
import { VolumeX, Hand, Rocket } from 'lucide-react';
import { useAtlas, type AtlasMode } from '../../context/AtlasContext';

interface ModeDef {
  id: AtlasMode;
  label: string;
  fullLabel: string;
  hint: string;
  Icon: typeof VolumeX;
}

const MODES: ModeDef[] = [
  {
    id: 'silent',
    label: 'Silent',
    fullLabel: 'Silent',
    hint: 'Silent — Atlas watches but never speaks up or takes action.',
    Icon: VolumeX,
  },
  {
    id: 'assist',
    label: 'Assist',
    fullLabel: 'Assist',
    hint: 'Assist — Atlas suggests; you approve every action.',
    Icon: Hand,
  },
  {
    id: 'auto',
    label: 'Auto',
    fullLabel: 'Auto Pilot',
    hint: 'Auto Pilot — Atlas drafts and acts on routine work; writes still need approval.',
    Icon: Rocket,
  },
];

export function ModeToggle(): React.JSX.Element {
  const { mode, setMode } = useAtlas();

  return (
    <div
      role="radiogroup"
      aria-label="Atlas autonomy mode"
      style={{
        display: 'inline-flex',
        background: 'var(--color-atlas-surface-3)',
        border: '1px solid var(--color-atlas-border)',
        borderRadius: 11,
        padding: 3,
        gap: 2,
      }}
    >
      {MODES.map((m) => {
        const on = m.id === mode;
        const { Icon } = m;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setMode(m.id)}
            title={m.hint}
            aria-label={m.fullLabel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 10px',
              borderRadius: 8,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              border: 'none',
              background: on ? 'var(--color-exl-orange)' : 'transparent',
              color: on ? '#fff' : 'var(--color-atlas-fg-muted)',
              boxShadow: on ? '0 1px 2px rgba(0,0,0,0.20)' : 'none',
              transition: 'background 120ms var(--ease-atlas), color 120ms var(--ease-atlas)',
            }}
            onMouseEnter={(e) => {
              if (!on) e.currentTarget.style.color = 'var(--color-atlas-fg)';
            }}
            onMouseLeave={(e) => {
              if (!on) e.currentTarget.style.color = 'var(--color-atlas-fg-muted)';
            }}
          >
            <Icon className="w-3 h-3" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
