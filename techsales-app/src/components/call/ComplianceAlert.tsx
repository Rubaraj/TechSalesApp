/**
 * Phase 3a — Single compliance violation banner.
 *
 * Severity-toned alert (critical=red, warn=amber, info=blue — set per rule
 * in Admin › Compliance Rules) showing the phrase the agent said + CMS rule
 * cited + suggested rephrase + dismiss X. On dismiss the flag is marked
 * dismissed in the reducer; the wrapper (`ComplianceAlerts` in CallPanel)
 * handles the fade-then-filter so this component stays purely presentational.
 */
import { AlertTriangle, X } from 'lucide-react';
import type { ComplianceFlag } from '../../types/call';
import { useCallContext } from '../../context/CallContext';

interface Props {
  flag: ComplianceFlag;
}

interface SeverityTone {
  label: string;
  box: string;
  boxDismissed: string;
  icon: string;
  title: string;
  body: string;
  hint: string;
  chip: string;
}

const TONES: Record<'critical' | 'warn' | 'info', SeverityTone> = {
  critical: {
    label: 'critical',
    box: 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800',
    boxDismissed: 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800',
    icon: 'text-red-600 dark:text-red-400',
    title: 'text-red-800 dark:text-red-200',
    body: 'text-red-700 dark:text-red-300',
    hint: 'text-red-600 dark:text-red-400',
    chip: 'bg-red-600 text-white',
  },
  warn: {
    label: 'warn',
    box: 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800',
    boxDismissed: 'bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800',
    icon: 'text-amber-600 dark:text-amber-400',
    title: 'text-amber-800 dark:text-amber-200',
    body: 'text-amber-700 dark:text-amber-300',
    hint: 'text-amber-600 dark:text-amber-400',
    chip: 'bg-amber-500 text-white',
  },
  info: {
    label: 'info',
    box: 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-800',
    boxDismissed: 'bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800',
    icon: 'text-blue-600 dark:text-blue-400',
    title: 'text-blue-800 dark:text-blue-200',
    body: 'text-blue-700 dark:text-blue-300',
    hint: 'text-blue-600 dark:text-blue-400',
    chip: 'bg-blue-500 text-white',
  },
};

export function ComplianceAlert({ flag }: Props): React.JSX.Element {
  const { dismissComplianceFlag } = useCallContext();
  const tone = TONES[flag.severity ?? 'warn'] ?? TONES.warn;

  return (
    <div
      role="alert"
      className={`px-3 py-2 rounded-md border text-xs flex gap-2 transition-opacity duration-500 ${
        flag.dismissed ? `opacity-40 line-through ${tone.boxDismissed}` : tone.box
      }`}
    >
      <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${tone.icon}`} />
      <div className="flex-1 min-w-0">
        <p className={`font-medium ${tone.title}`}>
          “{flag.phrase}”
          <span
            className={`ml-1.5 inline-block align-middle px-1.5 py-px rounded-full text-[9px] font-bold uppercase tracking-wider ${tone.chip}`}
          >
            {tone.label}
          </span>
        </p>
        <p className={`mt-0.5 ${tone.body}`}>{flag.rule}</p>
        <p className={`mt-0.5 italic ${tone.hint}`}>Try: {flag.suggestion}</p>
      </div>
      {!flag.dismissed && (
        <button
          onClick={() => dismissComplianceFlag(flag.id)}
          className={`p-1 -m-1 rounded hover:bg-black/5 dark:hover:bg-white/10 shrink-0 ${tone.body}`}
          aria-label="Dismiss compliance alert"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
