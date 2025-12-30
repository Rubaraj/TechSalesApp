import { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Filter, 
  X, 
  Pill,
  Package,
  FileText,
  AlertTriangle,
  Grid,
  List,
  Info
} from 'lucide-react';
import { Button, Select, Badge, Pagination, Modal } from '../../components/common';
import { SearchInput } from '../../components/common/SearchInput';
import { EmptyState } from '../../components/common/EmptyState';
import type { Drug, DosageForm } from '../../types';
import { searchDrugs, getDrugById, type DrugSearchParams } from '../../services/drugService';

const dosageFormOptions = [
  { value: '', label: 'All Forms' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'solution', label: 'Solution' },
  { value: 'injection', label: 'Injection' },
  { value: 'cream', label: 'Cream' },
  { value: 'patch', label: 'Patch' },
  { value: 'inhaler', label: 'Inhaler' },
];

const tierOptions = [
  { value: '', label: 'All Tiers' },
  { value: '1', label: 'Tier 1 (Preferred Generic)' },
  { value: '2', label: 'Tier 2 (Generic)' },
  { value: '3', label: 'Tier 3 (Preferred Brand)' },
  { value: '4', label: 'Tier 4 (Non-Preferred)' },
  { value: '5', label: 'Tier 5 (Specialty)' },
];

