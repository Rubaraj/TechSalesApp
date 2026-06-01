/**
 * Phase 2.5 — Pulsing badge in the Header showing an active call's duration.
 *
 * Hidden when no call is active. Click expands the (possibly-collapsed)
 * CallPanel from any route.
 *
 * Responsive:
 *   - `lg+`: full pill (icon + `mm:ss`)
 *   - below `md`: icon-only with timer in tooltip
 *   Prevents the already-crowded Header from overflowing on narrow viewports.
 *
 * The collapsed CallPanel right-edge strip ALSO shows a timer. That's
 * intentional redundancy: the strip is the panel's own state; the badge is
 * the at-a-glance signal that survives panel collapse.
 */
import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { useCallContext } from '../../context/CallContext';

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function ActiveCallBadge() {
  const { state, setPanelOpen } = useCallContext();
  const [now, setNow] = useState<number>(() => Date.now());

  // Only show during a real in-flight call leg — not when the panel is open
  // in 'idle' (Dialer) state. Mirrors the same gate as Header's End button
  // and CallPanel's title/timer.
  const callInProgress =
    state.callStatus === 'connecting' ||
    state.callStatus === 'ringing' ||
    state.callStatus === 'connected' ||
    state.callStatus === 'ending';

  useEffect(() => {
    if (!callInProgress) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [callInProgress]);

  if (!callInProgress) return null;

  const durationMs = state.callStartTime ? now - state.callStartTime : 0;
  const duration = formatDuration(durationMs);
  const tooltip = `Active call · ${duration}${
    state.dialedNumber ? ` · ${state.dialedNumber}` : ''
  } (click to expand panel)`;

  return (
    <button
      type="button"
      onClick={() => setPanelOpen(true)}
      title={tooltip}
      aria-label={tooltip}
      className="
        inline-flex items-center gap-1.5
        px-2 py-1
        rounded-full
        bg-primary-100 dark:bg-primary-900/40
        text-primary-700 dark:text-primary-300
        border border-primary-300 dark:border-primary-700
        text-xs font-medium
        hover:bg-primary-200 dark:hover:bg-primary-900/60
        transition-colors
        focus:outline-none focus:ring-2 focus:ring-primary-500
      "
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-600 dark:bg-primary-400" />
      </span>
      <Phone className="w-3.5 h-3.5" />
      {/* Timer hidden below md to keep the header tidy. */}
      <span className="hidden md:inline font-mono">{duration}</span>
    </button>
  );
}
