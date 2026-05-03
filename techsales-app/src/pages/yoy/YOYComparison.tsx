import { useState, useEffect } from 'react';
import { 
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Calendar,
  DollarSign,
  Star,
  Pill,
  Heart,
  Eye,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  RefreshCw
} from 'lucide-react';
import { Button, Badge, Select, Modal } from '../../components/common';
import { EmptyState } from '../../components/common/EmptyState';

interface PlanYear {
  year: number;
  planId: string;
  planName: string;
  carrier: string;
  planType: string;
  premium: number;
  deductible: number;
  maxOutOfPocket: number;
  starRating: number;
  drugTiers: { tier: string; copay: string }[];
  benefits: { name: string; value: string }[];
}

interface YOYChange {
  field: string;
  currentValue: string | number;
  previousValue: string | number;
  changeType: 'increase' | 'decrease' | 'same' | 'new' | 'removed';
  impact: 'positive' | 'negative' | 'neutral';
}

// Mock data
const mockCurrentYear: PlanYear = {
  year: 2025,
  planId: 'PLAN-001-2025',
  planName: 'Carrier 5 MAPD Gold',
  carrier: 'Carrier 5',
  planType: 'MAPD',
  premium: 29,
  deductible: 250,
  maxOutOfPocket: 4500,
  starRating: 4.5,
  drugTiers: [
    { tier: 'Tier 1 (Preferred Generic)', copay: '$0' },
    { tier: 'Tier 2 (Generic)', copay: '$5' },
    { tier: 'Tier 3 (Preferred Brand)', copay: '$35' },
    { tier: 'Tier 4 (Non-Preferred)', copay: '$80' },
    { tier: 'Tier 5 (Specialty)', copay: '25%' },
  ],
  benefits: [
    { name: 'Primary Care Visit', value: '$0' },
    { name: 'Specialist Visit', value: '$35' },
    { name: 'Inpatient Hospital', value: '$295/day (days 1-6)' },
    { name: 'Dental Coverage', value: '$2,000/year' },
    { name: 'Vision Coverage', value: '$200 allowance' },
    { name: 'Hearing Coverage', value: '$1,500 every 3 years' },
    { name: 'OTC Allowance', value: '$75/quarter' },
    { name: 'Fitness Benefit', value: 'SilverSneakers' },
  ],
};

const mockPreviousYear: PlanYear = {
  year: 2024,
  planId: 'PLAN-001-2024',
  planName: 'Carrier 5 MAPD Gold',
  carrier: 'Carrier 5',
  planType: 'MAPD',
  premium: 25,
  deductible: 200,
  maxOutOfPocket: 4000,
  starRating: 4.0,
  drugTiers: [
    { tier: 'Tier 1 (Preferred Generic)', copay: '$0' },
    { tier: 'Tier 2 (Generic)', copay: '$3' },
    { tier: 'Tier 3 (Preferred Brand)', copay: '$40' },
    { tier: 'Tier 4 (Non-Preferred)', copay: '$90' },
    { tier: 'Tier 5 (Specialty)', copay: '25%' },
  ],
  benefits: [
    { name: 'Primary Care Visit', value: '$0' },
    { name: 'Specialist Visit', value: '$40' },
    { name: 'Inpatient Hospital', value: '$325/day (days 1-5)' },
    { name: 'Dental Coverage', value: '$1,500/year' },
    { name: 'Vision Coverage', value: '$150 allowance' },
    { name: 'Hearing Coverage', value: '$1,000 every 3 years' },
    { name: 'OTC Allowance', value: '$50/quarter' },
    { name: 'Fitness Benefit', value: 'SilverSneakers' },
  ],
};

