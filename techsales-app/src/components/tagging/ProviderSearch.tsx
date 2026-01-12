import { useState, useEffect, useCallback } from 'react';
import { Search, MapPin, X, Check, Loader2, User } from 'lucide-react';
import { Button, Badge } from '../common';
import type { Provider } from '../../types';
import { searchProviders } from '../../services/providerService';

interface ProviderSearchProps {
  selectedProviders: string[];
  onSelect: (providerIds: string[]) => void;
  zipCode?: string;
  maxSelections?: number;
}

export function ProviderSearch({
  selectedProviders,
  onSelect,
  zipCode,
  maxSelections = 5,
}: ProviderSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Search providers
  const doSearch = useCallback(async () => {
    if (!searchTerm && !zipCode) {
      setProviders([]);
      return;
    }

    setIsLoading(true);
    const result = await searchProviders({
      searchTerm: searchTerm || undefined,
      zipCode: zipCode || undefined,
      covered: true, // Only show in-network providers by default
      pageSize: 20,
    });

    if (result.success && result.data) {
      setProviders(result.data.data);
    }
    setIsLoading(false);
  }, [searchTerm, zipCode]);

  useEffect(() => {
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [doSearch]);

  // Toggle provider selection
  const toggleProvider = (providerId: string) => {
    if (selectedProviders.includes(providerId)) {
      onSelect(selectedProviders.filter(id => id !== providerId));
    } else if (selectedProviders.length < maxSelections) {
      onSelect([...selectedProviders, providerId]);
    }
  };

  // Remove provider
  const removeProvider = (providerId: string) => {
    onSelect(selectedProviders.filter(id => id !== providerId));
  };

  // Get selected provider details
  const getProviderName = (providerId: string) => {
    const provider = providers.find(p => p.providerId === providerId);
    return provider?.providerName || providerId;
  };

  return (
    <div 
      className="space-y-4"
      onKeyDown={(e) => {
        // Prevent any keyboard events from bubbling to parent form
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClick={(e) => {
        // Prevent click events from bubbling to form
        e.stopPropagation();
      }}
    >
      {/* Selected Providers */}
      {selectedProviders.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedProviders.map((providerId) => (
            <div
              key={providerId}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-full"
            >
              <User className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-blue-700 dark:text-blue-300">
                {getProviderName(providerId)}
              </span>
              <button
                onClick={() => removeProvider(providerId)}
                className="p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800"
              >
                <X className="w-3 h-3 text-blue-600 dark:text-blue-400" />
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
              e.stopPropagation();
              setSearchTerm(e.target.value);
              setShowResults(true);
            }}
            onFocus={(e) => {
              e.stopPropagation();
              setShowResults(true);
            }}
            onKeyDown={(e) => {
              // Prevent form submission for Enter key
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              // Stop propagation for all keys to prevent any form interaction
              e.stopPropagation();
            }}
            onKeyPress={(e) => {
              // Prevent form submission from any key press
              e.stopPropagation();
            }}
            onKeyUp={(e) => {
              // Prevent form submission from any key release
              e.stopPropagation();
            }}
            placeholder="Search providers by name, NPI, city, or zip..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            formNoValidate
            autoComplete="off"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
          )}
        </div>

        {/* Results Dropdown */}
        {showResults && providers.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {providers.map((provider) => {
              const isSelected = selectedProviders.includes(provider.providerId);
              const canSelect = selectedProviders.length < maxSelections;

              return (
                <button
                  key={provider.providerId}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleProvider(provider.providerId);
                  }}
                  disabled={!isSelected && !canSelect}
                  className={`
                    w-full px-4 py-3 text-left flex items-start gap-3 border-b border-gray-100 dark:border-gray-700 last:border-0
                    ${isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : canSelect
                        ? 'hover:bg-gray-50 dark:hover:bg-gray-700'
                        : 'opacity-50 cursor-not-allowed'
                    }
                  `}
                >
                  <div className={`
                    mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0
                    ${isSelected
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-gray-300 dark:border-gray-600'
                    }
                  `}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {provider.providerName}
                    </p>
                    {provider.buildingName && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {provider.buildingName}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <MapPin className="w-3 h-3" />
                      {provider.city}, {provider.state} {provider.zipCode}
                    </div>
                    <div className="flex gap-1 mt-1">
                      <Badge variant="info">NPI: {provider.npi}</Badge>
                      {provider.covered && <Badge variant="success">In Network</Badge>}
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
        {selectedProviders.length} of {maxSelections} providers selected
        {zipCode && ` • Showing results near ${zipCode}`}
      </p>

      {/* Close results on click outside */}
      {showResults && (
        <div
          className="fixed inset-0 z-10"
          onClick={(e) => {
            e.stopPropagation();
            setShowResults(false);
          }}
        />
      )}
    </div>
  );
}

