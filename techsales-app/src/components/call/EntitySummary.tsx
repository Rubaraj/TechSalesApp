/**
 * Phase 3a — Collapsible "Extracted (n)" panel at the bottom of CallPanel.
 *
 * Reads `state.extractedEntities` and shows non-empty groups (zip, drugs,
 * plan-type mentions, providers, pharmacies). Default collapsed; expands on
 * click. Renders nothing when the entity set is empty.
 */
import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallContext } from '../../context/CallContext';

interface EntityRow {
  label: string;
  value: React.ReactNode;
}

export function EntitySummary(): React.JSX.Element | null {
  const { state } = useCallContext();
  const e = state.extractedEntities;
  const [open, setOpen] = useState(false);

  const rows = useMemo<EntityRow[]>(() => {
    const out: EntityRow[] = [];
    if (e.zipCode) out.push({ label: 'Zip', value: e.zipCode });
    if (e.stateCounty && (e.stateCounty.state || e.stateCounty.county)) {
      out.push({
        label: 'Location',
        value: [e.stateCounty.county, e.stateCounty.state].filter(Boolean).join(', '),
      });
    }
    if (e.drugs.length > 0) {
      out.push({
        label: 'Drugs',
        value: (
          <span className="flex flex-wrap gap-1">
            {e.drugs.map((d, i) => (
              <span
                key={`${d.name}-${i}`}
                className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-[10px]"
              >
                {d.name}
                {d.dosage && <span className="ml-1 text-gray-500">{d.dosage}</span>}
                {d.frequency && <span className="ml-1 text-gray-500">· {d.frequency}</span>}
              </span>
            ))}
          </span>
        ),
      });
    }
    if (e.planTypeMentions.length > 0) {
      out.push({
        label: 'Plans',
        value: (
          <span className="flex flex-wrap gap-1">
            {e.planTypeMentions.map((p) => (
              <span
                key={p}
                className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200 text-[10px]"
              >
                {p}
              </span>
            ))}
          </span>
        ),
      });
    }
    if (e.providers.length > 0) {
      out.push({
        label: 'Providers',
        value: e.providers.map((p) => p.name).join(', '),
      });
    }
    if (e.pharmacies.length > 0) {
      out.push({
        label: 'Pharmacies',
        value: e.pharmacies.map((p) => p.name).join(', '),
      });
    }
    return out;
  }, [e]);

  if (rows.length === 0) return null;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Extracted ({rows.length})
      </button>
      {open && (
        <dl className="px-3 pb-2 space-y-1 text-xs">
          {rows.map((row) => (
            <div key={row.label} className="flex gap-2">
              <dt className="text-gray-500 dark:text-gray-400 w-16 shrink-0">{row.label}</dt>
              <dd className="text-gray-900 dark:text-gray-100 min-w-0 flex-1">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
