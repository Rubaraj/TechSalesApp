/**
 * Phase 4 design — Atlas avatar (radar / sonar). Rounded-square orange→amber
 * tile with a pulsing core and concentric pings. Animates ONLY when
 * `animate` is true (i.e., while Atlas is "thinking"); static otherwise.
 *
 * Source: Design System/assets/atlas-mark.html + kit.css keyframes
 * (atlas-core, atlas-ping). Tokens come from index.css.
 */
interface Props {
  size?: number;
  animate?: boolean;
}

export function AtlasMark({ size = 36, animate = false }: Props): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Atlas AI"
    >
      <defs>
        <linearGradient id="atlas-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
        <radialGradient id="atlas-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffce7a" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#ffce7a" stopOpacity="0.0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="48" height="48" rx="12" fill="url(#atlas-tile)" />
      <circle cx="24" cy="24" r="14" fill="url(#atlas-glow)" />
      {/* concentric pings — fire only when animate=true */}
      {animate && (
        <>
          <circle
            cx="24"
            cy="24"
            r="6"
            fill="none"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="1.25"
            className="atlas-ping"
            style={{ animationDuration: '2.6s', animationDelay: '0s' }}
          />
          <circle
            cx="24"
            cy="24"
            r="6"
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1.25"
            className="atlas-ping"
            style={{ animationDuration: '2.6s', animationDelay: '0.85s' }}
          />
        </>
      )}
      {/* core dot */}
      <circle
        cx="24"
        cy="24"
        r="4.5"
        fill="#ffffff"
        className={animate ? 'atlas-core' : ''}
      />
    </svg>
  );
}
