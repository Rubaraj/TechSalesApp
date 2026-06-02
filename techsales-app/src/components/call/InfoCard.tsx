/**
 * Phase 3a — Single info card (Medicare term explanation, plans link, etc.).
 *
 * Blue-tinted card: icon + title + 2-3 sentence content + optional link list.
 * Clicking a link routes via React Router. Purely presentational; producer is
 * `useCallAnalysis` which materializes `show_info` / `show_plans_link` AI
 * actions into `state.infoCards`.
 */
import { Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { InfoCard as InfoCardData } from '../../types/call';

interface Props {
  card: InfoCardData;
}

export function InfoCard({ card }: Props): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="px-3 py-2 rounded-md border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-xs flex gap-2">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-blue-900 dark:text-blue-100">{card.title}</p>
        <p className="text-blue-800 dark:text-blue-200 mt-0.5">{card.content}</p>
        {card.links && card.links.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {card.links.map((link) => (
              <li key={link.url}>
                <button
                  onClick={() => navigate(link.url)}
                  className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-200 text-[11px] transition-colors"
                >
                  {link.label} →
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
