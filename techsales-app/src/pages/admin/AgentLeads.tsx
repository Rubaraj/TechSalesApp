import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Users, 
  Search,
  Phone,
  Mail,
  MapPin
} from 'lucide-react';
import { Button, Input, Select, Badge, Pagination, ActiveFilterChips } from '../../components/common';
import { formatDate } from '../../utils/dateUtils';
import { inPeriod } from '../../utils/drilldown';
import { searchLeads } from '../../services/leadService';
import { getUserById } from '../../services/userService';
import type { Lead, LeadStatus } from '../../types';
import { PhoneButton } from '../../components/call/PhoneButton';
import { formatPhoneUS } from '../../utils/phoneUtils';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'New Lead', label: 'New Lead' },
  { value: 'Contacted Lead', label: 'Contacted Lead' },
  { value: 'Appointment Schedule', label: 'Appointment Schedule' },
  { value: 'Enrollment in progress', label: 'Enrollment in progress' },
  { value: 'Enrolled', label: 'Enrolled' },
  { value: 'Dropped / Lost lead', label: 'Dropped / Lost lead' },
];

export function AgentLeads() {
  // Drill-down window from the productivity dashboard (`to` is exclusive).
  const [searchParams] = useSearchParams();
  const periodFrom = searchParams.get('from');
  const periodTo = searchParams.get('to');
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [agentName, setAgentName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
  });

  useEffect(() => {
    const loadData = async () => {
      if (!agentId) return;
      
      setIsLoading(true);
      
      // Load leads for the agent
      const leadsResult = await searchLeads({
        filters: { createdBy: agentId },
        pageSize: 1000, // Get all leads for the agent
      });
      
      if (leadsResult.success && leadsResult.data && leadsResult.data.data) {
        setLeads(leadsResult.data.data);
        setFilteredLeads(leadsResult.data.data);
      }
      
      // Load agent name
      const agentResult = await getUserById(agentId);
      if (agentResult.success && agentResult.data) {
        setAgentName(`${agentResult.data.firstName} ${agentResult.data.lastName}`);
      }
      
      setIsLoading(false);
    };
    
    loadData();
  }, [agentId]);

  // Filter leads
  useEffect(() => {
    let filtered = [...leads];
    
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter((lead) => {
        const fullName = `${lead.firstName} ${lead.lastName}`.toLowerCase();
        const email = lead.email?.toLowerCase() || '';
        const phone = lead.phone?.toLowerCase() || '';
        const leadId = lead.leadId.toLowerCase();
        
        return (
          fullName.includes(searchLower) ||
          email.includes(searchLower) ||
          phone.includes(searchLower) ||
          leadId.includes(searchLower)
        );
      });
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((lead) => lead.leadStatus === statusFilter);
    }
    
    // Drill-down period window. Uses the same local-midnight rule as the
    // API so this list matches the dashboard count that was clicked.
    if (periodFrom || periodTo) {
      filtered = filtered.filter((row) => inPeriod(row.createdAt, periodFrom, periodTo));
    }

    setFilteredLeads(filtered);
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset to first page on filter
  }, [searchTerm, statusFilter, leads, periodFrom, periodTo]);


  const getStatusBadge = (status: LeadStatus) => {
    const statusConfig: Record<LeadStatus, { variant: 'success' | 'warning' | 'danger' | 'info' | 'default', label: string }> = {
      'New Lead': { variant: 'info', label: 'New Lead' },
      'Contacted Lead': { variant: 'default', label: 'Contacted' },
      'Appointment Schedule': { variant: 'warning', label: 'Appointment' },
      'Enrollment in progress': { variant: 'warning', label: 'In Progress' },
      'Enrolled': { variant: 'success', label: 'Enrolled' },
      'Dropped / Lost lead': { variant: 'danger', label: 'Dropped' },
    };
    
    const config = statusConfig[status] || { variant: 'default', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const paginatedLeads = filteredLeads.slice(
    (pagination.page - 1) * pagination.pageSize,
    pagination.page * pagination.pageSize
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate(-1)}
          >
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Agent Lead Details
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {agentName ? `Leads created by ${agentName}` : 'Loading agent information...'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {leads.length}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Leads</div>
        </div>
      </div>

      <ActiveFilterChips />

      {/* Filters */}
      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <Input
            label="Search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, phone, or lead ID..."
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="w-48">
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
              <p className="text-gray-500 dark:text-gray-400">Loading leads...</p>
            </div>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Users className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No leads found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Lead
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Contact
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Location
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Source
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLeads.map((lead) => (
                    <tr
                      key={lead.leadId}
                      className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/leads/${lead.leadId}`)}
                    >
                      <td className="py-4 px-4">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {lead.firstName} {lead.lastName}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {lead.leadId}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          {lead.email && (
                            <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                              <Mail className="w-3 h-3" />
                              <span className="truncate max-w-[180px]">{lead.email}</span>
                            </div>
                          )}
                          {lead.phone && (
                            <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                              <Phone className="w-3 h-3 shrink-0" />
                              <span className="flex-1 truncate">{formatPhoneUS(lead.phone)}</span>
                              <PhoneButton
                                phone={lead.phone}
                                leadId={lead.leadId}
                                leadName={`${lead.firstName} ${lead.lastName}`}
                                variant="icon-only"
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                          <MapPin className="w-3 h-3" />
                          <span>
                            {lead.city && lead.state 
                              ? `${lead.city}, ${lead.state}` 
                              : lead.state || lead.zipCode || 'N/A'}
                          </span>
                        </div>
                        {lead.county && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {lead.county} County
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {getStatusBadge(lead.leadStatus)}
                      </td>
                      <td className="py-4 px-4">
                        <Badge variant="default">{lead.source}</Badge>
                      </td>
                      <td className="py-4 px-4 text-gray-900 dark:text-white">
                        {formatDate(lead.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {filteredLeads.length > 0 && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <Pagination
                  currentPage={pagination.page}
                  totalPages={Math.ceil(filteredLeads.length / pagination.pageSize)}
                  totalItems={filteredLeads.length}
                  pageSize={pagination.pageSize}
                  onPageChange={(page) => setPagination({ ...pagination, page })}
                  onPageSizeChange={(size) => setPagination({ ...pagination, pageSize: size, page: 1 })}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
