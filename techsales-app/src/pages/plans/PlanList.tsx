import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Filter, 
  X, 
  Star, 
  Shield, 
  Heart,
  Building2,
  ChevronRight,
  Grid,
  List,
  MapPin
} from 'lucide-react';
import { Button, Select, Badge, Pagination } from '../../components/common';
import { SearchInput } from '../../components/common/SearchInput';
import { EmptyState } from '../../components/common/EmptyState';
import type { PlanCategory } from '../../types';
import { searchPlans, type PlanFilters, type PlanWithPremium } from '../../services/planService';
import { autoPopulateFromZip } from '../../services/zipService';

const productOptions = [
  { value: '', label: 'All Products' },
  { value: 'MAPD', label: 'MAPD' },
  { value: 'PDP', label: 'PDP' },
  { value: 'MA', label: 'MA Only' },
];

const planTypeOptions = [
  { value: '', label: 'All Plan Types' },
  { value: 'HMO', label: 'HMO' },
  { value: 'PPO', label: 'PPO' },
  { value: 'DSNP', label: 'D-SNP' },
  { value: 'CSNP', label: 'C-SNP' },
  { value: 'POS', label: 'POS' },
];

const categoryOptions = [
  { value: '', label: 'All Categories' },
  { value: 'standard', label: 'Standard' },
  { value: 'premium', label: 'Premium' },
  { value: 'value', label: 'Value' },
  { value: 'dual', label: 'Dual Eligible' },
];

const yearOptions = [
  { value: '2025', label: '2025' },
  { value: '2024', label: '2024' },
];

