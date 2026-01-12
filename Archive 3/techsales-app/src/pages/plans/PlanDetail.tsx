import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Star, 
  DollarSign, 
  Shield, 
  Heart, 
  Building2,
  Check,
  X,
  Info,
  FileText,
  Activity,
  Calculator
} from 'lucide-react';
import { Button, Badge } from '../../components/common';
import { Tabs, TabPanel } from '../../components/common/Tabs';
import type { Plan, Benefit, Premium } from '../../types';
import { getPlanById, getPlanBenefits, getPlanPremiums, getPlanRating } from '../../services/planService';

export function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [premiums, setPremiums] = useState<Premium[]>([]);
  const [starRating, setStarRating] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Get the primary premium (first one or null)
  const primaryPremium = premiums.length > 0 ? premiums[0] : null;
  const monthlyPremium = primaryPremium?.premium ?? 0;

  useEffect(() => {
    const loadPlan = async () => {
      if (!id) return;
      setIsLoading(true);
      
      const [planResult, benefitsResult, premiumsResult, ratingResult] = await Promise.all([
        getPlanById(id),
        getPlanBenefits(id),
        getPlanPremiums(id),
        getPlanRating(id),
      ]);
      
      if (planResult.success && planResult.data) {
        setPlan(planResult.data);
      }
      if (benefitsResult.success && benefitsResult.data) {
        setBenefits(benefitsResult.data);
      }
      if (premiumsResult.success && premiumsResult.data) {
        setPremiums(premiumsResult.data);
      }
      if (ratingResult.success && ratingResult.data) {
        setStarRating(ratingResult.data.overallRating);
      }
      
      setIsLoading(false);
    };
    loadPlan();
  }, [id]);

  // Render star rating
  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-5 h-5 ${
              star <= rating
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-gray-200 text-gray-200 dark:fill-gray-600 dark:text-gray-600'
            }`}
          />
        ))}
        <span className="ml-2 text-lg font-semibold text-gray-900 dark:text-white">
          {rating.toFixed(1)}
        </span>
      </div>
    );
  };

  // Get plan type color
  const getPlanTypeColor = (planType: string) => {
    switch (planType) {
      case 'HMO': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'PPO': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'DSNP': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'CSNP': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  // Group benefits by category
  const benefitsByCategory = benefits.reduce((acc, benefit) => {
    const category = benefit.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(benefit);
    return acc;
  }, {} as Record<string, Benefit[]>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading plan details...</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Plan not found</h2>
          <Button variant="outline" onClick={() => navigate('/plans')} className="mt-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Plans
          </Button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'benefits', label: 'Benefits', icon: Heart, badge: benefits.length },
    { id: 'premiums', label: 'Premiums', icon: DollarSign },
    { id: 'documents', label: 'Documents', icon: FileText },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/plans')}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Plans
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            {/* Plan Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-3 rounded-xl ${getPlanTypeColor(plan.planType)}`}>
                  <Shield className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={plan.product === 'MAPD' ? 'primary' : plan.product === 'PDP' ? 'info' : 'default'}>
                    {plan.product}
                  </Badge>
                  <span className={`px-2 py-1 text-sm font-medium rounded ${getPlanTypeColor(plan.planType)}`}>
                    {plan.planType}
                  </span>
                  {plan.category && (
                    <Badge variant="default">{plan.category}</Badge>
                  )}
                </div>
              </div>

              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {plan.planName}
              </h1>
              
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Contract: {plan.contractNumber} | PBP: {plan.pbp} | Year: {plan.contractYear}
              </p>

              <div className="flex items-center gap-6">
                {renderStars(starRating)}
                {plan.commissionable && (
                  <Badge variant="success">Commissionable</Badge>
                )}
              </div>
            </div>

            {/* Premium Card */}
            <div className="lg:w-72 bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/30 dark:to-primary-800/20 rounded-xl p-6 border border-primary-200 dark:border-primary-800">
              <p className="text-sm text-primary-700 dark:text-primary-400 mb-1">Monthly Premium</p>
              <p className="text-4xl font-bold text-primary-900 dark:text-primary-100 mb-4">
                ${monthlyPremium.toFixed(2)}
              </p>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Annual Maximum OOP</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${plan.annualOopMax?.toLocaleString() || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Drug Deductible</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${plan.drugDeductible?.toFixed(2) || '0.00'}
                  </span>
                </div>
              </div>

              <Button className="w-full mt-4">
                <Calculator className="w-4 h-4" />
                Calculate Premium
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 dark:border-gray-700 px-4">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} variant="underline" />
        </div>

        <div className="p-6">
          <TabPanel isActive={activeTab === 'overview'}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Plan Details */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Plan Details
                </h3>
                <dl className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Plan Name</dt>
                    <dd className="font-medium text-gray-900 dark:text-white text-right max-w-xs">
                      {plan.planName}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Contract Number</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{plan.contractNumber}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">PBP</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{plan.pbp}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Segment ID</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{plan.segmentId || 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Contract Year</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{plan.contractYear}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Product Type</dt>
                    <dd><Badge variant="primary">{plan.product}</Badge></dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Plan Type</dt>
                    <dd>
                      <span className={`px-2 py-1 text-sm font-medium rounded ${getPlanTypeColor(plan.planType)}`}>
                        {plan.planType}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Cost Summary */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Cost Summary
                </h3>
                <dl className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Monthly Premium</dt>
                    <dd className="font-bold text-gray-900 dark:text-white">
                      ${monthlyPremium.toFixed(2)}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Annual Premium</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      ${(monthlyPremium * 12).toFixed(2)}
                    </dd>
                  </div>
                  {primaryPremium && (
                    <>
                      <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                        <dt className="text-gray-500 dark:text-gray-400">Medicaid Adjusted</dt>
                        <dd className="font-medium text-gray-900 dark:text-white">
                          ${primaryPremium.medicaidAdjustedPremium?.toFixed(2) || '0.00'}
                        </dd>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                        <dt className="text-gray-500 dark:text-gray-400">LIS Level 1</dt>
                        <dd className="font-medium text-gray-900 dark:text-white">
                          ${primaryPremium.lisLevel1Premium?.toFixed(2) || '0.00'}
                        </dd>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                        <dt className="text-gray-500 dark:text-gray-400">LIS Level 2</dt>
                        <dd className="font-medium text-gray-900 dark:text-white">
                          ${primaryPremium.lisLevel2Premium?.toFixed(2) || '0.00'}
                        </dd>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Star Rating</dt>
                    <dd>{renderStars(starRating)}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Commissionable</dt>
                    <dd>
                      {plan.commissionable ? (
                        <Check className="w-5 h-5 text-green-600" />
                      ) : (
                        <X className="w-5 h-5 text-gray-400" />
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </TabPanel>

          <TabPanel isActive={activeTab === 'benefits'}>
            {Object.keys(benefitsByCategory).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(benefitsByCategory).map(([category, categoryBenefits]) => (
                  <div
                    key={category}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-center gap-3">
                      <Heart className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {category}
                    </h4>
                    </div>
                    {categoryBenefits.length > 0 && categoryBenefits.some(b => {
                      const hasData = b.categoryData && b.categoryData.trim() !== '';
                      const isAvailable = b.isAvailable !== false; // Default to true if not specified
                      return hasData && isAvailable;
                    }) ? (
                      <Check className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0" />
                    ) : (
                      <X className="w-6 h-6 text-red-500 dark:text-red-400 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Heart className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No benefits information available</p>
              </div>
            )}
          </TabPanel>

          <TabPanel isActive={activeTab === 'premiums'}>
            {premiums.length > 0 ? (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Premium ID</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Base Premium</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Medicaid Adj.</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">LIS Level 1</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">LIS Level 2</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">LIS Level 3</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">LIS Level 4</th>
                      </tr>
                    </thead>
                    <tbody>
                      {premiums.map((premium, index) => (
                        <tr key={index} className="border-b border-gray-100 dark:border-gray-700">
                          <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">{premium.premiumId}</td>
                          <td className="py-3 px-4 text-right font-bold text-primary-600 dark:text-primary-400">
                            ${premium.premium?.toFixed(2) || '0.00'}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
                            ${premium.medicaidAdjustedPremium?.toFixed(2) || '0.00'}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
                            ${premium.lisLevel1Premium?.toFixed(2) || '0.00'}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
                            ${premium.lisLevel2Premium?.toFixed(2) || '0.00'}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
                            ${premium.lisLevel3Premium?.toFixed(2) || '0.00'}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
                            ${premium.lisLevel4Premium?.toFixed(2) || '0.00'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No premium information available</p>
              </div>
            )}
          </TabPanel>

          <TabPanel isActive={activeTab === 'documents'}>
            {plan.documents && plan.documents.length > 0 ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Plan Documents
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {plan.documents.map((doc) => (
                    <div
                      key={doc.documentId}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-primary-300 dark:hover:border-primary-600 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                            <h4 className="font-medium text-gray-900 dark:text-white">
                              {doc.documentName}
                            </h4>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                            <Badge variant="info">{doc.documentType}</Badge>
                            {doc.documentDate && (
                              <span>Date: {new Date(doc.documentDate).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <a
                          href={doc.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-4 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                        >
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No documents available for this plan</p>
            </div>
            )}
          </TabPanel>
        </div>
      </div>
    </div>
  );
}

