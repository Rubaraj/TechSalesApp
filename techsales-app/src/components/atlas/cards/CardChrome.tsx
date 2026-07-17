/**
 * Rich-chat — shared shell for Atlas display cards. Mirrors the proven
 * ApprovalCard chrome (surface-2, atlas border, radius 14, card shadow,
 * orange icon header, optional uppercase pill) so all cards read as one
 * family. Cards must stay legible from 328px (panel min) to 568px.
 */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function CardChrome({
  icon: Icon,
  title,
  pill,
  children,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  pill?: string;
  children: ReactNode;
  footer?: ReactNode;
}): React.JSX.Element {
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
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2.5">
        <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--color-exl-orange-bright)' }} />
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: 'var(--color-atlas-fg)',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {pill && (
          <span
            className="ml-auto shrink-0"
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-exl-orange-bright)',
              background: 'var(--color-exl-orange-soft)',
              padding: '3px 9px',
              borderRadius: 999,
            }}
          >
            {pill}
          </span>
        )}
      </div>
      <div style={{ borderTop: '1px solid var(--color-atlas-border)' }}>{children}</div>
      {footer && (
        <div
          className="px-3.5 py-2.5 flex gap-2"
          style={{ borderTop: '1px solid var(--color-atlas-border)' }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

export function KvRow({ label, value }: { label: string; value: ReactNode }): React.JSX.Element {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--color-atlas-fg-muted)' }}>
      <span>{label}: </span>
      <b style={{ color: 'var(--color-atlas-fg)', fontWeight: 600 }}>{value}</b>
    </div>
  );
}

export function CardButton({
  onClick,
  disabled,
  primary,
  children,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: ReactNode;
  title?: string;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        fontSize: 13,
        fontWeight: 600,
        background: primary ? 'var(--color-exl-orange)' : 'var(--color-atlas-surface-3)',
        color: primary ? '#fff' : 'var(--color-atlas-fg-muted)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = primary
          ? 'var(--color-exl-orange-bright)'
          : 'var(--color-atlas-surface-4)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = primary
          ? 'var(--color-exl-orange)'
          : 'var(--color-atlas-surface-3)';
      }}
    >
      {children}
    </button>
  );
}

/** "+N more" trailing line for row-capped card bodies. */
export function MoreLine({ count, noun }: { count: number; noun: string }): React.JSX.Element | null {
  if (count <= 0) return null;
  return (
    <div
      className="px-3.5 py-2"
      style={{ fontSize: 11.5, color: 'var(--color-atlas-fg-subtle)', fontStyle: 'italic' }}
    >
      +{count} more {noun}
    </div>
  );
}

/** Compact fallback body when a card's data fails its defensive adapter. */
export function CardDataUnavailable(): React.JSX.Element {
  return (
    <div className="px-3.5 py-3" style={{ fontSize: 12.5, color: 'var(--color-atlas-fg-subtle)' }}>
      Result data unavailable — see the tool trace above.
    </div>
  );
}