export function PlanList() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanWithPremium[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<PlanFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
  });
  
  // Zip code filter state
  const [zipCode, setZipCode] = useState('');
  const [zipError, setZipError] = useState('');
  const [zipLocation, setZipLocation] = useState<{ region: string; state: string; city: string } | null>(null);

  // Check if a string is a valid 5-digit zip code pattern
  const isZipCode = (value: string) => /^\d{5}$/.test(value.trim());

  // Handle search input change - supports both text search and zip code
  const handleSearchChange = async (value: string) => {
    setSearchTerm(value);
    
    // Check if the search term is a zip code
    if (isZipCode(value)) {
      const result = await autoPopulateFromZip(value.trim());
      if (result.success && result.data) {
        setZipCode(value.trim());
        setZipLocation({
          region: result.data.region,
          state: result.data.stateAbbr,
          city: result.data.city,
        });
        setFilters(prev => ({ ...prev, region: result.data!.region }));
        setZipError('');
      } else {
        setZipCode('');
        setZipLocation(null);
        setZipError('');
        setFilters(prev => ({ ...prev, region: undefined }));
      }
    } else {
      // Not a zip code - clear zip-related state
      if (zipCode) {
        setZipCode('');
        setZipLocation(null);
        setFilters(prev => ({ ...prev, region: undefined }));
      }
    }
  };

  // Handle zip code change from filter panel
  const handleZipChange = async (value: string) => {
    // Only allow digits
    const cleanValue = value.replace(/\D/g, '').slice(0, 5);
    setZipCode(cleanValue);
    setZipError('');
    
    if (cleanValue.length === 5) {
      const result = await autoPopulateFromZip(cleanValue);
      if (result.success && result.data) {
        setZipLocation({
          region: result.data.region,
          state: result.data.stateAbbr,
          city: result.data.city,
        });
        setFilters(prev => ({ ...prev, region: result.data!.region }));
        // Also update the search term to show the zip
        setSearchTerm(cleanValue);
      } else {
        setZipError('Zip code not found');
        setZipLocation(null);
        setFilters(prev => ({ ...prev, region: undefined }));
      }
    } else {
      setZipLocation(null);
      if (cleanValue === '') {
        setFilters(prev => ({ ...prev, region: undefined }));
      }
    }
  };

  // Load plans
  const loadPlans = useCallback(async () => {
    setIsLoading(true);
    
    // Don't pass searchTerm if it's a zip code (region filter handles it instead)
    const effectiveSearchTerm = isZipCode(searchTerm) ? undefined : (searchTerm || undefined);
    
    const result = await searchPlans({
      searchTerm: effectiveSearchTerm,
      filters,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    if (result.success && result.data) {
      setPlans(result.data.data);
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
    loadPlans();
  }, [loadPlans]);

  // Clear filters
  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
    setZipCode('');
    setZipError('');
    setZipLocation(null);
  };

  const hasActiveFilters = Object.keys(filters).some(k => 
    filters[k as keyof PlanFilters]
  ) || searchTerm || zipCode;

  // Get plan type color
  const getPlanTypeColor = (planType: string) => {
    switch (planType) {
      case 'HMO': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'PPO': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'DSNP': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'CSNP': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'POS': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  // Get product icon
  const getProductIcon = (product: string) => {
    switch (product) {
      case 'MAPD': return <Shield className="w-4 h-4" />;
      case 'PDP': return <Heart className="w-4 h-4" />;
      case 'MA': return <Building2 className="w-4 h-4" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  // Render star rating
  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${
              star <= rating
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-gray-200 text-gray-200 dark:fill-gray-600 dark:text-gray-600'
            }`}
          />
        ))}
        <span className="ml-1 text-sm text-gray-600 dark:text-gray-400">
          {rating.toFixed(1)}
        </span>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Plan Catalog</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Browse and compare Medicare Advantage and Part D plans
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            options={yearOptions}
            value={String(filters.contractYear)}
            onChange={(e) => setFilters({ ...filters, contractYear: parseInt(e.target.value) })}
          />
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 max-w-lg">
          <SearchInput
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Search by plan name, contract, PBP, or zip code..."
            className="w-full"
          />
          {zipLocation && isZipCode(searchTerm) && (
            <p className="mt-1 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              Showing plans for {zipLocation.city}, {zipLocation.state} ({zipLocation.region})
            </p>
          )}
        </div>
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
          <div className="w-44">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Zip Code
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Enter zip code"
                value={zipCode}
                onChange={(e) => handleZipChange(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-800 dark:text-white ${
                  zipError 
                    ? 'border-red-500 dark:border-red-500' 
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
            </div>
            {zipError && (
              <p className="mt-1 text-xs text-red-500">{zipError}</p>
            )}
            {zipLocation && (
              <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                {zipLocation.city}, {zipLocation.state} • {zipLocation.region}
              </p>
            )}
          </div>
          <div className="w-40">
            <Select
              label="Product"
              options={productOptions}
              value={filters.product || ''}
              onChange={(e) => setFilters({ ...filters, product: e.target.value || undefined })}
            />
          </div>
          <div className="w-40">
            <Select
              label="Plan Type"
              options={planTypeOptions}
              value={filters.planType || ''}
              onChange={(e) => setFilters({ ...filters, planType: e.target.value || undefined })}
            />
          </div>
          <div className="w-40">
            <Select
              label="Category"
              options={categoryOptions}
              value={filters.category || ''}
              onChange={(e) => setFilters({ ...filters, category: e.target.value as PlanCategory || undefined })}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
        <span>{pagination.total} plans found</span>
        {filters.region && (
          <>
            <span>•</span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              Region: {filters.region}
            </span>
          </>
        )}
      </div>

      {/* Plans Grid/List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading plans...</p>
          </div>
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No plans found"
          description={hasActiveFilters ? "Try adjusting your filters" : "No plans available for this year"}
          action={
            hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
            )
          }
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.planId}
              onClick={() => navigate(`/plans/${plan.planId}`)}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-orange-300 dark:hover:border-orange-700 transition-all cursor-pointer group"
            >
              {/* Plan Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${getPlanTypeColor(plan.planType)}`}>
                    {getProductIcon(plan.product)}
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${getPlanTypeColor(plan.planType)}`}>
                    {plan.planType}
                  </span>
                </div>
                <Badge variant={plan.product === 'MAPD' ? 'primary' : plan.product === 'PDP' ? 'info' : 'default'}>
                  {plan.product}
                </Badge>
              </div>

              {/* Plan Name */}
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2 group-hover:text-orange-600 dark:group-hover:text-orange-400">
                {plan.planName}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {plan.contractNumber}-{plan.pbp}
              </p>

              {/* Star Rating */}
              <div className="mb-3">
                {renderStars(plan.starRating || 0)}
              </div>

              {/* Premium */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Monthly Premium</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    ${plan.monthlyPremium?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-orange-600 group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div
              key={plan.planId}
              onClick={() => navigate(`/plans/${plan.planId}`)}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-orange-300 dark:hover:border-orange-700 transition-all cursor-pointer group flex items-center gap-4"
            >
              {/* Plan Icon */}
              <div className={`p-3 rounded-lg shrink-0 ${getPlanTypeColor(plan.planType)}`}>
                {getProductIcon(plan.product)}
              </div>

              {/* Plan Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-orange-600 dark:group-hover:text-orange-400">
                    {plan.planName}
                  </h3>
                  <Badge variant={plan.product === 'MAPD' ? 'primary' : plan.product === 'PDP' ? 'info' : 'default'}>
                    {plan.product}
                  </Badge>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${getPlanTypeColor(plan.planType)}`}>
                    {plan.planType}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    {plan.contractNumber}-{plan.pbp}
                  </span>
                  {renderStars(plan.starRating || 0)}
                </div>
              </div>

              {/* Premium */}
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">Monthly</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  ${plan.monthlyPremium?.toFixed(2) || '0.00'}
                </p>
              </div>

              <ChevronRight className="w-5 h-5 text-gray-400 shrink-0 group-hover:text-orange-600 group-hover:translate-x-1 transition-all" />
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
    </div>
  );
}

