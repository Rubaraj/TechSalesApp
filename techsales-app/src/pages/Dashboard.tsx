import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  FileText,
  Building2,
  Pill,
  Calendar,
  Mail,
  Shield,
  Heart,
  TrendingUp,
  BarChart3,
  UserPlus,
  ClipboardCheck,
  ArrowRight,
  Phone,
  Star,
  Sparkles,
  Activity,
  ChevronLeft,
  ChevronRight,
  Settings,
  Target,
  CheckCircle,
  XCircle,
  FileCheck,
  User,
  Stethoscope
} from 'lucide-react';
import { NavigationTile } from '../components/tiles/NavigationTile';
import { StatCard } from '../components/tiles/StatCard';
import { FlippableStatCard } from '../components/tiles/FlippableStatCard';
import { FlippableCostSavingsCard } from '../components/tiles/FlippableCostSavingsCard';
import { FlippableRevenueCard } from '../components/tiles/FlippableRevenueCard';
import { FlippableCommissionCard } from '../components/tiles/FlippableCommissionCard';
import { Badge, Select, Pagination } from '../components/common';
import { useAuth } from '../context/AuthContext';
import { getAllLeads } from '../services/leadService';
import { getAllUsers } from '../services/userService';
import { getAllEnrollments } from '../services/enrollmentService';
import { getAllPlans } from '../services/planService';
import { getActiveTargets } from '../services/targetService';
import { calculateMonthlyCostSavings, calculateRevenueBreakdown, calculateAgentRevenueForEnrollment, calculateCostSavingsBreakdown, type CostSavingsBreakdown } from '../utils/costSavingsUtils';
import type { LeadStatus } from '../types';
import type { Plan } from '../types/plan';

interface RecentActivity {
  id: string;
  type: 'lead' | 'pba' | 'enrollment' | 'pbkit';
  action: string;
  subject: string;
  timestamp: string;
  status?: string;
}

interface UpcomingAppointment {
  id: string;
  leadName: string;
  date: string;
  time: string;
  type: string;
}

interface PerformanceMetric {
  label: string;
  current: number;
  target: number;
  unit?: string;
}

interface DashboardProps {
  tab: 'insights' | 'sales';
}

