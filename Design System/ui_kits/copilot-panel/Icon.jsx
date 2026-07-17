// Icon.jsx — Lucide line-icon wrapper + Atlas brand mark.
// Renders SVG into a React-leaf span (React never diffs the inner SVG).

function Icon({ name, size = 18, stroke = 1.9, color, style, className }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const host = ref.current;
    if (!host || !window.lucide) return;
    host.innerHTML = '';
    const i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    host.appendChild(i);
    try {
      window.lucide.createIcons({
        attrs: { width: size, height: size, 'stroke-width': stroke },
      });
    } catch (e) {}
  }, [name, size, stroke]);
  return (
    <span
      ref={ref}
      className={className}
      style={{ display: 'inline-flex', color: color || 'currentColor', lineHeight: 0, ...style }}
    />
  );
}

// The Atlas avatar — radar / sonar-ping mark (pulsing core + concentric pings).
function AtlasMark({ size = 28, radius, animate = true }) {
  const r = radius != null ? radius : Math.round(size * 0.3);
  const pingDur = animate ? '3s' : '0s';
  return (
    <span
      className="atlas-mark"
      style={{
        position: 'relative', width: size, height: size, borderRadius: r, flex: 'none',
        display: 'grid', placeItems: 'center', overflow: 'hidden',
        background: 'radial-gradient(120% 120% at 28% 22%, #ffc486 0%, var(--atlas-from) 36%, var(--atlas-to) 100%)',
        boxShadow: '0 4px 12px var(--atlas-glow), inset 0 1px 0 rgba(255,255,255,.4), inset 0 0 0 1px rgba(255,255,255,.10)',
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" style={{ width: '74%', height: '74%' }}>
        <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.35)" strokeWidth="1" />
        {animate && [0, 1, 2].map((i) => (
          <circle key={i} className="atlas-ping" cx="12" cy="12" r="4" stroke="#fff" strokeWidth="1.4"
            style={{ animationDuration: pingDur, animationDelay: i + 's' }} />
        ))}
        <circle className={animate ? 'atlas-core' : undefined} cx="12" cy="12" r="2.4" fill="#fff" />
      </svg>
    </span>
  );
}

Object.assign(window, { Icon, AtlasMark });
