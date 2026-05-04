/**
 * Phase 4 — Inline "Check coverage" button next to a tagged drug on the
 * Lead Detail page. Opens `DrugCoverageModal`. Returns null when AI is off.
 */
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAiEnabled } from '../../hooks/useAiEnabled';
import type { Lead, TaggedDrug } from '../../types';
import { DrugCoverageModal } from './DrugCoverageModal';

interface DrugCoverageButtonProps {
  lead: Lead;
  drug: TaggedDrug;
}

export function DrugCoverageButton({ lead, drug }: DrugCoverageButtonProps) {
  const aiEnabled = useAiEnabled();
  const [open, setOpen] = useState(false);

  if (!aiEnabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="
          inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium
          bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300
          border border-primary-200 dark:border-primary-800
          hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors
        "
      >
        <Sparkles className="w-3 h-3" />
        Check coverage
      </button>
      {open && (
        <DrugCoverageModal
          lead={lead}
          drug={drug}
          isOpen={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
