/**
 * Phase 4 — Generic side-by-side comparison grid.
 *
 * Reused by:
 *   - YOYComparison (current vs previous year)
 *   - PlanCompare (2-4 plans across one year)
 *
 * Shape:
 *   columns:  array of human labels for each side-by-side column.
 *   items:    array of rows; each row has a `label` and a `values` array of
 *             length === columns.length.
 *   highlightChanges: when true, rows where `values` differ across columns
 *             are tinted amber.
 */
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ComparisonRow {
  label: string;
  /** Cell renderables — strings, numbers, or already-rendered React nodes. */
  values: Array<ReactNode | string | number | null | undefined>;
}

interface ComparisonGridProps {
  columns: string[];
  items: ComparisonRow[];
  /** Optional column header tint hint, one per column. */
  columnTint?: string[];
  highlightChanges?: boolean;
  className?: string;
}

function rowChanged(values: ComparisonRow['values']): boolean {
  if (values.length < 2) return false;
  const first = values[0];
  return values.some((v) => v !== first);
}

export function ComparisonGrid({
  columns,
  items,
  columnTint,
  highlightChanges = false,
  className = '',
}: ComparisonGridProps) {
  const colCount = columns.length;
  const gridStyle = { gridTemplateColumns: `1.4fr repeat(${colCount}, 1fr)` };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}
    >
      {/* Header row */}
      <div
        className="grid bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700"
        style={gridStyle}
      >
        <div className="p-4 font-semibold text-gray-700 dark:text-gray-300">Feature</div>
        {columns.map((col, i) => (
          <div
            key={col + i}
            className={`p-4 font-semibold text-center ${columnTint?.[i] ?? 'text-gray-700 dark:text-gray-300'}`}
          >
            {col}
          </div>
        ))}
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {items.map((row, idx) => {
          const changed = highlightChanges && rowChanged(row.values);
          return (
            <div
              key={`${row.label}-${idx}`}
              className={`grid ${changed ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}
              style={gridStyle}
            >
              <div className="p-4 font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800/30 flex items-center gap-2">
                {row.label}
                {changed && <AlertTriangle className="w-4 h-4 text-amber-500" />}
              </div>
              {row.values.map((v, i) => (
                <div
                  key={i}
                  className="p-4 text-center text-gray-900 dark:text-white"
                >
                  {v === null || v === undefined || v === '' ? (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  ) : (
                    v
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
