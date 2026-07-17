/**
 * Rich-chat — non-component helpers shared by the display cards. Kept out
 * of CardChrome.tsx so component files export only components (react-refresh
 * fast-refresh constraint).
 */

/** Shared status color convention (mirrors IdentifiedLeadCard STATUS_TONE). */
export const STATUS_COLORS: Record<string, string> = {
  'New Lead': '#4f93f7',
  'Contacted Lead': '#9580ff',
  'Appointment Schedule': '#eab308',
  'Enrollment in progress': '#f97316',
  Enrolled: '#6ad48f',
  'Dropped / Lost lead': '#ff6b6b',
};

export const isStr = (v: unknown): v is string => typeof v === 'string';
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const asObj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
