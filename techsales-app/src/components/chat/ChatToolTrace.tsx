/**
 * Inline trace of the agent's tool activity for the current turn. While the
 * stream is still flowing we show one line per tool call (start → end), with
 * a tiny status icon. Once the response is `final`, the parent collapses the
 * trace into a single "Used tools: …" summary.
 *
 * Kept deliberately small — this is meta-information, not the answer itself.
 */
import { Search, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export interface ToolTraceEntry {
  /** Stable id for React keys — agent run ids are perfect for this. */
  id: string;
  tool: string;
  /** Free-form human-readable description of what the tool was asked to do. */
  description?: string;
  /** Free-form human-readable description of what the tool returned. */
  resultSummary?: string;
  status: 'running' | 'done' | 'error';
  /** Tool latency in ms; only available once status !== 'running'. */
  latencyMs?: number;
}

interface ChatToolTraceProps {
  entries: ToolTraceEntry[];
  /** When true, render the collapsed "Used tools: …" pill instead of the live trace. */
  collapsed?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  search_plans: 'searching plans',
  check_drug_coverage: 'checking drug coverage',
  compare_plans: 'comparing plans',
  calc_savings: 'calculating savings',
  get_member_plan: 'fetching your plan',
};

function describeTool(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ');
}

export function ChatToolTrace({ entries, collapsed = false }: ChatToolTraceProps) {
  if (entries.length === 0) return null;

  if (collapsed) {
    const uniq = Array.from(new Set(entries.map((e) => e.tool)));
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 italic mb-2">
        Used tools: {uniq.join(', ')}
      </div>
    );
  }

  return (
    <div className="mb-2 space-y-1">
      {entries.map((e) => {
        let icon;
        if (e.status === 'running') {
          icon = <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-500" />;
        } else if (e.status === 'error') {
          icon = <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
        } else {
          icon = <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
        }
        return (
          <div
            key={e.id}
            className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded px-2 py-1"
          >
            <Search className="w-3.5 h-3.5 mt-0.5 text-gray-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {icon}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {describeTool(e.tool)}
                </span>
                {typeof e.latencyMs === 'number' && (
                  <span className="text-gray-400">({e.latencyMs}ms)</span>
                )}
              </div>
              {e.description && (
                <div className="text-gray-500 dark:text-gray-400 truncate">{e.description}</div>
              )}
              {e.resultSummary && (
                <div className="text-gray-500 dark:text-gray-400 truncate">{e.resultSummary}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
