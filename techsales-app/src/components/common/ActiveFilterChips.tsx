import { X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { formatPeriodLabel } from '../../utils/drilldown';

interface ChipDef {
  /** URL params this chip owns; clearing the chip removes all of them. */
  keys: string[];
  label: string;
}

/**
 * Chips for filters that arrived via the URL (a drill-down from the
 * productivity dashboard). A narrowed list that looks unfiltered reads as
 * missing data, so the active window is always stated and always clearable.
 *
 * Clearing removes the params, which the host screen reacts to.
 */
export function ActiveFilterChips({ className = '' }: { className?: string }): React.ReactElement | null {
  const [searchParams, setSearchParams] = useSearchParams();

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const status = searchParams.get('status');
  const source = searchParams.get('source');

  const chips: ChipDef[] = [];
  const periodLabel = formatPeriodLabel(from, to);
  if (periodLabel) chips.push({ keys: ['from', 'to'], label: periodLabel });
  if (status) chips.push({ keys: ['status'], label: status });
  if (source) chips.push({ keys: ['source'], label: `Source: ${source}` });

  if (chips.length === 0) return null;

  const clear = (keys: string[]): void => {
    const next = new URLSearchParams(searchParams);
    keys.forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-sm text-gray-500 dark:text-gray-400">Showing:</span>
      {chips.map((chip) => (
        <span
          key={chip.keys.join(',')}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-sm font-medium text-primary-700 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-200"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => clear(chip.keys)}
            aria-label={`Clear ${chip.label} filter`}
            className="rounded-full p-0.5 hover:bg-primary-200 dark:hover:bg-primary-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => clear(['from', 'to', 'status', 'source'])}
          className="text-sm text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
