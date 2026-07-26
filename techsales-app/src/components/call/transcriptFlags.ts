/**
 * Gap 5 — inline transcript flag marking helpers (non-component module so
 * CallPanel/CallSection stay fast-refresh clean).
 *
 * Highest-severity compliance flag per transcript chunk. Dismissed alerts
 * still mark the bubble — the utterance WAS a violation; dismissal only
 * clears the sticky alert.
 */
import type { BubbleFlag } from './TranscriptBubble';

const SEVERITY_RANK: Record<'info' | 'warn' | 'critical', number> = {
  info: 0,
  warn: 1,
  critical: 2,
};

export function buildFlagByChunkId(
  flags: Array<{ chunkId?: string; severity?: 'info' | 'warn' | 'critical'; rule: string }>,
): Map<string, BubbleFlag> {
  const map = new Map<string, BubbleFlag>();
  for (const f of flags) {
    if (!f.chunkId) continue;
    const severity = f.severity ?? 'warn';
    const existing = map.get(f.chunkId);
    if (!existing || SEVERITY_RANK[severity] > SEVERITY_RANK[existing.severity]) {
      map.set(f.chunkId, { severity, rule: f.rule });
    }
  }
  return map;
}
