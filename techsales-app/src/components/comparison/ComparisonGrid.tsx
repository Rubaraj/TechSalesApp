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
 *   highlightChanges: when true, rows where values differ across columns
 *             are tinted amber. Rows whose cells are React nodes should
 *             provide `compareValues` (primitives) — node identity always
 *             differs, so diffing falls back to compareValues when present.
 *   collapseUnchanged: when true (with highlightChanges), identical rows
 *             are tucked behind a "Show N identical rows" expander. Rows
 *             with `alwaysShow` (e.g. Plan Name, Premium) never collapse.
 *   columnLinks: optional per-column click targets — column headers become
 *             links (used by PlanCompare to open each plan's detail page).
 */
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

export interface ComparisonRow {
  label: string;
  /** Cell renderables — strings, numbers, or already-rendered React nodes. */
  values: Array<ReactNode | string | number | null | undefined>;
  /** Primitive stand-ins for diffing when `values` are React nodes. */
  compareValues?: Array<string | number | null | undefined>;
  /** Never collapse this row, even when identical across columns. */
  alwaysShow?: boolean;
}

interface ComparisonGridProps {
  columns: string[];
  items: ComparisonRow[];
  /** Optional column header tint hint, one per column. */
  columnTint?: string[];
  /** Optional per-column routes; when set, headers render as links. */
  columnLinks?: Array<string | undefined>;
  highlightChanges?: boolean;
  collapseUnchanged?: boolean;
  className?: string;
}

function rowChanged(row: ComparisonRow): boolean {
  const vals = row.compareValues ?? row.values;
  if (vals.length < 2) return false;
  const first = vals[0];
  return vals.some((v) => v !== first);
}

export function ComparisonGrid({
  columns,
  items,
  columnTint,
  columnLinks,
  highlightChanges = false,
  collapseUnchanged = false,
  className = '',
}: ComparisonGridProps) {
  const navigate = useNavigate();
  const [showIdentical, setShowIdentical] = useState(false);
  const colCount = columns.length;
  const gridStyle = { gridTemplateColumns: `1.4fr repeat(${colCount}, 1fr)` };

  const collapsing = highlightChanges && collapseUnchanged;
  const visibleRows = collapsing
    ? items.filter((r) => r.alwaysShow || rowChanged(r) || showIdentical)
    : items;
  const hiddenCount = items.length - (collapsing && !showIdentical ? visibleRows.length : items.length);

  const renderRow = (row: ComparisonRow, idx: number): ReactNode => {
    const changed = highlightChanges && rowChanged(row);
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
          <div key={i} className="p-4 text-center text-gray-900 dark:text-white">
            {v === null || v === undefined || v === '' ? (
              <span className="text-gray-400 dark:text-gray-500">—</span>
            ) : (
              v
            )}
          </div>
        ))}
      </div>
    );
  };

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
        {columns.map((col, i) => {
          const link = columnLinks?.[i];
          const tint = columnTint?.[i] ?? 'text-gray-700 dark:text-gray-300';
          if (!link) {
            return (
              <div key={col + i} className={`p-4 font-semibold text-center ${tint}`}>
                {col}
              </div>
            );
          }
          return (
            <button
              key={col + i}
              onClick={() => navigate(link)}
              title={`Open ${col}`}
              className={`p-4 font-semibold text-center ${tint} hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer`}
            >
              <span className="inline-flex items-center gap-1.5">
                {col}
                <ExternalLink className="w-3.5 h-3.5 opacity-60" />
              </span>
            </button>
          );
        })}
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {visibleRows.map(renderRow)}
      </div>

      {collapsing && hiddenCount > 0 && (
        <button
          onClick={() => setShowIdentical(true)}
          className="w-full py-3 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 flex items-center justify-center gap-1.5 border-t border-gray-100 dark:border-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
          Show {hiddenCount} identical {hiddenCount === 1 ? 'row' : 'rows'}
        </button>
      )}
      {collapsing && showIdentical && hiddenCount === 0 && items.some((r) => !r.alwaysShow && !rowChanged(r)) && (
        <button
          onClick={() => setShowIdentical(false)}
          className="w-full py-3 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 flex items-center justify-center gap-1.5 border-t border-gray-100 dark:border-gray-700 transition-colors"
        >
          <ChevronDown className="w-4 h-4" />
          Hide identical rows
        </button>
      )}
    </div>
  );
}
