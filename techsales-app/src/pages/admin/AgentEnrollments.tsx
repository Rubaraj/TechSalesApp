import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Calendar, 
  FileText, 
  Search
} from 'lucide-react';
import { Button, Input, Select, Badge, Table, Pagination } from '../../components/common';
import { getEnrollmentsByAgent } from '../../services/enrollmentService';
import { getLeadById } from '../../services/leadService';
import { getPlanById } from '../../services/planService';
import { getUserById } from '../../services/userService';
import type { Enrollment } from '../../types';
import type { Lead } from '../../types';
import type { Plan } from '../../types/plan';

interface EnrollmentWithDetails extends Enrollment {
  lead?: Lead;
  plan?: Plan;
  agentName?: string;
}

export function AgentEnrollments() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState<EnrollmentWithDetails[]>([]);
  const [filteredEnrollments, setFilteredEnrollments] = useState<EnrollmentWithDetails[]>([]);
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
      
      // Load enrollments for the agent
      const enrollmentsResult = await getEnrollmentsByAgent(agentId);
      
      if (enrollmentsResult.success && enrollmentsResult.data) {
        const enrollmentsData = enrollmentsResult.data;
        
        // Load agent name
        const agentResult = await getUserById(agentId);
        if (agentResult.success && agentResult.data) {
          setAgentName(`${agentResult.data.firstName} ${agentResult.data.lastName}`);
        }
        
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
            };
          })
        );
        
        setEnrollments(enrollmentsWithDetails);
        setFilteredEnrollments(enrollmentsWithDetails);
      }
      
      setIsLoading(false);
    };
    
    loadData();
  }, [agentId]);

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
        
        return (
          leadName.includes(searchLower) ||
          planName.includes(searchLower) ||
          enrollmentId.includes(searchLower) ||
          confirmationNumber.includes(searchLower)
        );
      });
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((enrollment) => enrollment.status === statusFilter);
    }
    
    setFilteredEnrollments(filtered);
    setPagination({ ...pagination, page: 1 }); // Reset to first page on filter
  }, [searchTerm, statusFilter, enrollments]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
              Agent Enrollment Details
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {agentName ? `Enrollments for ${agentName}` : 'Loading agent information...'}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <Input
            label="Search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by lead name, plan, enrollment ID..."
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
                      Type
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Enrollment Date
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Effective Date
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
                              {enrollment.plan.carrier || 'N/A'}
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
                      <td className="py-4 px-4 text-gray-900 dark:text-white">
                        {formatDate(enrollment.enrollmentDate)}
                      </td>
                      <td className="py-4 px-4 text-gray-900 dark:text-white">
                        {formatDate(enrollment.effectiveDate)}
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

