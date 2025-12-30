import { useState, useEffect, useCallback } from 'react';
import { Search, Pill, X, Plus, Check, Loader2, ChevronDown } from 'lucide-react';
import { Button, Badge, Input, Select } from '../common';
import type { Drug, TaggedDrug } from '../../types';
import { searchDrugs, getDrugById } from '../../services/drugService';

interface DrugSearchProps {
  taggedDrugs: TaggedDrug[];
  onUpdate: (drugs: TaggedDrug[]) => void;
  maxDrugs?: number;
}

const frequencyOptions = [
  { value: 'once_daily', label: 'Once Daily' },
  { value: 'twice_daily', label: 'Twice Daily' },
  { value: 'three_times_daily', label: 'Three Times Daily' },
  { value: 'four_times_daily', label: 'Four Times Daily' },
  { value: 'as_needed', label: 'As Needed' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const supplyOptions = [
  { value: '30', label: '30 Days' },
  { value: '60', label: '60 Days' },
  { value: '90', label: '90 Days' },
];

export function DrugSearch({
  taggedDrugs,
  onUpdate,
  maxDrugs = 20,
}: DrugSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [editingDrug, setEditingDrug] = useState<TaggedDrug | null>(null);
  const [expandedDrug, setExpandedDrug] = useState<string | null>(null);

  // Search drugs
  const doSearch = useCallback(async () => {
    if (!searchTerm || searchTerm.length < 2) {
      setDrugs([]);
      return;
    }

    setIsLoading(true);
    const result = await searchDrugs({
      searchTerm,
      pageSize: 15,
    });

    if (result.success && result.data) {
      setDrugs(result.data.data);
    }
    setIsLoading(false);
  }, [searchTerm]);

  useEffect(() => {
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [doSearch]);

  // Add drug
  const addDrug = (drug: Drug) => {
    if (taggedDrugs.length >= maxDrugs) return;
    if (taggedDrugs.some(d => d.drugId === drug.drugId)) return;

    const newTaggedDrug: TaggedDrug = {
      drugId: drug.drugId,
      drugName: drug.brandName || drug.genericName,
      dosage: drug.strength || '',
      frequency: 'once_daily',
      quantity: 30,
      daysSupply: 30,
    };

    onUpdate([...taggedDrugs, newTaggedDrug]);
    setSearchTerm('');
    setShowResults(false);
    setExpandedDrug(drug.drugId);
  };

  // Remove drug
  const removeDrug = (drugId: string) => {
    onUpdate(taggedDrugs.filter(d => d.drugId !== drugId));
  };

  // Update drug details
  const updateDrug = (drugId: string, updates: Partial<TaggedDrug>) => {
    onUpdate(
      taggedDrugs.map(d =>
        d.drugId === drugId ? { ...d, ...updates } : d
      )
    );
  };

  return (
    <div className="space-y-4">
      {/* Tagged Drugs List */}
      {taggedDrugs.length > 0 && (
        <div className="space-y-2">
          {taggedDrugs.map((drug) => (
            <div
              key={drug.drugId}
              className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            >
              {/* Drug Header */}
              <div
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 cursor-pointer"
                onClick={() => setExpandedDrug(expandedDrug === drug.drugId ? null : drug.drugId)}
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <Pill className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {drug.drugName}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {drug.dosage} • {frequencyOptions.find(f => f.value === drug.frequency)?.label} • {drug.quantity} qty
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeDrug(drug.drugId);
                    }}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedDrug === drug.drugId ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Drug Details (Expanded) */}
              {expandedDrug === drug.drugId && (
                <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Input
                      label="Dosage"
                      value={drug.dosage}
                      onChange={(e) => updateDrug(drug.drugId, { dosage: e.target.value })}
                      placeholder="e.g., 10mg"
                    />
                    <Select
                      label="Frequency"
                      options={frequencyOptions}
                      value={drug.frequency}
                      onChange={(e) => updateDrug(drug.drugId, { frequency: e.target.value })}
                    />
                    <Input
                      label="Quantity"
                      type="number"
                      value={drug.quantity.toString()}
                      onChange={(e) => updateDrug(drug.drugId, { quantity: parseInt(e.target.value) || 0 })}
                    />
                    <Select
                      label="Days Supply"
                      options={supplyOptions}
                      value={drug.daysSupply.toString()}
                      onChange={(e) => updateDrug(drug.drugId, { daysSupply: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            placeholder="Search drugs by name..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            disabled={taggedDrugs.length >= maxDrugs}
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
          )}
        </div>

        {/* Results Dropdown */}
        {showResults && drugs.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {drugs.map((drug) => {
              const isAdded = taggedDrugs.some(d => d.drugId === drug.drugId);

              return (
                <button
                  key={drug.drugId}
                  onClick={() => !isAdded && addDrug(drug)}
                  disabled={isAdded}
                  className={`
                    w-full px-4 py-3 text-left flex items-start gap-3 border-b border-gray-100 dark:border-gray-700 last:border-0
                    ${isAdded
                      ? 'bg-gray-50 dark:bg-gray-800/50 opacity-50'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  <div className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 mt-0.5">
                    <Pill className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {drug.brandName || drug.genericName}
                    </p>
                    {drug.brandName && drug.genericName && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Generic: {drug.genericName}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {drug.strength && (
                        <Badge variant="default">{drug.strength}</Badge>
                      )}
                      {drug.dosageForm && (
                        <Badge variant="info">{drug.dosageForm}</Badge>
                      )}
                      {drug.drugClass && (
                        <Badge variant="primary">{drug.drugClass}</Badge>
                      )}
                    </div>
                  </div>
                  {isAdded ? (
                    <Check className="w-5 h-5 text-green-600 shrink-0" />
                  ) : (
                    <Plus className="w-5 h-5 text-gray-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Helper text */}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {taggedDrugs.length} of {maxDrugs} drugs added
        {searchTerm.length > 0 && searchTerm.length < 2 && ' • Type at least 2 characters to search'}
      </p>

      {/* Close results on click outside */}
      {showResults && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowResults(false)}
        />
      )}
    </div>
  );
}

