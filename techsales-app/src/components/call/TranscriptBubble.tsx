/**
 * One transcript line. Renders speaker-aligned bubbles for diarized calls
 * (agent → right gray, prospect → left blue) and falls back to a single-
 * column monologue layout when every chunk shares one speaker (e.g. Web
 * Speech fallback where everything is 'agent').
 *
 * Gap 5 — when a compliance flag anchors to this chunk, the bubble gets a
 * severity-toned border/tint + glyph so the agent sees WHICH utterance
 * tripped the rule as the transcript scrolls (tooltip carries the rule).
 */
import { AlertTriangle } from 'lucide-react';
import type { TranscriptChunk } from '../../types/call';

export interface BubbleFlag {
  severity: 'info' | 'warn' | 'critical';
  rule: string;
}

interface TranscriptBubbleProps {
  chunk: TranscriptChunk;
  /** When false, the parent renders all bubbles in a single column without
   *  the speaker pill — used in Web Speech fallback. */
  diarized: boolean;
  /** Format mm:ss offset from call start. */
  offsetLabel: string;
  /** Gap 5 — highest-severity compliance flag anchored to this chunk. */
  flag?: BubbleFlag;
}

/** Severity → bubble treatment (mirrors ComplianceAlert's palette). */
const FLAG_TONES: Record<BubbleFlag['severity'], { bubble: string; glyph: string }> = {
  critical: {
    bubble: 'ring-1 ring-red-400 dark:ring-red-600 bg-red-50 dark:bg-red-900/30 text-red-900 dark:text-red-100',
    glyph: 'text-red-600 dark:text-red-400',
  },
  warn: {
    bubble: 'ring-1 ring-amber-400 dark:ring-amber-600 bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100',
    glyph: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    bubble: 'ring-1 ring-blue-400 dark:ring-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100',
    glyph: 'text-blue-600 dark:text-blue-400',
  },
};

export function TranscriptBubble({ chunk, diarized, offsetLabel, flag }: TranscriptBubbleProps) {
  const tone = flag ? FLAG_TONES[flag.severity] : null;

  if (!diarized) {
    return (
      <div className="text-sm leading-snug" title={flag?.rule}>
        <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mr-1.5">
          [{offsetLabel}]
        </span>
        {tone && <AlertTriangle className={`inline w-3 h-3 mr-1 ${tone.glyph}`} />}
        <span className="text-gray-800 dark:text-gray-100">{chunk.text}</span>
      </div>
    );
  }

  const isAgent = chunk.speaker === 'agent';
  const sideClasses = isAgent ? 'justify-end' : 'justify-start';
  const bubbleClasses = isAgent
    ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-tr-sm'
    : 'bg-primary-50 dark:bg-primary-900/30 text-primary-900 dark:text-primary-100 rounded-tl-sm';
  const pillClasses = isAgent
    ? 'text-[9px] uppercase tracking-wider text-gray-500 dark:text-gray-400'
    : 'text-[9px] uppercase tracking-wider text-primary-600 dark:text-primary-400';
  const label = isAgent ? 'Agent' : chunk.speaker === 'prospect' ? 'Prospect' : 'Unknown';

  return (
    <div className={`flex ${sideClasses}`}>
      <div className="max-w-[80%]">
        <div className={`flex items-baseline gap-1.5 ${isAgent ? 'justify-end' : 'justify-start'} mb-0.5`}>
          {tone && <AlertTriangle className={`w-3 h-3 self-center ${tone.glyph}`} />}
          <span className={pillClasses}>{label}</span>
          <span className="text-[9px] font-mono text-gray-400 dark:text-gray-500">
            [{offsetLabel}]
          </span>
        </div>
        <div
          className={`px-2.5 py-1.5 rounded-lg text-sm leading-snug ${tone ? tone.bubble : bubbleClasses}`}
          title={flag?.rule}
        >
          {chunk.text}
        </div>
      </div>
    </div>
  );
}
