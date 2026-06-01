/**
 * Phase 2.5 — Horizontal chips of recently dialed numbers.
 *
 * Click chip → auto-dial immediately (matches PhoneButton contract; both
 * surfaces have the same one-click + cancel-toast semantics via the
 * `useCallContext().dialNumber` funnel).
 *
 * Right-click / long-press chip → edit mode (fills the input without
 * dialing). Useful when the agent wants to modify the number before dialing.
 */
import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { useCallContext } from '../../context/CallContext';
import { getRecent, type RecentCallEntry } from '../../services/recentCalls';
import { formatPhoneUS } from '../../utils/phoneUtils';

interface RecentCallsStripProps {
  /** Fired on right-click / long-press — fills the dialer input without dialing. */
  onEdit: (to: string) => void;
}

const VISIBLE_LIMIT = 5;
const LONG_PRESS_MS = 500;

export function RecentCallsStrip({ onEdit }: RecentCallsStripProps) {
  const { state, dialNumber } = useCallContext();
  const [recents, setRecents] = useState<RecentCallEntry[]>(() => getRecent());

  // Re-read on every call activation/deactivation so newly-added recents
  // appear after a dial. sessionStorage doesn't fire change events for the
  // same tab; we tie it to the lifecycle that creates recents.
  useEffect(() => {
    setRecents(getRecent());
  }, [state.isCallActive, state.dialedNumber]);

  if (recents.length === 0) return null;

  const visible = recents.slice(0, VISIBLE_LIMIT);

  return (
    <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        Recent
      </p>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((r) => (
          <RecentChip
            key={r.to}
            entry={r}
            disabled={state.isCallActive}
            onClick={() => dialNumber({ to: r.to, leadId: r.leadId, leadName: r.leadName })}
            onEdit={() => onEdit(r.to)}
          />
        ))}
      </div>
    </div>
  );
}

interface RecentChipProps {
  entry: RecentCallEntry;
  disabled: boolean;
  onClick: () => void;
  onEdit: () => void;
}

function RecentChip({ entry, disabled, onClick, onEdit }: RecentChipProps) {
  const touchTimerRef = useRef<number | null>(null);
  // QA M11 — when long-press fires Edit, the synthetic click that follows
  // touch-release would otherwise also trigger onClick (=dial). Track and
  // suppress.
  const longPressFiredRef = useRef<boolean>(false);
  const display = formatPhoneUS(entry.to);
  const label = entry.leadName ?? display;

  const startTouch = (): void => {
    longPressFiredRef.current = false;
    touchTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      touchTimerRef.current = null;
      onEdit();
    }, LONG_PRESS_MS);
  };
  const cancelTouch = (): void => {
    if (touchTimerRef.current !== null) {
      window.clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };
  const handleClick = (): void => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onEdit();
      }}
      onTouchStart={startTouch}
      onTouchEnd={cancelTouch}
      onTouchCancel={cancelTouch}
      disabled={disabled}
      className="
        inline-flex items-center gap-1.5
        px-2 py-1
        rounded-full
        bg-primary-50 dark:bg-primary-900/30
        text-primary-700 dark:text-primary-300
        text-[11px]
        border border-primary-200 dark:border-primary-800
        hover:bg-primary-100 dark:hover:bg-primary-900/50
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors
        select-none
        touch-manipulation
      "
      title={`${label} — click to dial, right-click to edit`}
      aria-label={`Call ${label}`}
    >
      <span className="font-medium">{label}</span>
      {entry.leadName && (
        <span className="text-[9px] opacity-70">{display}</span>
      )}
    </button>
  );
}
