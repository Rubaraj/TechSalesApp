/**
 * Tiny "listening..." waveform. Five vertical bars with staggered animation
 * delays. Pure CSS — no canvas, no deps. Animates only when `isActive`.
 */
import type { CSSProperties } from 'react';

interface CallWaveformProps {
  isActive: boolean;
  /** Tailwind colour class for the bars; defaults to primary-500. */
  barColor?: string;
}

const BAR_DELAYS_MS = [0, 120, 60, 180, 90];

export function CallWaveform({
  isActive,
  barColor = 'bg-primary-500 dark:bg-primary-400',
}: CallWaveformProps) {
  return (
    <div
      className="inline-flex items-end gap-[3px] h-5"
      role="presentation"
      aria-hidden="true"
    >
      {BAR_DELAYS_MS.map((delay, i) => {
        const style: CSSProperties = {
          animationDelay: `${delay}ms`,
          animationDuration: '900ms',
        };
        return (
          <span
            key={i}
            style={style}
            className={[
              'w-[3px] rounded-full',
              barColor,
              isActive
                ? 'h-5 animate-[callwave_900ms_ease-in-out_infinite]'
                : 'h-1 opacity-40',
            ].join(' ')}
          />
        );
      })}
      {/* Keyframes defined globally in src/index.css (QA H5). */}
    </div>
  );
}
