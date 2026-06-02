/**
 * Phase 3a — Single compliance violation banner.
 *
 * Red-tinted alert showing the phrase the agent said + CMS rule cited +
 * suggested rephrase + dismiss X. On dismiss the flag is marked dismissed
 * in the reducer; the wrapper (`ComplianceAlerts` in CallPanel) handles the
 * fade-then-filter so this component stays purely presentational.
 */
import { AlertTriangle, X } from 'lucide-react';
import type { ComplianceFlag } from '../../types/call';
import { useCallContext } from '../../context/CallContext';

interface Props {
  flag: ComplianceFlag;
}

export function ComplianceAlert({ flag }: Props): React.JSX.Element {
  const { dismissComplianceFlag } = useCallContext();

  return (
    <div
      role="alert"
      className={`px-3 py-2 rounded-md border text-xs flex gap-2 transition-opacity duration-500 ${
        flag.dismissed
          ? 'opacity-40 line-through bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800'
          : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800'
      }`}
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-red-800 dark:text-red-200">
          “{flag.phrase}”
        </p>
        <p className="text-red-700 dark:text-red-300 mt-0.5">{flag.rule}</p>
        <p className="text-red-600 dark:text-red-400 mt-0.5 italic">
          Try: {flag.suggestion}
        </p>
      </div>
      {!flag.dismissed && (
        <button
          onClick={() => dismissComplianceFlag(flag.id)}
          className="p-1 -m-1 rounded hover:bg-red-100 dark:hover:bg-red-900/40 shrink-0"
          aria-label="Dismiss compliance alert"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5 text-red-700 dark:text-red-300" />
        </button>
      )}
    </div>
  );
}
