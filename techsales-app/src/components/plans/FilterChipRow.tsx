/**
 * Phase 4 — Small pill row showing the structured filters interpreted by
 * `aiService.search`. Each pill renders a label + value and an "x" affordance
 * that calls `onRemove(filterKey)`.
 */
import { X } from 'lucide-react';
import type { AISearchFilters } from '../../types/ai';

interface FilterChipRowProps {
  filters: AISearchFilters;
  onRemove: (key: keyof AISearchFilters) => void;
}

interface ChipDef {
  key: keyof AISearchFilters;
  label: string;
}

function buildChips(filters: AISearchFilters): ChipDef[] {
  const chips: ChipDef[] = [];
  if (filters.state) chips.push({ key: 'state', label: `State: ${filters.state}` });
  if (filters.planType) chips.push({ key: 'planType', label: `Type: ${filters.planType}` });
  if (filters.maxPremium !== undefined) {
    chips.push({ key: 'maxPremium', label: `≤ $${filters.maxPremium}/mo` });
  }
  if (filters.minStarRating !== undefined) {
    chips.push({ key: 'minStarRating', label: `≥ ${filters.minStarRating}★` });
  }
  if (filters.carrier) chips.push({ key: 'carrier', label: `${filters.carrier}` });
  if (filters.hasDental) chips.push({ key: 'hasDental', label: 'Dental' });
  if (filters.hasVision) chips.push({ key: 'hasVision', label: 'Vision' });
  if (filters.hasHearing) chips.push({ key: 'hasHearing', label: 'Hearing' });
  return chips;
}

export function FilterChipRow({ filters, onRemove }: FilterChipRowProps) {
  const chips = buildChips(filters);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip.key)}
          className="
            inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs
            bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300
            border border-primary-200 dark:border-primary-800
            hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors
          "
          aria-label={`Remove filter ${chip.label}`}
        >
          <span>{chip.label}</span>
          <X className="w-3 h-3" />
        </button>
      ))}
    </div>
  );
}
