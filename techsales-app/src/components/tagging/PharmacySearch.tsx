import { useState, useEffect, useCallback } from 'react';
import { Search, MapPin, Phone, X, Plus, Check, Loader2 } from 'lucide-react';
import { Button, Badge } from '../common';
import type { Pharmacy } from '../../types';
import { searchPharmacies } from '../../services/pharmacyService';

interface PharmacySearchProps {
  selectedPharmacies: string[];
  onSelect: (pharmacyIds: string[]) => void;
  zipCode?: string;
  maxSelections?: number;
}

export function PharmacySearch({
  selectedPharmacies,
  onSelect,
  zipCode,
  maxSelections = 5,
}: PharmacySearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Search pharmacies
  const doSearch = useCallback(async () => {
    if (!searchTerm && !zipCode) {
      setPharmacies([]);
      return;
    }

    setIsLoading(true);
    const result = await searchPharmacies({
      searchTerm: searchTerm || undefined,
      zipCode: zipCode || undefined,
      pageSize: 20,
    });

    if (result.success && result.data) {
      setPharmacies(result.data.data);
    }
    setIsLoading(false);
  }, [searchTerm, zipCode]);

  useEffect(() => {
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [doSearch]);

  // Toggle pharmacy selection
  const togglePharmacy = (pharmacyId: string) => {
    if (selectedPharmacies.includes(pharmacyId)) {
      onSelect(selectedPharmacies.filter(id => id !== pharmacyId));
    } else if (selectedPharmacies.length < maxSelections) {
      onSelect([...selectedPharmacies, pharmacyId]);
    }
  };

  // Remove pharmacy
  const removePharmacy = (pharmacyId: string) => {
    onSelect(selectedPharmacies.filter(id => id !== pharmacyId));
  };

  // Get selected pharmacy details
  const getPharmacyName = (pharmacyId: string) => {
    const pharmacy = pharmacies.find(p => p.pharmacyId === pharmacyId);
    return pharmacy?.name || pharmacyId;
  };

  return (
    <div className="space-y-4">
      {/* Selected Pharmacies */}
      {selectedPharmacies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedPharmacies.map((pharmacyId) => (
            <div
              key={pharmacyId}
              className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-full"
            >
              <MapPin className="w-3 h-3 text-orange-600 dark:text-orange-400" />
              <span className="text-sm text-orange-700 dark:text-orange-300">
                {getPharmacyName(pharmacyId)}
              </span>
              <button
                onClick={() => removePharmacy(pharmacyId)}
                className="p-0.5 rounded-full hover:bg-orange-200 dark:hover:bg-orange-800"
              >
                <X className="w-3 h-3 text-orange-600 dark:text-orange-400" />
              </button>
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
            placeholder="Search pharmacies by name, city, or zip..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
          )}
        </div>

        {/* Results Dropdown */}
        {showResults && pharmacies.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {pharmacies.map((pharmacy) => {
              const isSelected = selectedPharmacies.includes(pharmacy.pharmacyId);
              const canSelect = selectedPharmacies.length < maxSelections;

              return (
                <button
                  key={pharmacy.pharmacyId}
                  onClick={() => {
                    togglePharmacy(pharmacy.pharmacyId);
                  }}
                  disabled={!isSelected && !canSelect}
                  className={`
                    w-full px-4 py-3 text-left flex items-start gap-3 border-b border-gray-100 dark:border-gray-700 last:border-0
                    ${isSelected
                      ? 'bg-orange-50 dark:bg-orange-900/20'
                      : canSelect
                        ? 'hover:bg-gray-50 dark:hover:bg-gray-700'
                        : 'opacity-50 cursor-not-allowed'
                    }
                  `}
                >
                  <div className={`
                    mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0
                    ${isSelected
                      ? 'bg-orange-600 border-orange-600'
                      : 'border-gray-300 dark:border-gray-600'
                    }
                  `}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {pharmacy.name}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <MapPin className="w-3 h-3" />
                      {pharmacy.city}, {pharmacy.state} {pharmacy.zipCode}
                    </div>
                    {pharmacy.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <Phone className="w-3 h-3" />
                        {pharmacy.phone}
                      </div>
                    )}
                    <div className="flex gap-1 mt-1">
                      {pharmacy.isRetail && <Badge variant="default">Retail</Badge>}
                      {pharmacy.isMailOrder && <Badge variant="info">Mail Order</Badge>}
                      {pharmacy.is24Hour && <Badge variant="success">24 Hour</Badge>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Helper text */}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {selectedPharmacies.length} of {maxSelections} pharmacies selected
        {zipCode && ` • Showing results near ${zipCode}`}
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

