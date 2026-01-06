import { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Users, 
  Target, 
  Calendar,
  BarChart3,
  CheckCircle,
  AlertCircle,
  Clock,
  DollarSign,
  Star,
  Activity,
  Sparkles,
  Phone,
  ClipboardCheck,
  XCircle
} from 'lucide-react';
import { Button, Select } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { getAllLeads } from '../../services/leadService';
import type { LeadStatus } from '../../types';

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
  appointments: number;
  conversionRate: number;
  revenue: number;
  targetProgress: number;
}

const mockTargets: Target[] = [
  { id: '1', type: 'daily', metric: 'Enrollments', target: 5, current: 3, period: 'Today' },
  { id: '2', type: 'daily', metric: 'Appointments', target: 10, current: 7, period: 'Today' },
  { id: '3', type: 'weekly', metric: 'Enrollments', target: 25, current: 18, period: 'This Week' },
  { id: '4', type: 'weekly', metric: 'Revenue', target: 50000, current: 38000, period: 'This Week' },
  { id: '5', type: 'monthly', metric: 'Enrollments', target: 100, current: 72, period: 'This Month' },
  { id: '6', type: 'monthly', metric: 'Revenue', target: 200000, current: 145000, period: 'This Month' },
];

const mockAgentPerformance: AgentPerformance[] = [
  { agentId: 'USER-002', agentName: 'John Doe', enrollments: 18, appointments: 42, conversionRate: 42.9, revenue: 38000, targetProgress: 72 },
  { agentId: 'USER-003', agentName: 'Jane Smith', enrollments: 15, appointments: 38, conversionRate: 39.5, revenue: 32000, targetProgress: 60 },
  { agentId: 'USER-004', agentName: 'Mike Wilson', enrollments: 12, appointments: 35, conversionRate: 34.3, revenue: 25000, targetProgress: 48 },
];

export function ProductivityDashboard() {
  const { user } = useAuth();
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

  // Load lead status counts
  useEffect(() => {
    const loadLeadData = async () => {
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
        
        result.data.forEach(lead => {
          if (lead.leadStatus && counts.hasOwnProperty(lead.leadStatus)) {
            counts[lead.leadStatus] = (counts[lead.leadStatus] || 0) + 1;
          }
        });
        
        setLeadStatusCounts(counts);
      }
    };
    loadLeadData();
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
        <Button leftIcon={<Target className="w-4 h-4" />}>
          Create Target
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTargets.map((target) => {
          const progress = (target.current / target.target) * 100;
          const isRevenue = target.metric === 'Revenue';
          
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
                      {isRevenue ? formatCurrency(target.current) : target.current}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      / {isRevenue ? formatCurrency(target.target) : target.target}
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
                    {isRevenue 
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

      {/* Agent Performance */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
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
                  Appointments
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Conversion Rate
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Revenue
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Target Progress
                </th>
              </tr>
            </thead>
            <tbody>
              {mockAgentPerformance.map((agent) => (
                <tr
                  key={agent.agentId}
                  className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
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
                    {agent.appointments}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {agent.conversionRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-gray-900 dark:text-white">
                    {formatCurrency(agent.revenue)}
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
            </tbody>
          </table>
        </div>
      </div>

      {/* Lead Lifecycle Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="w-5 h-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Lead Lifecycle Overview
          </h3>
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

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Total Enrollments</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">45</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">+12% from last period</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Total Appointments</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">115</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">+8% from last period</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-5 h-5 text-purple-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Total Revenue</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(95000)}
          </p>
          <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">+15% from last period</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Avg Conversion</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">38.9%</p>
          <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">+2.1% from last period</p>
        </div>
      </div>
    </div>
  );
}
