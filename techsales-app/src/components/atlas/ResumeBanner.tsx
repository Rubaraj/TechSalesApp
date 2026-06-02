/**
 * Phase 4 — "Continuing from your previous session" banner.
 *
 * Renders at the top of Atlas's chat area when the panel hydrates with
 * prior history. Gives the agent an explicit choice: keep going (dismiss
 * the banner) or wipe and start fresh.
 *
 * Auto-hides once the agent sends their first message in this session OR
 * clicks either action.
 */
import { History, X, Plus } from 'lucide-react';
import { useAtlas } from '../../context/AtlasContext';

export function ResumeBanner(): React.JSX.Element | null {
  const { resumedFromPriorSession, messages, dismissResumeBanner, startNewSession } =
    useAtlas();

  if (!resumedFromPriorSession || messages.length === 0) return null;

  const userTurns = messages.filter((m) => m.role === 'user').length;

  return (
    <div className="mx-3 mt-3 mb-1 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs flex items-start gap-2">
      <History className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
      <div className="flex-1 min-w-0">
        <p className="text-amber-900 dark:text-amber-100">
          Continuing your previous conversation
          {userTurns > 0 ? ` · ${userTurns} ${userTurns === 1 ? 'turn' : 'turns'}` : ''}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <button
            onClick={dismissResumeBanner}
            className="text-[11px] font-medium text-amber-800 dark:text-amber-200 hover:text-amber-900 dark:hover:text-amber-100 inline-flex items-center gap-1"
          >
            Resume
          </button>
          <span className="text-amber-300 dark:text-amber-700">·</span>
          <button
            onClick={() => {
              if (
                window.confirm(
                  'Start a new session? Your current conversation will be cleared.',
                )
              ) {
                void startNewSession();
              }
            }}
            className="text-[11px] font-medium text-amber-800 dark:text-amber-200 hover:text-amber-900 dark:hover:text-amber-100 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Start new
          </button>
        </div>
      </div>
      <button
        onClick={dismissResumeBanner}
        className="p-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-800/40"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <X className="w-3 h-3 text-amber-700 dark:text-amber-300" />
      </button>
    </div>
  );
}
