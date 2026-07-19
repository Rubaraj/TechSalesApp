/**
 * Shared presentation helpers for the Supervision pages — one source of
 * truth for tag colors/icons, timestamps, and QA score tones (previously
 * duplicated and divergent between Supervision.tsx and
 * SupervisionCallDetail.tsx).
 */
import {
  ShieldAlert,
  Info,
  Tag,
  StickyNote,
  HeartPulse,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';

/** Chip/badge tones per tag kind (background style, for list chips). */
export const TAG_CHIP_TONES: Record<string, string> = {
  compliance: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400',
  entity: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400',
  info: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400',
  note: 'text-gray-600 bg-gray-100 dark:bg-gray-700/40 dark:text-gray-300',
  emotion: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400',
  coaching: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-400',
};

/** Bordered inline-tag tones (for transcript-inline tag markers). */
export const TAG_INLINE_TONES: Record<string, string> = {
  compliance:
    'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-300',
  info: 'border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/15 text-purple-700 dark:text-purple-300',
  entity:
    'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/15 text-blue-700 dark:text-blue-300',
  note: 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 text-gray-700 dark:text-gray-300',
  emotion:
    'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-300',
  coaching:
    'border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/15 text-violet-700 dark:text-violet-300',
};

export const TAG_ICONS: Record<string, LucideIcon> = {
  compliance: ShieldAlert,
  info: Info,
  entity: Tag,
  note: StickyNote,
  emotion: HeartPulse,
  coaching: Lightbulb,
};

/** Time for today's timestamps, date + time otherwise. */
export function formatWhen(ts: number | string): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  return sameDay
    ? d.toLocaleTimeString()
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** QA overall/dimension score → text tone class. */
export function scoreTone(score: number): string {
  return score >= 80
    ? 'text-green-600 dark:text-green-400'
    : score >= 60
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400';
}

/** mm:ss elapsed for live tickers. */
export function formatElapsed(startedAt: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
