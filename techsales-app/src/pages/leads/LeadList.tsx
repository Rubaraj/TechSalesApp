import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Filter, 
  X, 
  Eye, 
  Edit2, 
  Trash2, 
  Phone, 
  Mail,
  MapPin,
  Calendar,
  Users
} from 'lucide-react';
import { Button, Select, Badge, Pagination, Modal, ConfirmModal } from '../../components/common';
import { SearchInput } from '../../components/common/SearchInput';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { useAuth } from '../../context/AuthContext';
import type { Lead, LeadStatus } from '../../types';
import { searchLeads, deleteLead, getAllLeads, type LeadFilters } from '../../services/leadService';
import { calculateAge } from '../../utils/dateUtils';

const statusOptions = [
  { value: '', label: 'All Status' },
  { value: 'New Lead', label: 'New Lead' },
  { value: 'Contacted Lead', label: 'Contacted Lead' },
  { value: 'Appointment Schedule', label: 'Appointment Schedule' },
  { value: 'Enrollment in progress', label: 'Enrollment in progress' },
  { value: 'Enrolled', label: 'Enrolled' },
  { value: 'Dropped / Lost lead', label: 'Dropped / Lost lead' },
];

export function LeadList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<LeadFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });
  const [sortField, setSortField] = useState<keyof Lead>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Status counts (total counts independent of filters)
  const [statusCounts, setStatusCounts] = useState<Record<LeadStatus, number>>({
    'New Lead': 0,
    'Contacted Lead': 0,
    'Appointment Schedule': 0,
    'Enrollment in progress': 0,
    'Enrolled': 0,
    'Dropped / Lost lead': 0,
  });

  // Delete modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load leads
  const loadLeads = useCallback(async () => {
    setIsLoading(true);
    const result = await searchLeads({
      searchTerm: searchTerm || undefined,
      filters,
      sortField,
      sortDirection,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    if (result.success && result.data) {
      setLeads(result.data.data);
      setPagination({
        page: result.data.page,
        pageSize: result.data.pageSize,
        total: result.data.total,
        totalPages: result.data.totalPages,
      });
    }
    setIsLoading(false);
  }, [searchTerm, filters, sortField, sortDirection, pagination.page, pagination.pageSize]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // Load status counts (independent of current filters)
  const loadStatusCounts = useCallback(async () => {
    const result = await getAllLeads();
    if (result.success && result.data) {
      const counts: Record<LeadStatus, number> = {
        'New Lead': 0,
        'Contacted Lead': 0,
        'Appointment Schedule': 0,
        'Enrollment in progress': 0,
        'Enrolled': 0,
        'Dropped / Lost lead': 0,
      };
      result.data.forEach((lead) => {
        if (lead.leadStatus && counts[lead.leadStatus] !== undefined) {
          counts[lead.leadStatus]++;
        }
      });
      setStatusCounts(counts);
    }
  }, []);

  useEffect(() => {
    loadStatusCounts();
  }, [loadStatusCounts]);

  // Handle delete
  const handleDeleteClick = (lead: Lead) => {
    setSelectedLead(lead);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedLead) return;
    setIsDeleting(true);
    const result = await deleteLead(selectedLead.leadId);
    setIsDeleting(false);

    if (result.success) {
      setIsDeleteModalOpen(false);
      setSelectedLead(null);
      loadLeads();
      loadStatusCounts();
    }
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
  };

  const hasActiveFilters = Object.keys(filters).some(k => filters[k as keyof LeadFilters]) || searchTerm;

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Format phone
  const formatPhone = (phone: string) => {
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Lead Management</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage and track your insurance leads
          </p>
        </div>
        <Button onClick={() => navigate('/leads/new')}>
          <Plus className="w-4 h-4" />
          New Lead
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search by name, email, phone..."
          className="flex-1 max-w-md"
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
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="flex flex-wrap gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="w-48">
            <Select
              label="Status"
              options={statusOptions}
              value={filters.status || ''}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as LeadStatus || undefined })}
            />
          </div>
          <div className="w-48">
            <Select
              label="State"
              options={[
                { value: '', label: 'All States' },
                { value: 'TX', label: 'Texas' },
                { value: 'FL', label: 'Florida' },
                { value: 'CA', label: 'California' },
                { value: 'NY', label: 'New York' },
                { value: 'PA', label: 'Pennsylvania' },
              ]}
              value={filters.state || ''}
              onChange={(e) => setFilters({ ...filters, state: e.target.value || undefined })}
            />
          </div>
          <div className="w-48">
            <Select
              label="Medicare Type"
              options={[
                { value: '', label: 'All Types' },
                { value: 'true', label: 'Dual Eligible' },
                { value: 'false', label: 'Non-Dual' },
              ]}
              value={filters.isDualEligible === undefined ? '' : String(filters.isDualEligible)}
              onChange={(e) => setFilters({
                ...filters,
                isDualEligible: e.target.value === '' ? undefined : e.target.value === 'true',
              })}
            />
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {(['New Lead', 'Contacted Lead', 'Appointment Schedule', 'Enrollment in progress', 'Enrolled', 'Dropped / Lost lead'] as LeadStatus[]).map((status) => {
          return (
            <button
              key={status}
              onClick={() => setFilters({ ...filters, status: filters.status === status ? undefined : status })}
              className={`p-3 rounded-lg border transition-all ${
                filters.status === status
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <StatusBadge status={status} />
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{statusCounts[status]}</p>
            </button>
          );
        })}
      </div>

      {/* Lead Cards Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">Loading leads...</p>
          </div>
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No leads found"
          description={hasActiveFilters ? "Try adjusting your filters" : "Start by adding your first lead"}
          action={
            hasActiveFilters ? (
              <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
            ) : (
              <Button onClick={() => navigate('/leads/new')}>
                <Plus className="w-4 h-4" />
                Add Lead
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {leads.map((lead) => (
            <div
              key={lead.leadId}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg transition-shadow"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {lead.firstName} {lead.lastName}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Age: {calculateAge(lead.dob)} • MBI: {lead.medicareNumber || 'N/A'}
                  </p>
                  {lead.source && (
                    <Badge variant="default" className="mt-1">
                      {lead.source}
                    </Badge>
                  )}
                </div>
                <StatusBadge status={lead.leadStatus} />
              </div>

              {/* Contact Info */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Phone className="w-4 h-4 text-gray-400" />
                  {formatPhone(lead.phone)}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Mail className="w-4 h-4 text-gray-400" />
                  {lead.email}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  {lead.city}, {lead.state} {lead.zipCode}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  Created: {formatDate(lead.createdAt)}
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-4">
                {lead.medicaidId && (
                  <Badge variant="warning">Dual Eligible</Badge>
                )}
                {lead.taggedPharmacies && lead.taggedPharmacies.length > 0 && (
                  <Badge variant="primary">{lead.taggedPharmacies.length} Pharmacies</Badge>
                )}
                {lead.taggedDrugs && lead.taggedDrugs.length > 0 && (
                  <Badge variant="success">{lead.taggedDrugs.length} Drugs</Badge>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/leads/${lead.leadId}`)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="View Details"
                  >
                    <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button
                    onClick={() => navigate(`/leads/${lead.leadId}/edit`)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4 text-blue-600" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(lead)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate(`/leads/${lead.leadId}`)}>
                  View Details
                </Button>
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

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedLead(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Lead"
        message={`Are you sure you want to delete lead "${selectedLead?.firstName} ${selectedLead?.lastName}"? This action cannot be undone.`}
        confirmText="Delete"
        isLoading={isDeleting}
      />
    </div>
  );
}

