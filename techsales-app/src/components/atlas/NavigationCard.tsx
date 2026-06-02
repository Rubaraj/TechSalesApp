/**
 * Phase 4 (M4) — Click-to-go navigation suggestion. Rendered in Assist mode.
 * In Auto Pilot the suggestion is consumed by a navigation listener (separate
 * follow-up); in Silent it's suppressed.
 */
import { useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
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
    <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-amber-900 dark:text-amber-100">{suggestion.reason}</p>
        <p className="text-[11px] font-mono text-amber-700 dark:text-amber-300 mt-0.5">
          {suggestion.route}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-800/40"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <X className="w-3 h-3 text-amber-700 dark:text-amber-300" />
      </button>
      <button
        onClick={onOpen}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-medium"
      >
        Open
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}