const calculateChanges = (current: PlanYear, previous: PlanYear): YOYChange[] => {
  const changes: YOYChange[] = [];

  // Premium
  if (current.premium !== previous.premium) {
    changes.push({
      field: 'Monthly Premium',
      currentValue: `$${current.premium}`,
      previousValue: `$${previous.premium}`,
      changeType: current.premium > previous.premium ? 'increase' : 'decrease',
      impact: current.premium > previous.premium ? 'negative' : 'positive',
    });
  }

  // Deductible
  if (current.deductible !== previous.deductible) {
    changes.push({
      field: 'Deductible',
      currentValue: `$${current.deductible}`,
      previousValue: `$${previous.deductible}`,
      changeType: current.deductible > previous.deductible ? 'increase' : 'decrease',
      impact: current.deductible > previous.deductible ? 'negative' : 'positive',
    });
  }

  // MOOP
  if (current.maxOutOfPocket !== previous.maxOutOfPocket) {
    changes.push({
      field: 'Max Out-of-Pocket',
      currentValue: `$${current.maxOutOfPocket}`,
      previousValue: `$${previous.maxOutOfPocket}`,
      changeType: current.maxOutOfPocket > previous.maxOutOfPocket ? 'increase' : 'decrease',
      impact: current.maxOutOfPocket > previous.maxOutOfPocket ? 'negative' : 'positive',
    });
  }

  // Star Rating
  if (current.starRating !== previous.starRating) {
    changes.push({
      field: 'Star Rating',
      currentValue: current.starRating,
      previousValue: previous.starRating,
      changeType: current.starRating > previous.starRating ? 'increase' : 'decrease',
      impact: current.starRating > previous.starRating ? 'positive' : 'negative',
    });
  }

  // Benefits comparison
  current.benefits.forEach((benefit) => {
    const prevBenefit = previous.benefits.find(b => b.name === benefit.name);
    if (prevBenefit && benefit.value !== prevBenefit.value) {
      changes.push({
        field: benefit.name,
        currentValue: benefit.value,
        previousValue: prevBenefit.value,
        changeType: 'increase', // Simplified
        impact: 'neutral',
      });
    }
  });

  return changes;
};