export function DrugSearchPage() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<{
    dosageForm?: DosageForm;
    tier?: number;
    isGeneric?: boolean;
  }>({});
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 16,
    total: 0,
    totalPages: 1,
  });

  // Detail modal
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Load drugs
  const loadDrugs = useCallback(async () => {
    setIsLoading(true);
    const params: DrugSearchParams = {
      searchTerm: searchTerm || undefined,
      dosageForm: filters.dosageForm,
      tier: filters.tier,
      isGeneric: filters.isGeneric,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };

    const result = await searchDrugs(params);

    if (result.success && result.data) {
      setDrugs(result.data.data);
      setPagination({
        page: result.data.page,
        pageSize: result.data.pageSize,
        total: result.data.total,
        totalPages: result.data.totalPages,
      });
    }
    setIsLoading(false);
  }, [searchTerm, filters, pagination.page, pagination.pageSize]);

  useEffect(() => {
    loadDrugs();
  }, [loadDrugs]);

  // View drug details
  const viewDetails = (drug: Drug) => {
    setSelectedDrug(drug);
    setIsDetailOpen(true);
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
  };

  const hasActiveFilters = Object.keys(filters).some(k => filters[k as keyof typeof filters] !== undefined) || searchTerm;

  // Get tier color
  const getTierColor = (tier?: number) => {
    switch (tier) {
      case 1: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 2: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 3: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 4: return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 5: return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Drug Formulary</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Search covered medications by name, class, or tier
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search by drug name (brand or generic)..."
          className="flex-1"
        />
        <div className="flex items-center gap-2">
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
              className={`p-2 ${viewMode === 'grid' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
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
              label="Dosage Form"
              options={dosageFormOptions}
              value={filters.dosageForm || ''}
              onChange={(e) => setFilters({ ...filters, dosageForm: e.target.value as DosageForm || undefined })}
            />
          </div>
          <div className="w-56">
            <Select
              label="Formulary Tier"
              options={tierOptions}
              value={filters.tier?.toString() || ''}
              onChange={(e) => setFilters({ ...filters, tier: e.target.value ? parseInt(e.target.value) : undefined })}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.isGeneric || false}
                onChange={(e) => setFilters({ ...filters, isGeneric: e.target.checked || undefined })}
                className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Generic Only</span>
            </label>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
        <span>{pagination.total} drugs found</span>
      </div>

      {/* Drug Grid/List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading drugs...</p>
          </div>
        </div>
      ) : drugs.length === 0 ? (
        <EmptyState
          icon={Pill}
          title="No drugs found"
          description={hasActiveFilters ? "Try adjusting your search or filters" : "No drugs available"}
          action={
            hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
            )
          }
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {drugs.map((drug) => (
            <div
              key={drug.drugId}
              onClick={() => viewDetails(drug)}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-orange-300 dark:hover:border-orange-700 transition-all cursor-pointer"
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <Pill className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {drug.brandName || drug.genericName}
                  </h3>
                  {drug.brandName && drug.genericName && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {drug.genericName}
                    </p>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="space-y-1 mb-3 text-sm">
                {drug.strength && (
                  <p className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Strength:</span> {drug.strength}
                  </p>
                )}
                {drug.dosageForm && (
                  <p className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Form:</span> {drug.dosageForm}
                  </p>
                )}
                {drug.drugClass && (
                  <p className="text-gray-600 dark:text-gray-400 truncate">
                    <span className="font-medium">Class:</span> {drug.drugClass}
                  </p>
                )}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1">
                {drug.tier && (
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${getTierColor(drug.tier)}`}>
                    Tier {drug.tier}
                  </span>
                )}
                {drug.isGeneric && <Badge variant="success">Generic</Badge>}
                {drug.requiresPriorAuth && <Badge variant="warning">PA</Badge>}
                {drug.hasQuantityLimit && <Badge variant="info">QL</Badge>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {drugs.map((drug) => (
            <div
              key={drug.drugId}
              onClick={() => viewDetails(drug)}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-orange-300 dark:hover:border-orange-700 transition-all cursor-pointer flex items-center gap-4"
            >
              <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30 shrink-0">
                <Pill className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {drug.brandName || drug.genericName}
                  </h3>
                  {drug.brandName && drug.genericName && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ({drug.genericName})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  {drug.strength && <span>{drug.strength}</span>}
                  {drug.dosageForm && <span>• {drug.dosageForm}</span>}
                  {drug.drugClass && <span className="truncate">• {drug.drugClass}</span>}
                </div>
              </div>

              <div className="flex gap-1 shrink-0">
                {drug.tier && (
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getTierColor(drug.tier)}`}>
                    Tier {drug.tier}
                  </span>
                )}
                {drug.isGeneric && <Badge variant="success">Generic</Badge>}
                {drug.requiresPriorAuth && <Badge variant="warning">PA</Badge>}
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
        title="Drug Details"
        size="lg"
      >
        {selectedDrug && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                <Pill className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {selectedDrug.brandName || selectedDrug.genericName}
                </h2>
                {selectedDrug.brandName && selectedDrug.genericName && (
                  <p className="text-gray-500 dark:text-gray-400">
                    Generic: {selectedDrug.genericName}
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  {selectedDrug.tier && (
                    <span className={`px-2 py-1 text-sm font-medium rounded ${getTierColor(selectedDrug.tier)}`}>
                      Tier {selectedDrug.tier}
                    </span>
                  )}
                  {selectedDrug.isGeneric && <Badge variant="success">Generic</Badge>}
                  {selectedDrug.requiresPriorAuth && <Badge variant="warning">Prior Auth Required</Badge>}
                  {selectedDrug.hasQuantityLimit && <Badge variant="info">Quantity Limit</Badge>}
                  {selectedDrug.hasStepTherapy && <Badge variant="default">Step Therapy</Badge>}
                </div>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Drug Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Drug Information
                </h3>
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">NDC</dt>
                    <dd className="font-mono text-gray-900 dark:text-white">{selectedDrug.ndc}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">GPI Code</dt>
                    <dd className="font-mono text-gray-900 dark:text-white">{selectedDrug.gpiCode}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Strength</dt>
                    <dd className="text-gray-900 dark:text-white">{selectedDrug.strength || 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Dosage Form</dt>
                    <dd className="text-gray-900 dark:text-white">{selectedDrug.dosageForm || 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Route</dt>
                    <dd className="text-gray-900 dark:text-white">{selectedDrug.route || 'N/A'}</dd>
                  </div>
                </dl>
              </div>

              {/* Classification */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Classification
                </h3>
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Drug Class</dt>
                    <dd className="text-gray-900 dark:text-white text-right max-w-[60%]">
                      {selectedDrug.drugClass || 'N/A'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Therapeutic Category</dt>
                    <dd className="text-gray-900 dark:text-white text-right max-w-[60%]">
                      {selectedDrug.therapeuticCategory || 'N/A'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">Manufacturer</dt>
                    <dd className="text-gray-900 dark:text-white">{selectedDrug.manufacturer || 'N/A'}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Restrictions */}
            {(selectedDrug.requiresPriorAuth || selectedDrug.hasQuantityLimit || selectedDrug.hasStepTherapy) && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Coverage Restrictions
                </h3>
                <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-400">
                  {selectedDrug.requiresPriorAuth && (
                    <li>• Prior Authorization required before dispensing</li>
                  )}
                  {selectedDrug.hasQuantityLimit && (
                    <li>• Quantity limits apply ({selectedDrug.quantityLimit || 'See plan details'})</li>
                  )}
                  {selectedDrug.hasStepTherapy && (
                    <li>• Step therapy required - try alternative medications first</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

