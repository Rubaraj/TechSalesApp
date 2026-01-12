import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, 
  Users, 
  Target, 
  Calendar,
  CheckCircle,
  Activity,
  Sparkles,
  Phone,
  ClipboardCheck,
  XCircle
} from 'lucide-react';
import { Button, Select, Pagination } from '../../components/common';
import { getAllLeads } from '../../services/leadService';
import { getAllUsers } from '../../services/userService';
import { getAllEnrollments } from '../../services/enrollmentService';
import { getAllPlans } from '../../services/planService';
import { getActiveTargets } from '../../services/targetService';
import { calculateMonthlyCostSavings, calculateRevenueBreakdown, calculateAgentRevenueForEnrollment } from '../../utils/costSavingsUtils';
import type { LeadStatus, Lead } from '../../types';
import type { Plan } from '../../types/plan';

interface Target {
  id: string;
  type: 'daily' | 'weekly' | 'monthly';
  metric: string;
  target: number;
  current: number;
  period: string;
}

interface AgentPerformance {
  agentId: string;
  agentName: string;
  enrollments: number;
  leadCount: number;
  conversionRate: number;
  revenue: number;
  targetProgress: number;
}

const mockTargets: Target[] = [
  { id: '1', type: 'daily', metric: 'Enrollments', target: 5, current: 3, period: 'Today' },
  { id: '2', type: 'daily', metric: 'Appointments', target: 10, current: 7, period: 'Today' },
  { id: '3', type: 'weekly', metric: 'Enrollments', target: 25, current: 18, period: 'This Week' },
  { id: '5', type: 'monthly', metric: 'Enrollments', target: 100, current: 72, period: 'This Month' },
  { id: '6', type: 'monthly', metric: 'Revenue', target: 200000, current: 145000, period: 'This Month' },
];

