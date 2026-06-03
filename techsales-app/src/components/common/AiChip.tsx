/**
 * Phase 4 design — "AI" badge rendered next to a LeadForm field that
 * Atlas auto-filled during a live call. Persists until the agent edits
 * the field (LeadForm drops the chip on the next `handleChange`).
 *
 * Uses the amber AI accent tokens (--color-ai-amber*) so it pairs
 * visually with the `.ai-filled` border-trace animation on the input.
 */
import { Sparkles } from 'lucide-react';

export function AiChip(): React.JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-bold uppercase tracking-[0.06em]"
      style={{
        background: 'var(--color-ai-amber-soft)',
        color: '#d4a017',
        border: '1px solid rgba(234, 179, 8, 0.30)',
        lineHeight: 1,
      }}
      title="Auto-filled from live transcript"
    >
      <Sparkles className="w-2.5 h-2.5" />
      AI
    </span>
  );
}