export function YOYComparison() {
  const [currentPlan, setCurrentPlan] = useState<PlanYear | null>(null);
  const [previousPlan, setPreviousPlan] = useState<PlanYear | null>(null);
  const [changes, setChanges] = useState<YOYChange[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');

  const planOptions = [
    { value: '', label: 'Select a plan to compare...' },
    { value: 'PLAN-001', label: 'Carrier 5 MAPD Gold' },
    { value: 'PLAN-002', label: 'Carrier 1 PPO Select' },
    { value: 'PLAN-003', label: 'Carrier 2 Gold Plus' },
  ];

  const loadComparison = () => {
    if (!selectedPlan) return;
    
    setIsLoading(true);
    setTimeout(() => {
      setCurrentPlan(mockCurrentYear);
      setPreviousPlan(mockPreviousYear);
      setChanges(calculateChanges(mockCurrentYear, mockPreviousYear));
      setIsLoading(false);
    }, 600);
  };

  const getChangeIcon = (change: YOYChange) => {
    if (change.changeType === 'increase') {
      return change.impact === 'positive' ? 
        <ArrowUpRight className="w-4 h-4 text-green-600" /> :
        <ArrowUpRight className="w-4 h-4 text-red-600" />;
    }
    if (change.changeType === 'decrease') {
      return change.impact === 'positive' ?
        <ArrowDownRight className="w-4 h-4 text-green-600" /> :
        <ArrowDownRight className="w-4 h-4 text-red-600" />;
    }
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'positive':
        return <Badge variant="success">Improved</Badge>;
      case 'negative':
        return <Badge variant="danger">Increased Cost</Badge>;
      default:
        return <Badge variant="default">Changed</Badge>;
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${
              i < Math.floor(rating)
                ? 'text-yellow-400 fill-yellow-400'
                : rating % 1 >= 0.5 && i === Math.floor(rating)
                ? 'text-yellow-400 fill-yellow-400/50'
                : 'text-gray-300 dark:text-gray-600'
            }`}
          />
        ))}
        <span className="ml-1 text-sm font-medium">{rating}</span>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-orange-600" />
            Year-Over-Year Comparison
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Compare plan changes between 2024 and 2025
          </p>
        </div>
      </div>

      {/* Plan Selection */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Select
              label="Select Plan"
              options={planOptions}
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={loadComparison} disabled={!selectedPlan || isLoading}>
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              Compare
            </Button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Loading comparison...</p>
          </div>
        </div>
      )}

      {/* Comparison Results */}
      {!isLoading && currentPlan && previousPlan && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Premium Change</h3>
                {currentPlan.premium > previousPlan.premium ? (
                  <TrendingUp className="w-5 h-5 text-red-500" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-green-500" />
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">${currentPlan.premium}</span>
                <span className={`text-sm ${currentPlan.premium > previousPlan.premium ? 'text-red-600' : 'text-green-600'}`}>
                  {currentPlan.premium > previousPlan.premium ? '+' : ''}${currentPlan.premium - previousPlan.premium}/mo
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">from ${previousPlan.premium}/mo</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Star Rating</h3>
                {currentPlan.starRating > previousPlan.starRating ? (
                  <TrendingUp className="w-5 h-5 text-green-500" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-500" />
                )}
              </div>
              <div className="flex items-center gap-2">
                {renderStars(currentPlan.starRating)}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {currentPlan.starRating > previousPlan.starRating ? 'Improved' : 'Changed'} from {previousPlan.starRating} stars
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Total Changes</h3>
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">{changes.length}</span>
                <span className="text-gray-500">modifications</span>
              </div>
              <div className="flex gap-2 mt-2">
                <Badge variant="success">{changes.filter(c => c.impact === 'positive').length} improved</Badge>
                <Badge variant="danger">{changes.filter(c => c.impact === 'negative').length} higher cost</Badge>
              </div>
            </div>
          </div>

          {/* Side by Side Comparison */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="grid grid-cols-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <div className="p-4 font-semibold text-gray-700 dark:text-gray-300">Feature</div>
              <div className="p-4 font-semibold text-center text-blue-600">2024</div>
              <div className="p-4 font-semibold text-center text-green-600">2025</div>
            </div>

            {/* Key Metrics */}
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              <div className="grid grid-cols-3">
                <div className="p-4 font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800/30">Monthly Premium</div>
                <div className="p-4 text-center text-gray-600 dark:text-gray-400">${previousPlan.premium}</div>
                <div className="p-4 text-center">
                  <span className="font-medium text-gray-900 dark:text-white">${currentPlan.premium}</span>
                  {currentPlan.premium !== previousPlan.premium && (
                    <span className={`ml-2 text-sm ${currentPlan.premium > previousPlan.premium ? 'text-red-600' : 'text-green-600'}`}>
                      ({currentPlan.premium > previousPlan.premium ? '+' : ''}${currentPlan.premium - previousPlan.premium})
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3">
                <div className="p-4 font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800/30">Deductible</div>
                <div className="p-4 text-center text-gray-600 dark:text-gray-400">${previousPlan.deductible}</div>
                <div className="p-4 text-center">
                  <span className="font-medium text-gray-900 dark:text-white">${currentPlan.deductible}</span>
                  {currentPlan.deductible !== previousPlan.deductible && (
                    <span className={`ml-2 text-sm ${currentPlan.deductible > previousPlan.deductible ? 'text-red-600' : 'text-green-600'}`}>
                      ({currentPlan.deductible > previousPlan.deductible ? '+' : ''}${currentPlan.deductible - previousPlan.deductible})
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3">
                <div className="p-4 font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800/30">Max Out-of-Pocket</div>
                <div className="p-4 text-center text-gray-600 dark:text-gray-400">${previousPlan.maxOutOfPocket}</div>
                <div className="p-4 text-center">
                  <span className="font-medium text-gray-900 dark:text-white">${currentPlan.maxOutOfPocket}</span>
                </div>
              </div>

              <div className="grid grid-cols-3">
                <div className="p-4 font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800/30">Star Rating</div>
                <div className="p-4 flex justify-center">{renderStars(previousPlan.starRating)}</div>
                <div className="p-4 flex justify-center">{renderStars(currentPlan.starRating)}</div>
              </div>

              {/* Benefits */}
              {currentPlan.benefits.map((benefit, index) => {
                const prevBenefit = previousPlan.benefits.find(b => b.name === benefit.name);
                const hasChanged = prevBenefit && benefit.value !== prevBenefit.value;
                
                return (
                  <div key={benefit.name} className={`grid grid-cols-3 ${hasChanged ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                    <div className="p-4 font-medium text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800/30 flex items-center gap-2">
                      {benefit.name}
                      {hasChanged && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    </div>
                    <div className="p-4 text-center text-gray-600 dark:text-gray-400">{prevBenefit?.value || 'N/A'}</div>
                    <div className="p-4 text-center">
                      <span className={hasChanged ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-gray-900 dark:text-white'}>
                        {benefit.value}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Changes Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Key Changes Summary</h2>
            <div className="space-y-3">
              {changes.map((change, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {getChangeIcon(change)}
                    <span className="font-medium text-gray-900 dark:text-white">{change.field}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-500 dark:text-gray-400">{change.previousValue}</span>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-white">{change.currentValue}</span>
                    {getImpactBadge(change.impact)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Empty State */}
      {!isLoading && !currentPlan && (
        <EmptyState
          icon={Calendar}
          title="No comparison loaded"
          description="Select a plan and click Compare to see year-over-year changes"
        />
      )}
    </div>
  );
}

