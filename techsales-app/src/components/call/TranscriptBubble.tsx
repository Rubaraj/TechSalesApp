/**
 * One transcript line. Renders speaker-aligned bubbles for diarized calls
 * (agent → right gray, prospect → left blue) and falls back to a single-
 * column monologue layout when every chunk shares one speaker (e.g. Web
 * Speech fallback where everything is 'agent').
 */
import type { TranscriptChunk } from '../../types/call';

interface TranscriptBubbleProps {
  chunk: TranscriptChunk;
  /** When false, the parent renders all bubbles in a single column without
   *  the speaker pill — used in Web Speech fallback. */
  diarized: boolean;
  /** Format mm:ss offset from call start. */
  offsetLabel: string;
}

export function TranscriptBubble({ chunk, diarized, offsetLabel }: TranscriptBubbleProps) {
  if (!diarized) {
    return (
      <div className="text-sm leading-snug">
        <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mr-1.5">
          [{offsetLabel}]
        </span>
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
          <span className={pillClasses}>{label}</span>
          <span className="text-[9px] font-mono text-gray-400 dark:text-gray-500">
            [{offsetLabel}]
          </span>
        </div>
        <div className={`px-2.5 py-1.5 rounded-lg text-sm leading-snug ${bubbleClasses}`}>
          {chunk.text}
        </div>
      </div>
    </div>
  );
}
