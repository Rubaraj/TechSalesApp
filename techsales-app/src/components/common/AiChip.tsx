/**
 * Phase 3b — Tiny "AI" badge rendered next to a LeadForm field that the AI
 * auto-filled during a live call. Persists until the agent edits the field
 * (LeadForm drops the chip on the next `handleChange` for that field).
 *
 * Pure presentational; no state.
 */
import { Sparkles } from 'lucide-react';

export function AiChip(): React.JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] uppercase font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200"
      title="Auto-filled from live transcript"
    >
      <Sparkles className="w-2.5 h-2.5" />
      AI
    </span>
  );
}