export function ProductivityDashboard() {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [selectedMetric, setSelectedMetric] = useState<string>('all');
  const [leadStatusCounts, setLeadStatusCounts] = useState<Record<LeadStatus, number>>({
    'New Lead': 0,
    'Contacted Lead': 0,
    'Appointment Schedule': 0,
    'Enrollment in progress': 0,
    'Enrolled': 0,
    'Dropped / Lost lead': 0,
  });
  const [agentPerformance, setAgentPerformance] = useState<AgentPerformance[]>([]);
  const [summaryStats, setSummaryStats] = useState({
    totalEnrollments: 0,
    totalLeads: 0,
    totalRevenue: 0,
    agentRevenue: 0,
    carrierRevenue: 0,
    monthlyCostSavings: 0,
    avgConversionRate: 0,
  });
  const [enrollmentSources, setEnrollmentSources] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [agentPagination, setAgentPagination] = useState({
    page: 1,
    pageSize: 5,
  });

  // Load all data and calculate metrics
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      
      // Load all data in parallel
      const [leadsResult, usersResult, enrollmentsResult, plansResult, targetsResult] = await Promise.all([
        getAllLeads(),
        getAllUsers(),
        getAllEnrollments(),
        getAllPlans(),
        getActiveTargets(),
      ]);

        if (leadsResult.success && leadsResult.data && 
            usersResult.success && usersResult.data &&
            enrollmentsResult.success && enrollmentsResult.data &&
            plansResult.success && plansResult.data) {
          
          const leads = leadsResult.data;
          const users = usersResult.data;
          const enrollments = enrollmentsResult.data;
          const plans = plansResult.data;
          const targets = targetsResult.success && targetsResult.data ? targetsResult.data : [];
          
          // Find active monthly target for enrollments
          const enrollmentTarget = targets.find(
            t => t.metric === 'New Enrollments' && t.period === 'monthly' && t.isActive
          );
          const monthlyEnrollmentTarget = enrollmentTarget?.targetValue || 20; // Default to 20 if no target set

        // Filter agents only (exclude admin)
        const agents = users.filter(u => u.accessLevel === 'agent' && !u.isSuperAdmin);

        // Calculate lead status counts
        const counts: Record<LeadStatus, number> = {
          'New Lead': 0,
          'Contacted Lead': 0,
          'Appointment Schedule': 0,
          'Enrollment in progress': 0,
          'Enrolled': 0,
          'Dropped / Lost lead': 0,
        };
        
        leads.forEach(lead => {
          if (lead.leadStatus && counts.hasOwnProperty(lead.leadStatus)) {
            counts[lead.leadStatus] = (counts[lead.leadStatus] || 0) + 1;
          }
        });
        
        setLeadStatusCounts(counts);

        // Create a map of planId to Plan for quick lookup
        const planMap = new Map<string, Plan>();
        plans.forEach(plan => {
          planMap.set(plan.planId, plan);
        });

        // Calculate agent performance metrics
        const performance: AgentPerformance[] = agents.map(agent => {
          // Count enrollments by agent
          const agentEnrollments = enrollments.filter(e => e.agentId === agent.userId);
          const enrollmentsCount = agentEnrollments.length;
          
          // Calculate agent revenue from enrollments using commission structure
          const revenue = agentEnrollments.reduce((sum, enrollment) => {
            const plan = planMap.get(enrollment.planId);
            return sum + calculateAgentRevenueForEnrollment(enrollment, plan);
          }, 0);
          
          // Count total leads created by this agent
          const leadCount = leads.filter(l => l.createdBy === agent.userId).length;
          
          // Calculate conversion rate (enrollments / total leads * 100)
          const conversionRate = leadCount > 0 ? (enrollmentsCount / leadCount) * 100 : 0;
          
          // Calculate target progress based on admin-set monthly target
          const targetProgress = monthlyEnrollmentTarget > 0 
            ? (enrollmentsCount / monthlyEnrollmentTarget) * 100 
            : 0;
          
          return {
            agentId: agent.userId,
            agentName: `${agent.firstName} ${agent.lastName}`,
            enrollments: enrollmentsCount,
            leadCount,
            conversionRate,
            revenue: Math.round(revenue * 100) / 100, // Round to 2 decimal places
            targetProgress: Math.min(targetProgress, 100),
          };
        });

        // Sort by enrollments (descending)
        performance.sort((a, b) => b.enrollments - a.enrollments);
        setAgentPerformance(performance);

        // Calculate summary stats
        const totalEnrollments = enrollments.length;
        const totalLeads = leads.length;
        const revenueBreakdown = calculateRevenueBreakdown(enrollments, plans);
        const monthlyCostSavings = calculateMonthlyCostSavings(enrollments, plans);
        const avgConversionRate = totalLeads > 0 
          ? (totalEnrollments / totalLeads) * 100 
          : 0;

        // Calculate enrollment sources
        const sourceCounts: Record<string, number> = {
          'Web': 0,
          'Call': 0,
          'Event': 0,
          'Referral': 0,
          'Vendor': 0,
        };
        
        // Create a map of leadId to lead for quick lookup
        const leadMap = new Map<string, Lead>();
        leads.forEach(lead => {
          leadMap.set(lead.leadId, lead);
        });

        enrollments.forEach(enrollment => {
          const lead = leadMap.get(enrollment.leadId);
          if (lead && lead.source) {
            sourceCounts[lead.source] = (sourceCounts[lead.source] || 0) + 1;
          }
        });

        setEnrollmentSources(sourceCounts);
        setSummaryStats({
          totalEnrollments,
          totalLeads,
          totalRevenue: revenueBreakdown.totalRevenue,
          agentRevenue: revenueBreakdown.agentRevenue,
          carrierRevenue: revenueBreakdown.carrierRevenue,
          monthlyCostSavings,
          avgConversionRate,
        });
      }
      
      setIsLoading(false);
    };
    
    loadData();
  }, []);

  const filteredTargets = mockTargets.filter(
    t => t.type === selectedPeriod && (selectedMetric === 'all' || t.metric === selectedMetric)
  );

  const getProgressColor = (progress: number) => {
    if (progress >= 90) return 'bg-green-500';
    if (progress >= 70) return 'bg-blue-500';
    if (progress >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Productivity Dashboard
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Monitor team performance and track targets
          </p>
        </div>
        <Button 
          leftIcon={<Target className="w-4 h-4" />}
          onClick={() => navigate('/admin/targets')}
        >
          Manage Targets
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select
          label="Period"
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
          ]}
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value as 'daily' | 'weekly' | 'monthly')}
          className="w-40"
        />
        <Select
          label="Metric"
          options={[
            { value: 'all', label: 'All Metrics' },
            { value: 'Enrollments', label: 'Enrollments' },
            { value: 'Appointments', label: 'Appointments' },
            { value: 'Revenue', label: 'Revenue' },
          ]}
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value)}
          className="w-40"
        />
      </div>

      {/* Targets Overview */}
      <div className="space-y-4">
        {/* This Week Row: Enrollments | Total Cost Savings | Total Revenue */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* This Week Enrollments */}
          {(() => {
            const weeklyEnrollment = filteredTargets.find(t => t.id === '3' && t.type === 'weekly' && t.metric === 'Enrollments');
            if (!weeklyEnrollment) return null;
            const progress = (weeklyEnrollment.current / weeklyEnrollment.target) * 100;
            
            return (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{weeklyEnrollment.period}</p>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {weeklyEnrollment.metric}
                    </h3>
                  </div>
                  <Target className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        {weeklyEnrollment.current}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        / {weeklyEnrollment.target}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Progress</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {progress.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getProgressColor(progress)}`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                  </div>

                  {progress < 100 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {weeklyEnrollment.target - weeklyEnrollment.current} remaining
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Total Cost Savings */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Total Cost Savings
                </h3>
              </div>
              <Target className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(summaryStats.monthlyCostSavings)}
                  </span>
                </div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                  From multi-platform savings
                </p>
              </div>
            </div>
          </div>

          {/* Total Revenue */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Total Revenue
                </h3>
              </div>
              <Target className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(summaryStats.totalRevenue)}
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-purple-600 dark:text-purple-400">
                    Agent: {formatCurrency(summaryStats.agentRevenue)}
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-400">
                    Carrier: {formatCurrency(summaryStats.carrierRevenue)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Other Period-based Targets */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTargets.filter(t => !(t.id === '3' && t.type === 'weekly' && t.metric === 'Enrollments')).map((target) => {
            const progress = (target.current / target.target) * 100;
            const isCurrency = target.metric === 'Revenue';
            
            return (
              <div
                key={target.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{target.period}</p>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {target.metric}
                    </h3>
                  </div>
                  <Target className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        {isCurrency ? formatCurrency(target.current) : target.current}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        / {isCurrency ? formatCurrency(target.target) : target.target}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Progress</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {progress.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getProgressColor(progress)}`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                  </div>

                  {progress < 100 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {isCurrency 
                        ? `${formatCurrency(target.target - target.current)} remaining`
                        : `${target.target - target.current} remaining`
                      }
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lead Lifecycle Chart and Agent Performance - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        {/* Lead Lifecycle Chart - 30% */}
        <div className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="w-5 h-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Lead Lifecycle Overview
          </h3>
        </div>
        <div className="space-y-4">
          {[
            { status: 'New Lead' as LeadStatus, color: 'blue', icon: Sparkles },
            { status: 'Contacted Lead' as LeadStatus, color: 'purple', icon: Phone },
            { status: 'Appointment Schedule' as LeadStatus, color: 'cyan', icon: Calendar },
            { status: 'Enrollment in progress' as LeadStatus, color: 'amber', icon: ClipboardCheck },
            { status: 'Enrolled' as LeadStatus, color: 'green', icon: CheckCircle },
            { status: 'Dropped / Lost lead' as LeadStatus, color: 'red', icon: XCircle },
          ].map((stage) => {
            const count = leadStatusCounts[stage.status];
            const total = Object.values(leadStatusCounts).reduce((sum, val) => sum + val, 0);
            const percentage = total > 0 ? (count / total) * 100 : 0;
            
            return (
              <div key={stage.status}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{stage.status}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {count} / {total} ({percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      stage.color === 'blue' ? 'bg-blue-500' :
                      stage.color === 'purple' ? 'bg-purple-500' :
                      stage.color === 'cyan' ? 'bg-cyan-500' :
                      stage.color === 'amber' ? 'bg-amber-500' :
                      stage.color === 'green' ? 'bg-green-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        </div>

        {/* Agent Performance - 70% */}
        <div className="lg:col-span-7 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Agent Performance
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Overview of all agents in your team
              </p>
            </div>
            <Users className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                  <p className="text-gray-500 dark:text-gray-400">Loading agent performance...</p>
                </div>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Agent
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Enrollments
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Lead Count
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Conversion Rate
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Target Progress
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {agentPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                        No agent performance data available
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      const startIndex = (agentPagination.page - 1) * agentPagination.pageSize;
                      const endIndex = startIndex + agentPagination.pageSize;
                      const paginatedAgents = agentPerformance.slice(startIndex, endIndex);

                      return (
                        <>
                          {paginatedAgents.map((agent) => (
                            <tr
                              key={agent.agentId}
                              className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (agent.agentId) {
                                  navigate(`/admin/agent/${agent.agentId}/enrollments`);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  if (agent.agentId) {
                                    navigate(`/admin/agent/${agent.agentId}/enrollments`);
                                  }
                                }
                              }}
                            >
                              <td className="py-4 px-4">
                                <div className="font-medium text-gray-900 dark:text-white">
                                  {agent.agentName}
                                </div>
                              </td>
                              <td className="py-4 px-4 text-right text-gray-900 dark:text-white">
                                {agent.enrollments}
                              </td>
                              <td className="py-4 px-4 text-right text-gray-900 dark:text-white">
                                {agent.leadCount}
                              </td>
                              <td className="py-4 px-4 text-right">
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {agent.conversionRate.toFixed(1)}%
                                </span>
                              </td>
                              <td className="py-4 px-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full ${getProgressColor(agent.targetProgress)}`}
                                      style={{ width: `${Math.min(agent.targetProgress, 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">
                                    {agent.targetProgress}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </>
                      );
                    })()
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {!isLoading && agentPerformance.length > 0 && (
            <div className="mt-4">
              <Pagination
                currentPage={agentPagination.page}
                totalPages={Math.ceil(agentPerformance.length / agentPagination.pageSize)}
                totalItems={agentPerformance.length}
                pageSize={agentPagination.pageSize}
                onPageChange={(page) => setAgentPagination({ ...agentPagination, page })}
                onPageSizeChange={(size) => setAgentPagination({ ...agentPagination, pageSize: size, page: 1 })}
              />
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm font-semibold text-primary-600 dark:text-primary-400" style={{color: 'green'}}>Total Enrollments</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {isLoading ? '...' : summaryStats.totalEnrollments}
          </p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All agents combined</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">Total Leads</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {isLoading ? '...' : summaryStats.totalLeads}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Total leads created</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">Avg Conversion</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {isLoading ? '...' : `${summaryStats.avgConversionRate.toFixed(1)}%`}
          </p>
          <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Enrollments / Total Leads</p>
        </div>

        {/* Enrollment Sources Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <TrendingUp className="w-5 h-5 text-purple-500" />
            <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">Enrollment Sources</span>
          </div>
          <div className="h-32 flex items-end justify-center gap-3">
            {isLoading ? (
              <div className="text-center w-full py-4 text-gray-500 dark:text-gray-400 text-sm">Loading...</div>
            ) : (
              Object.entries(enrollmentSources)
                .sort(([, a], [, b]) => b - a) // Sort by count descending
                .map(([source, count]) => {
                  const percentage = summaryStats.totalEnrollments > 0 
                    ? (count / summaryStats.totalEnrollments) * 100 
                    : 0;
                  const sourceColors: Record<string, string> = {
                    'Web': 'bg-blue-500',
                    'Call': 'bg-green-500',
                    'Event': 'bg-purple-500',
                    'Referral': 'bg-orange-500',
                    'Vendor': 'bg-pink-500',
                  };
                  
                  return (
                    <div key={source} className="flex flex-col items-center h-full" style={{ width: '50px' }}>
                      <div className="flex-1 w-full flex items-end">
                        <div className="w-full relative mx-auto" style={{ height: '100%', maxWidth: '32px' }}>
                          <div className="absolute bottom-0 left-0 right-0 bg-gray-200 dark:bg-gray-700 rounded-t" style={{ height: '100%' }} />
                          <div
                            className={`absolute bottom-0 left-0 right-0 rounded-t transition-all ${sourceColors[source] || 'bg-gray-500'}`}
                            style={{ height: `${percentage}%` }}
                          />
                        </div>
                      </div>
                      <div className="mt-2 text-center">
                        <div className="text-xs font-medium text-gray-900 dark:text-white">{count}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{source}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{percentage.toFixed(1)}%</div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