export function Dashboard({ tab }: DashboardProps) {
  const { user, hasAnyPermission } = useAuth();
  const navigate = useNavigate();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [appointments, setAppointments] = useState<UpcomingAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [selectedMetric, setSelectedMetric] = useState<string>('all');
  const [leadCount, setLeadCount] = useState<number>(0);
  const [totalEnrollments, setTotalEnrollments] = useState<number>(0);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [agentRevenue, setAgentRevenue] = useState<number>(0);
  const [carrierRevenue, setCarrierRevenue] = useState<number>(0);
  const [monthlyCostSavings, setMonthlyCostSavings] = useState<number>(0);
  const [costSavingsBreakdown, setCostSavingsBreakdown] = useState<CostSavingsBreakdown>({
    mapd: { count: 0, savings: 0, rate: 20 },
    pdp: { count: 0, savings: 0, rate: 18 },
    medsup: { count: 0, savings: 0, rate: '20%' },
    anc: { count: 0, savings: 0, rate: '20%' },
    total: 0,
  });
  const [avgConversionRate, setAvgConversionRate] = useState<number>(0);
  const [enrollmentSources, setEnrollmentSources] = useState<Record<string, number>>({});
  // Agent-specific metrics
  const [agentEnrollments, setAgentEnrollments] = useState<number>(0);
  const [agentLeads, setAgentLeads] = useState<number>(0);
  const [agentConversionRate, setAgentConversionRate] = useState<number>(0);
  const [agentPersonalRevenue, setAgentPersonalRevenue] = useState<number>(0);
  const [activePBAs, setActivePBAs] = useState<number>(0);
  const [leadStatusCounts, setLeadStatusCounts] = useState<Record<LeadStatus, number>>({
    'New Lead': 0,
    'Contacted Lead': 0,
    'Appointment Schedule': 0,
    'Enrollment in progress': 0,
    'Enrolled': 0,
    'Dropped / Lost lead': 0,
  });
  const [agentPerformance, setAgentPerformance] = useState<Array<{
    agentId: string;
    agentName: string;
    enrollments: number;
    leadCount: number;
    conversionRate: number;
    revenue: number;
    targetProgress: number;
  }>>([]);
  const [agentPagination, setAgentPagination] = useState({
    page: 1,
    pageSize: 5,
  });
  
  const isAdmin = user?.accessLevel === 'admin' || user?.isSuperAdmin;

  const [plansCount, setPlansCount] = useState<number>(50);

  useEffect(() => {
    // Load lead count and status distribution
    const loadLeadData = async () => {
      const [leadsResult, usersResult, enrollmentsResult, plansResultData, targetsResult] = await Promise.all([
        getAllLeads(),
        isAdmin ? getAllUsers() : Promise.resolve({ success: false, data: [] }),
        getAllEnrollments(), // Load enrollments for agents too
        getAllPlans(), // Load plans for agents too
        isAdmin ? getActiveTargets() : Promise.resolve({ success: false, data: [] }),
      ]);
      
      if (plansResultData.success && plansResultData.data) {
        setPlansCount(plansResultData.data.length);
      }

      if (leadsResult.success && leadsResult.data) {
        const leads = leadsResult.data;
        
        // Filter leads based on user role
        const filteredLeads = isAdmin ? leads : (user ? leads.filter(l => l.createdBy === user.userId) : leads);
        setLeadCount(filteredLeads.length);
        
        // Calculate status counts (for agent, only their leads; for admin, all leads)
        const counts: Record<LeadStatus, number> = {
          'New Lead': 0,
          'Contacted Lead': 0,
          'Appointment Schedule': 0,
          'Enrollment in progress': 0,
          'Enrolled': 0,
          'Dropped / Lost lead': 0,
        };
        
        filteredLeads.forEach((lead) => {
          if (lead.leadStatus && counts[lead.leadStatus] !== undefined) {
            counts[lead.leadStatus]++;
          }
        });
        
        setLeadStatusCounts(counts);

        // Calculate agent-specific stats if user is an agent
        if (!isAdmin && user && enrollmentsResult.success && enrollmentsResult.data && plansResultData.success && plansResultData.data) {
          const enrollments = enrollmentsResult.data;
          const plans = plansResultData.data;
          const agentId = user.userId;
          
          // Filter leads created by this agent
          const agentLeadsList = leads.filter(l => l.createdBy === agentId);
          const agentLeadsCount = agentLeadsList.length;
          
          // Filter enrollments for this agent
          const agentEnrollmentsList = enrollments.filter(e => e.agentId === agentId);
          const agentEnrollmentsCount = agentEnrollmentsList.length;
          
          // Calculate agent revenue
          const planMap = new Map<string, Plan>();
          plans.forEach(plan => {
            planMap.set(plan.planId, plan);
          });
          
          const agentRevenueAmount = agentEnrollmentsList.reduce((sum, enrollment) => {
            const plan = planMap.get(enrollment.planId);
            return sum + calculateAgentRevenueForEnrollment(enrollment, plan);
          }, 0);
          
          // Calculate conversion rate
          const agentConversion = agentLeadsCount > 0 ? (agentEnrollmentsCount / agentLeadsCount) * 100 : 0;
          
          // Count active SOAs - using leads with "Appointment Schedule" status as proxy
          // In production, this would come from a dedicated SOA/PBA service
          const appointmentScheduledCount = agentLeadsList.filter(l => l.leadStatus === 'Appointment Schedule').length;
          // Use actual count, with a demo fallback of 4 if none found
          const activePBAsCount = appointmentScheduledCount > 0 ? appointmentScheduledCount : 4;
          
          setAgentLeads(agentLeadsCount);
          setAgentEnrollments(agentEnrollmentsCount);
          setAgentConversionRate(agentConversion);
          setAgentPersonalRevenue(Math.round(agentRevenueAmount * 100) / 100);
          setActivePBAs(activePBAsCount);
        }

        // Calculate overall stats for admin dashboard
        if (isAdmin && enrollmentsResult.success && enrollmentsResult.data && plansResultData.success && plansResultData.data) {
          const enrollments = enrollmentsResult.data;
          const plans = plansResultData.data;
          const totalEnrollmentsCount = enrollments.length;
          const revenueBreakdown = calculateRevenueBreakdown(enrollments, plans);
          const costSavings = calculateMonthlyCostSavings(enrollments, plans);
          const savingsBreakdown = calculateCostSavingsBreakdown(enrollments, plans);
          const avgConversion = leads.length > 0 ? (totalEnrollmentsCount / leads.length) * 100 : 0;
          
          // Calculate enrollment sources
          const sourceCounts: Record<string, number> = {
            'Web': 0,
            'Call': 0,
            'Event': 0,
            'Referral': 0,
            'Vendor': 0,
          };
          
          // Create a map of leadId to lead for quick lookup
          const leadMap = new Map();
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
          setTotalEnrollments(totalEnrollmentsCount);
          setTotalRevenue(revenueBreakdown.totalRevenue);
          setAgentRevenue(revenueBreakdown.agentRevenue);
          setCarrierRevenue(revenueBreakdown.carrierRevenue);
          setMonthlyCostSavings(costSavings);
          setCostSavingsBreakdown(savingsBreakdown);
          setAvgConversionRate(avgConversion);
        }

        // Calculate agent performance if admin
        if (isAdmin && usersResult.success && usersResult.data && enrollmentsResult.success && enrollmentsResult.data) {
          const users = usersResult.data;
          const enrollments = enrollmentsResult.data;
          const agents = users.filter(u => u.accessLevel === 'agent' && !u.isSuperAdmin);
          
          // Get active monthly enrollment target
          const targets = targetsResult.success && targetsResult.data ? targetsResult.data : [];
          const enrollmentTarget = targets.find(
            t => t.metric === 'New Enrollments' && t.period === 'monthly' && t.isActive
          );
          const monthlyEnrollmentTarget = enrollmentTarget?.targetValue || 20; // Default to 20 if no target set

          // Get plans data for revenue calculation
          const plans = plansResultData.success && plansResultData.data ? plansResultData.data : [];
          const planMap = new Map<string, Plan>();
          plans.forEach(plan => {
            planMap.set(plan.planId, plan);
          });

          const performance = agents.map(agent => {
            const agentEnrollments = enrollments.filter(e => e.agentId === agent.userId);
            const enrollmentsCount = agentEnrollments.length;
            
            // Calculate agent revenue from enrollments using commission structure
            const revenue = agentEnrollments.reduce((sum, enrollment) => {
              const plan = planMap.get(enrollment.planId);
              return sum + calculateAgentRevenueForEnrollment(enrollment, plan);
            }, 0);
            
            const leadCount = leads.filter(l => l.createdBy === agent.userId).length;
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

          performance.sort((a, b) => b.enrollments - a.enrollments);
          setAgentPerformance(performance);
        }
      }

      // Simulate loading dashboard data
      setTimeout(() => {
        setRecentActivities([
          { id: '1', type: 'lead', action: 'Created', subject: 'John Smith', timestamp: '10 minutes ago', status: 'New Lead' },
          { id: '2', type: 'pba', action: 'Completed', subject: 'Maria Garcia', timestamp: '1 hour ago', status: 'Completed' },
          { id: '3', type: 'enrollment', action: 'Submitted', subject: 'Robert Johnson - MAPD Gold', timestamp: '2 hours ago' },
          { id: '4', type: 'pbkit', action: 'Sent', subject: 'Patricia Brown', timestamp: '3 hours ago', status: 'Opened' },
          { id: '5', type: 'lead', action: 'Updated', subject: 'James Wilson', timestamp: 'Yesterday', status: 'Appointment Schedule' },
        ]);
        setAppointments([
          { id: '1', leadName: 'Emily Davis', date: 'Today', time: '2:00 PM', type: 'Phone' },
          { id: '2', leadName: 'Michael Brown', date: 'Tomorrow', time: '10:00 AM', type: 'In-Person' },
          { id: '3', leadName: 'Sarah Miller', date: 'Dec 26', time: '3:30 PM', type: 'Video Call' },
        ]);
        setIsLoading(false);
      }, 500);
    };
    loadLeadData();
  }, [isAdmin, user]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Admin stats (aggregated from all agents)
  const adminStats = [
    { title: 'Total Enrollments', value: totalEnrollments.toString(), icon: CheckCircle, change: 12, changeLabel: 'vs last period', color: 'green' as const, to: '/admin/enrollments' },
    { title: 'Total Leads', value: leadCount.toString(), icon: Calendar, change: 8, changeLabel: 'vs last period', color: 'blue' as const, to: '/leads' },
    { title: 'Avg Conversion', value: `${avgConversionRate.toFixed(1)}%`, icon: TrendingUp, change: 2.1, changeLabel: 'vs last period', color: 'orange' as const },
  ];

  // Agent stats (individual agent data) - calculated from actual data
  const agentStats = [
    { title: 'Total Leads', value: agentLeads.toString(), icon: Users, change: 12, changeLabel: 'vs last month', color: 'blue' as const, to: '/leads' },
    { title: 'Active SOAs', value: activePBAs.toString(), icon: Calendar, change: 8, changeLabel: 'this week', color: 'green' as const, to: '/pba' },
    { title: 'Enrollments', value: agentEnrollments.toString(), icon: ClipboardCheck, change: 15, changeLabel: 'vs target', color: 'purple' as const, to: user ? `/admin/agent/${user.userId}/enrollments` : undefined },
    { title: 'Conversion Rate', value: `${agentConversionRate.toFixed(1)}%`, icon: TrendingUp, change: 2.1, changeLabel: 'vs target', color: 'orange' as const },
  ];

  const stats = isAdmin ? adminStats : agentStats;

  // Get target for enrollments if available
  const enrollmentTarget = isAdmin ? 25 : 20; // Default targets
  const pbaTarget = 50;
  
  const performanceMetrics: PerformanceMetric[] = isAdmin ? [
    { label: 'Enrollments', current: 18, target: 25 },
    { label: 'SOAs Completed', current: 42, target: 50 },
    { label: 'Lead Conversion', current: 32, target: 40, unit: '%' },
    { label: 'Customer Satisfaction', current: 4.8, target: 5.0 },
  ] : [
    { label: 'Enrollments', current: agentEnrollments, target: enrollmentTarget },
    { label: 'Active SOAs', current: activePBAs, target: pbaTarget },
    { label: 'Lead Conversion', current: agentEnrollments, target: agentLeads }, // Show enrollments / leads as numbers
    { label: 'Revenue', current: agentPersonalRevenue, target: 5000 },
  ];

  const navigationItems = [
    { title: 'Leads', icon: Users, to: '/leads', color: 'text-blue-600', module: 'leads' as const },
    { title: 'Plans', icon: FileText, to: '/plans', color: 'text-green-600', module: 'plans' as const },
    { title: 'Pharmacies', icon: Building2, to: '/pharmacies', color: 'text-purple-600', module: 'pharmacy' as const },
    { title: 'Drugs', icon: Pill, to: '/drugs', color: 'text-orange-600', module: 'drugs' as const },
    { title: 'Providers', icon: User, to: '/providers', color: 'text-blue-600', module: 'providers' as const },
    { title: 'SOA - Scope of Appointments', icon: Calendar, to: '/pba', color: 'text-teal-600', module: 'pba' as const },
    { title: 'P-EKIT - Plan Electronic Kit', icon: Mail, to: '/pbkit', color: 'text-pink-600', module: 'pbkit' as const },
    { title: 'State Assistance Check', icon: Shield, to: '/state-assistance', color: 'text-red-600', module: 'stateAssistance' as const },
    { title: 'Subsidy Check', icon: Heart, to: '/plan-subsidy', color: 'text-indigo-600', module: 'planSubsidy' as const },
    { title: 'Recommendations', icon: Sparkles, to: '/recommendations', color: 'text-emerald-600', module: 'recommendations' as const },
    { title: 'YOY Comparison', icon: BarChart3, to: '/yoy', color: 'text-cyan-600', module: 'yoy' as const },
    { title: 'Admin', icon: Settings, to: '/admin', color: 'text-gray-600', module: 'admin' as const },
  ];

  const filteredNavItems = navigationItems.filter(item => hasAnyPermission(item.module));

  const navigationTiles = [
    { title: 'Leads', description: 'Manage prospects and contacts', icon: Users, to: '/leads', color: 'blue' as const, count: isAdmin ? leadCount : agentLeads, module: 'leads' as const },
    { title: 'Plans', description: 'View and compare Medicare plans', icon: FileText, to: '/plans', color: 'green' as const, count: plansCount, module: 'plans' as const },
    { title: 'Enroll Now', description: 'Enroll beneficiaries in plans', icon: FileCheck, to: '/enroll/select-year', color: 'red' as const, module: 'enrollments' as const },
    { title: 'Pharmacies', description: 'Search and tag pharmacies', icon: Building2, to: '/pharmacies', color: 'purple' as const, count: 50, module: 'pharmacy' as const },
    { title: 'Drugs', description: 'Drug lookup and tagging', icon: Pill, to: '/drugs', color: 'orange' as const, count: 50, module: 'drugs' as const },
    { title: 'Providers', description: 'Search and tag providers', icon: Stethoscope, to: '/providers', color: 'indigo' as const, count: 210, module: 'providers' as const },
    { title: 'SOA', description: 'Scope of Appointments', icon: Calendar, to: '/pba', color: 'teal' as const, count: isAdmin ? 23 : activePBAs, module: 'pba' as const },
    { title: 'P-EKIT', description: 'Plan Electronic Kit', icon: Mail, to: '/pbkit', color: 'pink' as const, count: 45, module: 'pbkit' as const },
    { title: 'State Assistance Check', description: 'Check state assistance eligibility', icon: Shield, to: '/state-assistance', color: 'red' as const, module: 'stateAssistance' as const },
    { title: 'Subsidy Check', description: 'Plan subsidy eligibility check', icon: Heart, to: '/plan-subsidy', color: 'indigo' as const, module: 'planSubsidy' as const },
    { title: 'Recommendations', description: 'Plan suggestions', icon: Sparkles, to: '/recommendations', color: 'green' as const, module: 'recommendations' as const },
    { title: 'YOY Comparison', description: 'Year-over-year plan comparison', icon: BarChart3, to: '/yoy', color: 'blue' as const, module: 'yoy' as const },
  ];

  const filteredTiles = navigationTiles.filter(tile => hasAnyPermission(tile.module));

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'lead': return Users;
      case 'pba': return Calendar;
      case 'enrollment': return ClipboardCheck;
      case 'pbkit': return Mail;
      default: return Activity;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'lead': return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
      case 'pba': return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
      case 'enrollment': return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400';
      case 'pbkit': return 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  // Productivity Dashboard data for admin
  const mockTargets = [
    { id: '1', type: 'daily', metric: 'Enrollments', target: 5, current: 3, period: 'Today' },
    { id: '2', type: 'daily', metric: 'Appointments', target: 10, current: 7, period: 'Today' },
    { id: '3', type: 'weekly', metric: 'Enrollments', target: 25, current: 18, period: 'This Week' },
    { id: '5', type: 'monthly', metric: 'Enrollments', target: 100, current: 72, period: 'This Month' },
    { id: '6', type: 'monthly', metric: 'Revenue', target: 200000, current: 145000, period: 'This Month' },
  ];


  const filteredTargets = mockTargets.filter(
    t => t.type === selectedPeriod && (selectedMetric === 'all' || t.metric === selectedMetric)
  );

  const getProgressColor = (progress: number) => {
    if (progress >= 90) return 'bg-green-500';
    if (progress >= 70) return 'bg-blue-500';
    if (progress >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex gap-4 relative">
      {/* Mobile Overlay Backdrop */}
      {isPanelOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsPanelOpen(false)}
        />
      )}

      {/* Mobile Quick Access Button - shown on very small screens when sidebar is hidden */}
      {!isPanelOpen && tab !== 'insights' && (
        <button
          onClick={() => setIsPanelOpen(true)}
          className="fixed bottom-6 left-6 z-50 sm:hidden w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full shadow-lg flex items-center justify-center text-white hover:from-primary-600 hover:to-primary-800 transition-all"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Collapsible Left Panel - Hidden on Insights tab */}
      {tab !== 'insights' && (
      <div
        className={`
          flex-shrink-0
          ${isPanelOpen 
            ? 'fixed left-4 top-24 z-50 lg:relative lg:left-auto lg:top-auto lg:z-auto' 
            : 'relative hidden sm:block'
          }
        `}
        style={{
          width: isPanelOpen ? '288px' : '64px',
          transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div 
          className="sticky top-20 bg-gradient-to-b from-primary-500 via-primary-600 to-primary-700 rounded-2xl text-white shadow-xl overflow-hidden"
          style={{
            padding: isPanelOpen ? '20px' : '12px',
            transition: 'padding 400ms cubic-bezier(0.4, 0, 0.2, 1)',
            minHeight: isPanelOpen ? 'auto' : 'calc(100vh - 120px)',
          }}
        >
          {/* Toggle Button - Only show when expanded */}
          {isPanelOpen && (
            <button
              onClick={() => setIsPanelOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors z-10"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {/* Collapsed State */}
          <div 
            className="flex flex-col items-center gap-3 h-full"
            style={{
              opacity: isPanelOpen ? 0 : 1,
              transform: isPanelOpen ? 'translateX(-20px)' : 'translateX(0)',
              transition: 'opacity 300ms ease, transform 300ms ease',
              position: isPanelOpen ? 'absolute' : 'relative',
              pointerEvents: isPanelOpen ? 'none' : 'auto',
              width: '100%',
              minHeight: 'calc(100vh - 160px)',
            }}
          >
            <button
              onClick={() => setIsPanelOpen(true)}
              className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="w-8 h-px bg-white/30" />
            {filteredNavItems.slice(0, 10).map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                  title={item.title}
                >
                  <Icon className="w-5 h-5" />
                </Link>
              );
            })}
            {/* Spacer to push remaining count to bottom */}
            <div className="flex-1" />
            {filteredNavItems.length > 10 && (
              <button
                onClick={() => setIsPanelOpen(true)}
                className="w-10 h-10 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors text-xs font-bold"
              >
                +{filteredNavItems.length - 10}
              </button>
            )}
          </div>

          {/* Expanded State */}
          <div 
            className="flex flex-col h-full"
            style={{
              opacity: isPanelOpen ? 1 : 0,
              transform: isPanelOpen ? 'translateX(0)' : 'translateX(20px)',
              transition: 'opacity 300ms ease 100ms, transform 300ms ease 100ms',
              position: isPanelOpen ? 'relative' : 'absolute',
              pointerEvents: isPanelOpen ? 'auto' : 'none',
              width: isPanelOpen ? '100%' : '248px',
              maxHeight: 'calc(100vh - 160px)',
            }}
          >
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.3) transparent' }}>
              {/* Welcome */}
              <div className="pr-8">
                <h2 className="text-xl font-bold mb-1 whitespace-nowrap">
                  Welcome, {user?.firstName}! 👋
                </h2>
                  <p className="text-white/80 text-sm whitespace-nowrap">
                  Built for agents. Trusted by seniors
                </p>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/15 backdrop-blur rounded-lg px-3 py-2">
                  <p className="text-xs text-white/80">Appointments</p>
                  <p className="text-lg font-bold">3</p>
                </div>
                <div className="bg-white/15 backdrop-blur rounded-lg px-3 py-2">
                  <p className="text-xs text-white/80">Follow-ups</p>
                  <p className="text-lg font-bold">7</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <Link
                  to="/leads/new"
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-primary-700 rounded-lg text-sm font-medium hover:bg-primary-50 transition-colors whitespace-nowrap"
                >
                  <UserPlus className="w-4 h-4" />
                  New Lead
                </Link>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/20" />

              {/* Navigation Links */}
              <div className="space-y-1">
                <p className="text-xs text-white/70 uppercase tracking-wider mb-2">Quick Access</p>
                {filteredNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/15 transition-colors text-sm whitespace-nowrap"
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {item.title}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Fixed Goal Progress at Bottom */}
            <div className="pt-3 mt-3 border-t border-white/20 flex-shrink-0">
              <div className="bg-white/15 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-white/80">Monthly Goal</span>
                  <span className="text-sm font-bold">72%</span>
                </div>
                <div className="h-2 bg-white/20 rounded-full">
                  <div className="h-full bg-white rounded-full" style={{ width: '72%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Main Content */}
      <div className={`${tab === 'insights' ? 'w-full' : 'flex-1'} min-w-0 space-y-6`}>
        {/* Insights Tab Content */}
        {tab === 'insights' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {isAdmin ? (
              /* Admin Productivity Dashboard */
              <>
                {/* Header */}
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Productivity Dashboard
                  </h1>
                  <p className="text-gray-500 dark:text-gray-400">
                    Monitor team performance and track targets
                  </p>
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

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-fr">
                  {stats.map((stat) => {
                    // Use FlippableStatCard for Avg Conversion
                    if (stat.title === 'Avg Conversion') {
                      return (
                        <FlippableStatCard
                          key={stat.title}
                          title={stat.title}
                          value={stat.value}
                          icon={stat.icon}
                          change={stat.change}
                          changeLabel={stat.changeLabel}
                          color={stat.color}
                          backTitle="How it's calculated"
                          formula="(Enrollments ÷ Leads) × 100"
                          calculation={{
                            numerator: { label: 'Total Enrollments', value: totalEnrollments },
                            denominator: { label: 'Total Leads', value: leadCount },
                            result: `${avgConversionRate.toFixed(1)}%`,
                          }}
                        />
                      );
                    }
                    
                    return (
                      <StatCard
                        key={stat.title}
                        title={stat.title}
                        value={stat.value}
                        icon={stat.icon}
                        change={stat.change}
                        changeLabel={stat.changeLabel}
                        color={stat.color}
                        to={'to' in stat ? stat.to : undefined}
                      />
                    );
                  })}
                  
                  {/* Enrollment Sources Chart */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-sm font-medium text-black-500 dark:text-gray-400 mb-1">
                          Enrollment Sources
                        </p>
                      </div>
                      <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                    </div>
                    <div className="h-32 flex items-end justify-center gap-3">
                      {isLoading ? (
                        <div className="text-center w-full py-4 text-gray-500 dark:text-gray-400 text-sm">Loading...</div>
                      ) : (
                        Object.entries(enrollmentSources)
                          .sort(([, a], [, b]) => b - a) // Sort by count descending
                          .map(([source, count]) => {
                            const percentage = totalEnrollments > 0 
                              ? (count / totalEnrollments) * 100 
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
                              <p className="text-sm text-gray-500 dark:text-black-400">{weeklyEnrollment.period}</p>
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
                    <FlippableCostSavingsCard
                      totalSavings={monthlyCostSavings}
                      breakdown={costSavingsBreakdown}
                      formatCurrency={formatCurrency}
                    />

                    {/* Total Revenue */}
                    <FlippableRevenueCard
                      totalRevenue={totalRevenue}
                      agentRevenue={agentRevenue}
                      carrierRevenue={carrierRevenue}
                      formatCurrency={formatCurrency}
                    />
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
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-primary-600" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Lead Lifecycle Overview
                        </h3>
                      </div>
                      <Link to="/leads" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                        View all <ArrowRight className="w-4 h-4" />
                      </Link>
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
                                Loading agent performance...
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
                                      <td className="py-4 px-4 text-right">
                                        <Link
                                          to={`/admin/agent/${agent.agentId}/enrollments`}
                                          className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {agent.enrollments}
                                        </Link>
                                      </td>
                                      <td className="py-4 px-4 text-right">
                                        <Link
                                          to={`/admin/agent/${agent.agentId}/leads`}
                                          className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {agent.leadCount}
                                        </Link>
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
                    </div>

                    {/* Pagination */}
                    {agentPerformance.length > 0 && (
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
              </>
            ) : (
              /* Agent Insights Dashboard */
              <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-fr">
              {stats.map((stat) => (
                <StatCard
                  key={stat.title}
                  title={stat.title}
                  value={stat.value}
                  icon={stat.icon}
                  change={stat.change}
                  changeLabel={stat.changeLabel}
                  color={stat.color}
                  to={'to' in stat ? stat.to : undefined}
                />
              ))}
            </div>

                {/* Lead Lifecycle Progress Bar */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-primary-600" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Lead Lifecycle Overview
                      </h3>
                    </div>
                    <Link to="/leads" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                      View all <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                  <div className="relative">
                    {/* Horizontal timeline line */}
                    <div className="absolute top-8 left-0 right-0 h-0.5 bg-gray-200 dark:bg-gray-700" />
                    
                    <div className="relative flex items-start justify-between">
                      {/* Lifecycle stages */}
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
                        const IconComponent = stage.icon;
                        
                        return (
                          <div key={stage.status} className="relative flex flex-col items-center" style={{ flex: 1 }}>
                            {/* Timeline dot */}
                            <div className="relative z-10 flex items-center justify-center mb-2">
                              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                stage.color === 'blue' ? 'bg-blue-500' :
                                stage.color === 'purple' ? 'bg-purple-500' :
                                stage.color === 'cyan' ? 'bg-cyan-500' :
                                stage.color === 'amber' ? 'bg-amber-500' :
                                stage.color === 'green' ? 'bg-green-500' :
                                'bg-red-500'
                              }`}>
                                <IconComponent className="w-6 h-6 text-white" />
                              </div>
                            </div>
                            
                            {/* Stage name and count */}
                            <div className="text-center">
                              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {stage.status}
                              </div>
                              <div className="text-lg font-bold text-gray-900 dark:text-white">
                                {count}
                              </div>
                              {total > 0 && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {percentage.toFixed(1)}%
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

            {/* Performance and Activity Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Performance Metrics */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Monthly Performance
                  </h3>
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
                <div className="space-y-4">
                  {performanceMetrics.map((metric, idx) => {
                    const percentage = (metric.current / metric.target) * 100;
                    return (
                      <div key={idx}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-600 dark:text-gray-400">{metric.label}</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {metric.label === 'Revenue' 
                              ? `${formatCurrency(metric.current)} / ${formatCurrency(metric.target)}`
                              : metric.label === 'Lead Conversion' && !isAdmin
                                ? `${metric.current} / ${metric.target}` // Show as numbers: enrollments / leads
                              : metric.unit === '%'
                                ? `${typeof metric.current === 'number' ? metric.current.toFixed(1) : metric.current}${metric.unit} / ${metric.target}${metric.unit}`
                                : `${metric.current}${metric.unit || ''} / ${metric.target}${metric.unit || ''}`
                            }
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              percentage >= 100 ? 'bg-green-500' :
                              percentage >= 75 ? 'bg-blue-500' :
                              percentage >= 50 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Recent Activity
                  </h3>
                </div>
                
                {isLoading ? (
                  <div className="flex items-center justify-center h-48">
                        <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentActivities.map((activity) => {
                      const Icon = getActivityIcon(activity.type);
                      return (
                        <div
                          key={activity.id}
                          className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <div className={`p-2 rounded-lg ${getActivityColor(activity.type)}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {activity.action}: {activity.subject}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{activity.timestamp}</p>
                          </div>
                          {activity.status && (
                            <Badge variant={
                                  activity.status === 'New Lead' ? 'info' :
                              activity.status === 'Completed' || activity.status === 'Opened' ? 'success' :
                                  activity.status === 'Appointment Schedule' ? 'primary' : 'default'
                            }>
                              {activity.status}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Appointments and Top Plans */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upcoming Appointments */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Upcoming Appointments
                  </h3>
                      {/* <Link to="/pba" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                    View all <ArrowRight className="w-4 h-4" />
                  </Link> */}
                </div>
                
                {appointments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
                    <Calendar className="w-12 h-12 mb-2 opacity-50" />
                    <p>No upcoming appointments</p>
                        <Link to="/pba" className="text-primary-600 hover:underline mt-1">
                      Schedule one
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {appointments.map((apt) => (
                      <div
                        key={apt.id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                            {apt.type === 'Phone' ? (
                                  <Phone className="w-5 h-5 text-primary-600" />
                            ) : apt.type === 'Video Call' ? (
                                  <Mail className="w-5 h-5 text-primary-600" />
                            ) : (
                                  <Users className="w-5 h-5 text-primary-600" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{apt.leadName}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{apt.type}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-gray-900 dark:text-white">{apt.time}</p>
                          <p className={`text-sm ${apt.date === 'Today' ? 'text-green-600' : 'text-gray-500 dark:text-gray-400'}`}>
                            {apt.date}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Recommended Plans */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Top Plans This Month
                  </h3>
                      {/* <Link to="/plans" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                    View all <ArrowRight className="w-4 h-4" />
                  </Link> */}
                </div>
                
                <div className="space-y-3">
                  {[
                    { name: 'Carrier 5 MAPD Gold', carrier: 'C5', enrollments: 8, rating: 4.5 },
                    { name: 'Carrier 1 DSNP Complete', carrier: 'Carrier 1', enrollments: 5, rating: 4.0 },
                    { name: 'Carrier 2 PPO Select', carrier: 'Carrier 2', enrollments: 3, rating: 4.5 },
                  ].map((plan, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                          idx === 1 ? 'bg-gray-100 text-gray-700' :
                              'bg-primary-100 text-primary-700'
                        }`}>
                          #{idx + 1}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{plan.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{plan.carrier}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                          <span className="font-medium text-gray-900 dark:text-white">{plan.rating}</span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{plan.enrollments} enrollments</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
              </>
            )}
          </div>
        )}

        {/* Sales Tab Content */}
        {tab === 'sales' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Quick Actions Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Quick Actions
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  Access all sales tools and modules
                </p>
              </div>
            </div>

            {/* Navigation Tiles Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredTiles.map((tile) => (
                <NavigationTile
                  key={tile.to}
                  title={tile.title}
                  description={tile.description}
                  icon={tile.icon}
                  to={tile.to}
                  color={tile.color}
                  count={tile.count}
                />
              ))}
            </div>

            {/* Quick Stats for Sales */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                <h3 className="text-lg font-semibold mb-4">Lead Pipeline</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-blue-100">New Leads</span>
                    <span className="font-bold text-xl">{leadStatusCounts['New Lead']}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-blue-100">Contacted</span>
                    <span className="font-bold text-xl">{leadStatusCounts['Contacted Lead']}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-blue-100">Scheduled</span>
                    <span className="font-bold text-xl">{leadStatusCounts['Appointment Schedule']}</span>
                  </div>
                </div>
                <Link to="/leads" className="mt-4 inline-flex items-center gap-1 text-sm text-blue-100 hover:text-white">
                  View pipeline <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
                <h3 className="text-lg font-semibold mb-4">This Week's Goals</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-green-100">SOA Appointments</span>
                      <span className="font-medium">8/10</span>
                    </div>
                    <div className="h-2 bg-white/30 rounded-full">
                      <div className="h-full bg-white rounded-full" style={{ width: '80%' }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-green-100">Enrollments</span>
                      <span className="font-medium">5/8</span>
                    </div>
                    <div className="h-2 bg-white/30 rounded-full">
                      <div className="h-full bg-white rounded-full" style={{ width: '62.5%' }} />
                    </div>
                  </div>
                </div>
                <Link to="/pba" className="mt-4 inline-flex items-center gap-1 text-sm text-green-100 hover:text-white">
                  Schedule SOA <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <FlippableCommissionCard
                estimatedCommission={agentPersonalRevenue}
                changePercent={15}
                formatCurrency={formatCurrency}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
