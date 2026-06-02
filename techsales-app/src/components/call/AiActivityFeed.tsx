/**
 * Phase 3b.1 — AI activity feed rendered in the CallPanel's bottom 50%.
 *
 * Reads `state.aiActivityLog` newest-first. Each row: emoji icon + relative
 * time chip ("12s ago") + truncated text. Color-coded left border by kind
 * (compliance=red, fills/drugs/pharmacy/provider=primary, note=gray, info=blue).
 * Auto-scrolls to the newest entry as it arrives.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCallContext } from '../../context/CallContext';
import type { AiActivityEntry } from '../../types/call';

// useRef is intentionally re-exported here so the linter sees the import as used
// (referenced inside the listRef declaration). Suppression note for future
// refactors: if the auto-scroll behavior is removed, this import can drop too.
void useRef;

function relativeTime(ts: number, now: number): string {
  const secs = Math.max(0, Math.floor((now - ts) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h`;
}

const KIND_BORDER: Record<AiActivityEntry['kind'], string> = {
  compliance: 'border-l-red-500',
  fill: 'border-l-primary-500',
  drug: 'border-l-primary-500',
  pharmacy: 'border-l-primary-500',
  provider: 'border-l-primary-500',
  note: 'border-l-gray-400',
  info: 'border-l-blue-500',
};

const KIND_BG: Record<AiActivityEntry['kind'], string> = {
  compliance: 'bg-red-50/40 dark:bg-red-900/10',
  fill: 'bg-primary-50/30 dark:bg-primary-900/10',
  drug: 'bg-primary-50/30 dark:bg-primary-900/10',
  pharmacy: 'bg-primary-50/30 dark:bg-primary-900/10',
  provider: 'bg-primary-50/30 dark:bg-primary-900/10',
  note: 'bg-gray-50/50 dark:bg-gray-800/40',
  info: 'bg-blue-50/40 dark:bg-blue-900/10',
};

export function AiActivityFeed(): React.JSX.Element {
  const { state } = useCallContext();
  const entries = state.aiActivityLog;

  // Newest first.
  const ordered = useMemo(() => [...entries].reverse(), [entries]);

  // Tick once per second so relative times stay current. `now` is sourced
  // INSIDE the state setter (not at render time) to keep the component pure
  // per React's rules-of-hooks.
  const now = useNowTick();

  const listRef = useRef<HTMLDivElement | null>(null);
  // Auto-scroll to top when a new entry arrives (the visually newest row).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = 0;
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 border-y border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40">
          🤖 AI Activity
        </div>
        <div className="flex-1 flex items-center justify-center text-xs italic text-gray-400 dark:text-gray-500 px-4 text-center">
          AI activity will appear here as the call progresses.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 border-y border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40 flex items-center justify-between">
        <span>🤖 AI Activity</span>
        <span className="text-gray-400 normal-case">{entries.length}</span>
      </div>
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1"
        role="log"
        aria-live="polite"
        aria-label="AI activity feed"
      >
        {ordered.map((entry) => (
          <div
            key={entry.id}
            className={`flex items-start gap-2 px-2 py-1 rounded-md border-l-2 text-xs ${KIND_BORDER[entry.kind]} ${KIND_BG[entry.kind]}`}
          >
            <span className="shrink-0 leading-none mt-0.5" aria-hidden="true">
              {entry.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 dark:text-gray-100 truncate">{entry.text}</p>
            </div>
            <span className="shrink-0 text-[10px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">
              {relativeTime(entry.timestamp, now)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Small custom hook — returns the current epoch ms, refreshed each second.
// State setter runs `Date.now()` inside its updater (not during render) so
// the host component stays pure.
function useNowTick(): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
