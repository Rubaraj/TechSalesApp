import { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Filter, 
  X, 
  MapPin, 
  User,
  CheckCircle,
  Grid,
  List,
  Navigation
} from 'lucide-react';
import { Button, Select, Badge, Pagination, Modal, Input } from '../../components/common';
import { SearchInput } from '../../components/common/SearchInput';
import { EmptyState } from '../../components/common/EmptyState';
import type { Provider } from '../../types';
import { searchProviders, getProviderById, type ProviderSearchParams } from '../../services/providerService';

const stateOptions = [
  { value: '', label: 'All States' },
  { value: 'TX', label: 'Texas' },
  { value: 'FL', label: 'Florida' },
  { value: 'CA', label: 'California' },
  { value: 'NY', label: 'New York' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'OH', label: 'Ohio' },
  { value: 'IL', label: 'Illinois' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'WA', label: 'Washington' },
  { value: 'OR', label: 'Oregon' },
];

export function ProviderSearchPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [filters, setFilters] = useState<{
    state?: string;
    covered?: boolean;
  }>({});
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
  });

  // Detail modal
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Load providers
  const loadProviders = useCallback(async () => {
    setIsLoading(true);
    const params: ProviderSearchParams = {
      searchTerm: searchTerm || undefined,
      zipCode: zipCode || undefined,
      state: filters.state || undefined,
      covered: filters.covered !== undefined ? filters.covered : undefined, // Default to show all
      page: pagination.page,
      pageSize: pagination.pageSize,
    };

    const result = await searchProviders(params);

    if (result.success && result.data) {
      setProviders(result.data.data);
      setPagination({
        page: result.data.page,
        pageSize: result.data.pageSize,
        total: result.data.total,
        totalPages: result.data.totalPages,
      });
    }
    setIsLoading(false);
  }, [searchTerm, zipCode, filters, pagination.page, pagination.pageSize]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // View provider details
  const viewDetails = async (provider: Provider) => {
    setSelectedProvider(provider);
    setIsDetailOpen(true);
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
    setZipCode('');
  };

  const hasActiveFilters = Object.keys(filters).some(k => filters[k as keyof typeof filters] !== undefined) || searchTerm || zipCode;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Provider Search</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Find doctors and practitioners by name, NPI, or location
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search by provider name or NPI..."
          className="flex-1"
        />
        <div className="flex items-center gap-2">
          <Input
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            placeholder="Zip Code"
            className="w-32"
          />
          <Button
            variant={showFilters ? 'primary' : 'outline'}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4" />
            Filters
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters}>
              <X className="w-4 h-4" />
              Clear
            </Button>
          )}
          <div className="hidden sm:flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="flex flex-wrap gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="w-48">
            <Select
              label="State"
              options={stateOptions}
              value={filters.state || ''}
              onChange={(e) => setFilters({ ...filters, state: e.target.value || undefined })}
            />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.covered === true}
                onChange={(e) => setFilters({ ...filters, covered: e.target.checked ? true : undefined })}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">In Network Only</span>
            </label>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
        <span>{pagination.total} providers found</span>
        {zipCode && <span>• Near {zipCode}</span>}
      </div>

      {/* Provider Grid/List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading providers...</p>
          </div>
        </div>
      ) : providers.length === 0 ? (
        <EmptyState
          icon={User}
          title="No providers found"
          description={hasActiveFilters ? "Try adjusting your search or filters" : "No providers available"}
          action={
            hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
            )
          }
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {providers.map((provider) => (
            <div
              key={provider.providerId}
              onClick={() => viewDetails(provider)}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer"
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {provider.providerName}
                  </h3>
                  {provider.buildingName && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {provider.buildingName}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    NPI: {provider.npi}
                  </p>
                </div>
              </div>

              {/* Address */}
              <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{provider.address}, {provider.city}, {provider.state} {provider.zipCode}</span>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1">
                {provider.covered ? (
                  <Badge variant="success">In Network</Badge>
                ) : (
                  <Badge variant="warning">Out Of Network</Badge>
                )}
                {provider.capId && <Badge variant="info">CAP: {provider.capId}</Badge>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => (
            <div
              key={provider.providerId}
              onClick={() => viewDetails(provider)}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer flex items-center gap-4"
            >
              <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30 shrink-0">
                <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {provider.providerName}
                  </h3>
                  {provider.buildingName && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      • {provider.buildingName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {provider.city}, {provider.state} {provider.zipCode}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    NPI: {provider.npi}
                  </span>
                </div>
              </div>

              <div className="flex gap-1 shrink-0">
                {provider.covered ? (
                  <Badge variant="success">In Network</Badge>
                ) : (
                  <Badge variant="warning">Out Of Network</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.total > 0 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.total}
          pageSize={pagination.pageSize}
          onPageChange={(page) => setPagination({ ...pagination, page })}
          onPageSizeChange={(size) => setPagination({ ...pagination, pageSize: size, page: 1 })}
        />
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Provider Details"
        size="lg"
      >
        {selectedProvider && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                <User className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {selectedProvider.providerName}
                </h2>
                {selectedProvider.buildingName && (
                  <p className="text-gray-500 dark:text-gray-400">{selectedProvider.buildingName}</p>
                )}
                <p className="text-gray-500 dark:text-gray-400">NPI: {selectedProvider.npi}</p>
                <div className="flex gap-2 mt-2">
                  {selectedProvider.covered ? (
                    <Badge variant="success">In Network</Badge>
                  ) : (
                    <Badge variant="warning">Out Of Network</Badge>
                  )}
                  {selectedProvider.capId && <Badge variant="info">CAP ID: {selectedProvider.capId}</Badge>}
                  {selectedProvider.contractPBP && <Badge variant="default">Contract: {selectedProvider.contractPBP}</Badge>}
                </div>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contact Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Location Information
                </h3>
                <dl className="space-y-2">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-gray-900 dark:text-white">{selectedProvider.address}</p>
                      <p className="text-gray-600 dark:text-gray-400">
                        {selectedProvider.city}, {selectedProvider.state} {selectedProvider.zipCode}
                      </p>
                      <p className="text-gray-600 dark:text-gray-400">
                        {selectedProvider.county} County
                      </p>
                    </div>
                  </div>
                </dl>
              </div>

              {/* Provider Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Provider Information
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-700 dark:text-gray-300">Provider ID:</span>
                    <span className="text-gray-900 dark:text-white font-mono text-sm">{selectedProvider.providerIdentificationNumber}</span>
                  </div>
                  {selectedProvider.capId && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700 dark:text-gray-300">CAP ID:</span>
                      <span className="text-gray-900 dark:text-white">{selectedProvider.capId}</span>
                    </div>
                  )}
                  {selectedProvider.contractPBP && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700 dark:text-gray-300">Contract PBP:</span>
                      <span className="text-gray-900 dark:text-white">{selectedProvider.contractPBP}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {selectedProvider.covered ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <X className="w-4 h-4 text-gray-300" />
                    )}
                    <span className="text-gray-700 dark:text-gray-300">In Network</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button variant="outline" className="flex-1">
                <Navigation className="w-4 h-4" />
                Get Directions
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

