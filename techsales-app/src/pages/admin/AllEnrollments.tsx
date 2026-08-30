import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  FileText, 
  Search,
  Download
} from 'lucide-react';
import { Button, Input, Select, Badge, Pagination, ActiveFilterChips } from '../../components/common';
import { formatDate } from '../../utils/dateUtils';
import { inPeriod } from '../../utils/drilldown';
import { getAllEnrollments } from '../../services/enrollmentService';
import { getLeadById } from '../../services/leadService';
import { getPlanById } from '../../services/planService';
import { getUserById } from '../../services/userService';
import type { Enrollment } from '../../types';
import type { Lead } from '../../types';
import type { Plan } from '../../types/plan';
import type { User } from '../../types';

interface EnrollmentWithDetails extends Enrollment {
  lead?: Lead;
  plan?: Plan;
  agent?: User;
}

export function AllEnrollments() {
  // Drill-down window from the productivity dashboard (`to` is exclusive).
  const [searchParams] = useSearchParams();
  const periodFrom = searchParams.get('from');
  const periodTo = searchParams.get('to');
  const sourceFilter = searchParams.get('source');
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState<EnrollmentWithDetails[]>([]);
  const [filteredEnrollments, setFilteredEnrollments] = useState<EnrollmentWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [agents, setAgents] = useState<{ value: string; label: string }[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
  });

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      
      // Load all enrollments
      const enrollmentsResult = await getAllEnrollments();
      
      if (enrollmentsResult.success && enrollmentsResult.data) {
        const enrollmentsData = enrollmentsResult.data;
        
        // Get unique agent IDs
        const uniqueAgentIds = [...new Set(enrollmentsData.map(e => e.agentId))];
        
        // Load agent details
        const agentPromises = uniqueAgentIds.map(agentId => getUserById(agentId));
        const agentResults = await Promise.all(agentPromises);
        
        const agentMap = new Map<string, User>();
        agentResults.forEach((result, index) => {
          if (result.success && result.data) {
            agentMap.set(uniqueAgentIds[index], result.data);
          }
        });
        
        // Build agents dropdown options
        const agentOptions = Array.from(agentMap.values()).map(agent => ({
          value: agent.userId,
          label: `${agent.firstName} ${agent.lastName}`,
        }));
        setAgents([{ value: 'all', label: 'All Agents' }, ...agentOptions]);
        
        // Load lead and plan details for each enrollment
        const enrollmentsWithDetails = await Promise.all(
          enrollmentsData.map(async (enrollment) => {
            const [leadResult, planResult] = await Promise.all([
              getLeadById(enrollment.leadId),
              getPlanById(enrollment.planId),
            ]);
            
            return {
              ...enrollment,
              lead: leadResult.success && leadResult.data ? leadResult.data : undefined,
              plan: planResult.success && planResult.data ? planResult.data : undefined,
              agent: agentMap.get(enrollment.agentId),
            };
          })
        );
        
        setEnrollments(enrollmentsWithDetails);
        setFilteredEnrollments(enrollmentsWithDetails);
      }
      
      setIsLoading(false);
    };
    
    loadData();
  }, []);

  // Filter enrollments
  useEffect(() => {
    let filtered = [...enrollments];
    
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter((enrollment) => {
        const leadName = enrollment.lead 
          ? `${enrollment.lead.firstName} ${enrollment.lead.lastName}`.toLowerCase()
          : '';
        const planName = enrollment.plan?.planName?.toLowerCase() || '';
        const enrollmentId = enrollment.enrollmentId.toLowerCase();
        const confirmationNumber = enrollment.confirmationNumber?.toLowerCase() || '';
        const agentName = enrollment.agent 
          ? `${enrollment.agent.firstName} ${enrollment.agent.lastName}`.toLowerCase()
          : '';
        
        return (
          leadName.includes(searchLower) ||
          planName.includes(searchLower) ||
          enrollmentId.includes(searchLower) ||
          confirmationNumber.includes(searchLower) ||
          agentName.includes(searchLower)
        );
      });
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((enrollment) => enrollment.status === statusFilter);
    }
    
    // Agent filter
    if (agentFilter !== 'all') {
      filtered = filtered.filter((enrollment) => enrollment.agentId === agentFilter);
    }
    
    // Drill-down period window. Uses the same local-midnight rule as the
    // API so this list matches the dashboard count that was clicked.
    if (periodFrom || periodTo) {
      filtered = filtered.filter((row) => inPeriod(row.enrollmentDate, periodFrom, periodTo));
    }

    // Source lives on the lead, not the enrollment — the Enrollment Sources
    // chart groups enrollments by their lead's source, so match that.
    if (sourceFilter) {
      filtered = filtered.filter((row) => row.lead?.source === sourceFilter);
    }

    setFilteredEnrollments(filtered);
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page on filter
  }, [searchTerm, statusFilter, agentFilter, enrollments, periodFrom, periodTo, sourceFilter]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };


  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'default', label: string }> = {
      'Active': { variant: 'success', label: 'Active' },
      'Pending': { variant: 'warning', label: 'Pending' },
      'Submitted': { variant: 'info', label: 'Submitted' },
      'Approved': { variant: 'success', label: 'Approved' },
      'Rejected': { variant: 'danger', label: 'Rejected' },
      'Cancelled': { variant: 'danger', label: 'Cancelled' },
      'Terminated': { variant: 'danger', label: 'Terminated' },
    };
    
    const config = statusConfig[status] || { variant: 'default', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const paginatedEnrollments = filteredEnrollments.slice(
    (pagination.page - 1) * pagination.pageSize,
    pagination.page * pagination.pageSize
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/insights">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              All Enrollments
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Total: {filteredEnrollments.length} enrollment{filteredEnrollments.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      <ActiveFilterChips />

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input
            label="Search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by lead name, plan, agent, enrollment ID..."
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="w-48">
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'Active', label: 'Active' },
              { value: 'Pending', label: 'Pending' },
              { value: 'Submitted', label: 'Submitted' },
              { value: 'Approved', label: 'Approved' },
              { value: 'Rejected', label: 'Rejected' },
              { value: 'Cancelled', label: 'Cancelled' },
              { value: 'Terminated', label: 'Terminated' },
            ]}
          />
        </div>
        <div className="w-48">
          <Select
            label="Agent"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            options={agents}
          />
        </div>
      </div>

      {/* Enrollments Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
              <p className="text-gray-500 dark:text-gray-400">Loading enrollments...</p>
            </div>
          </div>
        ) : filteredEnrollments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No enrollments found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Enrollment ID
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Lead Name
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Plan
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Agent
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Type
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Enrollment Date
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Premium
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEnrollments.map((enrollment) => (
                    <tr
                      key={enrollment.enrollmentId}
                      className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                      onClick={() => navigate(`/leads/${enrollment.leadId}`)}
                    >
                      <td className="py-4 px-4">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {enrollment.enrollmentId}
                        </div>
                        {enrollment.confirmationNumber && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {enrollment.confirmationNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {enrollment.lead ? (
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {enrollment.lead.firstName} {enrollment.lead.lastName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {enrollment.lead.email}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {enrollment.plan ? (
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {enrollment.plan.planName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {enrollment.plan.product} • {enrollment.plan.planType}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {enrollment.agent ? (
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {enrollment.agent.firstName} {enrollment.agent.lastName}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <Badge variant="info">{enrollment.enrollmentType}</Badge>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {enrollment.enrollmentPeriod}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {getStatusBadge(enrollment.status)}
                      </td>
                      <td className="py-4 px-4 text-gray-900 dark:text-white">
                        {formatDate(enrollment.enrollmentDate)}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {formatCurrency(enrollment.premium)}
                        </div>
                        {enrollment.medicaidEligible && (
                          <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                            Medicaid Eligible
                          </div>
                        )}
                        {enrollment.lisLevel && (
                          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                            LIS Level {enrollment.lisLevel}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {filteredEnrollments.length > 0 && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <Pagination
                  currentPage={pagination.page}
                  totalPages={Math.ceil(filteredEnrollments.length / pagination.pageSize)}
                  totalItems={filteredEnrollments.length}
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
