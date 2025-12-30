import { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Filter, 
  X, 
  MapPin, 
  Phone, 
  Clock,
  Building2,
  Truck,
  CheckCircle,
  Grid,
  List,
  Navigation
} from 'lucide-react';
import { Button, Select, Badge, Pagination, Modal, Input } from '../../components/common';
import { SearchInput } from '../../components/common/SearchInput';
import { EmptyState } from '../../components/common/EmptyState';
import type { Pharmacy } from '../../types';
import { searchPharmacies, getPharmacyById, type PharmacySearchParams } from '../../services/pharmacyService';

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
];

const pharmacyTypeOptions = [
  { value: '', label: 'All Types' },
  { value: 'retail', label: 'Retail' },
  { value: 'mailOrder', label: 'Mail Order' },
  { value: 'specialty', label: 'Specialty' },
];

export function PharmacySearchPage() {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [filters, setFilters] = useState<{
    state?: string;
    is24Hour?: boolean;
    isRetail?: boolean;
    isMailOrder?: boolean;
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
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Load pharmacies
  const loadPharmacies = useCallback(async () => {
    setIsLoading(true);
    const params: PharmacySearchParams = {
      searchTerm: searchTerm || undefined,
      zipCode: zipCode || undefined,
      state: filters.state || undefined,
      is24Hour: filters.is24Hour,
      isRetail: filters.isRetail,
      isMailOrder: filters.isMailOrder,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };

    const result = await searchPharmacies(params);

    if (result.success && result.data) {
      setPharmacies(result.data.data);
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
    loadPharmacies();
  }, [loadPharmacies]);

  // View pharmacy details
  const viewDetails = async (pharmacy: Pharmacy) => {
    setSelectedPharmacy(pharmacy);
    setIsDetailOpen(true);
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
    setZipCode('');
  };

  const hasActiveFilters = Object.keys(filters).some(k => filters[k as keyof typeof filters]) || searchTerm || zipCode;

  // Format phone
  const formatPhone = (phone?: string) => {
    if (!phone) return 'N/A';
    const cleaned = phone.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      return `(${match[1]}) ${match[2]}-${match[3]}`;
    }
    return phone;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pharmacy Search</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Find in-network pharmacies by name, location, or services
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search by pharmacy name..."
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
                checked={filters.is24Hour || false}
                onChange={(e) => setFilters({ ...filters, is24Hour: e.target.checked || undefined })}
                className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">24 Hour Only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.isRetail || false}
                onChange={(e) => setFilters({ ...filters, isRetail: e.target.checked || undefined })}
                className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Retail</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.isMailOrder || false}
                onChange={(e) => setFilters({ ...filters, isMailOrder: e.target.checked || undefined })}
                className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Mail Order</span>
            </label>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
        <span>{pagination.total} pharmacies found</span>
        {zipCode && <span>• Near {zipCode}</span>}
      </div>

      {/* Pharmacy Grid/List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading pharmacies...</p>
          </div>
        </div>
      ) : pharmacies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No pharmacies found"
          description={hasActiveFilters ? "Try adjusting your search or filters" : "No pharmacies available"}
          action={
            hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
            )
          }
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pharmacies.map((pharmacy) => (
            <div
              key={pharmacy.pharmacyId}
              onClick={() => viewDetails(pharmacy)}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-orange-300 dark:hover:border-orange-700 transition-all cursor-pointer"
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                  <Building2 className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {pharmacy.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    NPI: {pharmacy.npi}
                  </p>
                </div>
              </div>

              {/* Address */}
              <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{pharmacy.address}, {pharmacy.city}, {pharmacy.state} {pharmacy.zipCode}</span>
              </div>

              {/* Phone */}
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                <Phone className="w-4 h-4" />
                <span>{formatPhone(pharmacy.phone)}</span>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1">
                {pharmacy.isRetail && <Badge variant="default">Retail</Badge>}
                {pharmacy.isMailOrder && <Badge variant="info">Mail Order</Badge>}
                {pharmacy.is24Hour && <Badge variant="success">24 Hour</Badge>}
                {pharmacy.hasDelivery && <Badge variant="primary">Delivery</Badge>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {pharmacies.map((pharmacy) => (
            <div
              key={pharmacy.pharmacyId}
              onClick={() => viewDetails(pharmacy)}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-orange-300 dark:hover:border-orange-700 transition-all cursor-pointer flex items-center gap-4"
            >
              <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30 shrink-0">
                <Building2 className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {pharmacy.name}
                  </h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    NPI: {pharmacy.npi}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {pharmacy.city}, {pharmacy.state} {pharmacy.zipCode}
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {formatPhone(pharmacy.phone)}
                  </span>
                </div>
              </div>

              <div className="flex gap-1 shrink-0">
                {pharmacy.isRetail && <Badge variant="default">Retail</Badge>}
                {pharmacy.isMailOrder && <Badge variant="info">Mail Order</Badge>}
                {pharmacy.is24Hour && <Badge variant="success">24hr</Badge>}
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
        title="Pharmacy Details"
        size="lg"
      >
        {selectedPharmacy && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-900/30">
                <Building2 className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {selectedPharmacy.name}
                </h2>
                <p className="text-gray-500 dark:text-gray-400">NPI: {selectedPharmacy.npi}</p>
                <div className="flex gap-2 mt-2">
                  {selectedPharmacy.isRetail && <Badge variant="default">Retail</Badge>}
                  {selectedPharmacy.isMailOrder && <Badge variant="info">Mail Order</Badge>}
                  {selectedPharmacy.isSpecialty && <Badge variant="warning">Specialty</Badge>}
                  {selectedPharmacy.is24Hour && <Badge variant="success">24 Hour</Badge>}
                  {selectedPharmacy.hasDelivery && <Badge variant="primary">Delivery</Badge>}
                </div>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Contact Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Contact Information
                </h3>
                <dl className="space-y-2">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-gray-900 dark:text-white">{selectedPharmacy.address}</p>
                      <p className="text-gray-600 dark:text-gray-400">
                        {selectedPharmacy.city}, {selectedPharmacy.state} {selectedPharmacy.zipCode}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <a href={`tel:${selectedPharmacy.phone}`} className="text-orange-600 hover:underline">
                      {formatPhone(selectedPharmacy.phone)}
                    </a>
                  </div>
                </dl>
              </div>

              {/* Services */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Services & Features
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {selectedPharmacy.is24Hour ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <X className="w-4 h-4 text-gray-300" />
                    )}
                    <span className="text-gray-700 dark:text-gray-300">24 Hour Service</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedPharmacy.hasDelivery ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <X className="w-4 h-4 text-gray-300" />
                    )}
                    <span className="text-gray-700 dark:text-gray-300">Delivery Available</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedPharmacy.hasDriveThru ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <X className="w-4 h-4 text-gray-300" />
                    )}
                    <span className="text-gray-700 dark:text-gray-300">Drive-Thru</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedPharmacy.isPreferred ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <X className="w-4 h-4 text-gray-300" />
                    )}
                    <span className="text-gray-700 dark:text-gray-300">Preferred Network</span>
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
              <Button variant="outline" className="flex-1">
                <Phone className="w-4 h-4" />
                Call Pharmacy
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

