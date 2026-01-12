import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Star, ChevronRight, Shield, Heart, Building2 } from 'lucide-react';
import { Button, Select, Badge, SearchInput } from '../../components/common';
import { searchPlans, type PlanWithPremium } from '../../services/planService';
import { useTheme } from '../../context/ThemeContext';

export function SelectPlan() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const year = searchParams.get('year') || '2026'; // Default to 2026 if no year specified
  const { colorTheme } = useTheme();
  
  const [plans, setPlans] = useState<PlanWithPremium[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCarrier, setSelectedCarrier] = useState<string>('');

  useEffect(() => {
    const loadPlans = async () => {
      setIsLoading(true);
      
      const filters: any = {
        contractYear: parseInt(year, 10), // Filter by contract year
      };
      
      // Only allow carrier filter if theme is default (other themes auto-filter by carrier)
      if (selectedCarrier && colorTheme === 'default') {
        filters.carrier = selectedCarrier;
      }

      const result = await searchPlans({
        searchTerm: searchTerm || undefined,
        filters,
        page: 1,
        pageSize: 50,
        colorTheme, // Pass colorTheme for automatic carrier filtering
      });

      if (result.success && result.data) {
        setPlans(result.data.data);
      }
      setIsLoading(false);
    };

    loadPlans();
  }, [year, searchTerm, selectedCarrier, colorTheme]);

  const handleEnroll = (planId: string) => {
    navigate(`/enroll/form?planId=${planId}&year=${year}`);
  };

  const carrierOptions = [
    { value: '', label: 'All Carriers' },
    { value: 'Aetna', label: 'Aetna' },
    { value: 'UnitedHealthcare', label: 'UnitedHealthcare' },
    { value: 'Humana', label: 'Humana' },
    { value: 'Blue Cross Blue Shield', label: 'Blue Cross Blue Shield' },
    { value: 'Cigna', label: 'Cigna' },
  ];

  // Get plan type color
  const getPlanTypeColor = (planType: string) => {
    switch (planType) {
      case 'HMO': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'PPO': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'DSNP': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'CSNP': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'POS': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  // Get product icon
  const getProductIcon = (product: string) => {
    switch (product) {
      case 'MAPD': return <Shield className="w-4 h-4" />;
      case 'PDP': return <Heart className="w-4 h-4" />;
      case 'MA': return <Building2 className="w-4 h-4" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  // Render star rating
  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${
              star <= rating
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-gray-200 text-gray-200 dark:fill-gray-600 dark:text-gray-600'
            }`}
          />
        ))}
        <span className="ml-1 text-sm text-gray-600 dark:text-gray-400">
          {rating.toFixed(1)}
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Select Plan for Enrollment
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Contract Year {year}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate('/enroll/select-year')}
            >
              Change Year
            </Button>
          </div>

          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <SearchInput
                placeholder="Search plans..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {colorTheme === 'default' && (
              <Select
                options={carrierOptions}
                value={selectedCarrier}
                onChange={(e) => setSelectedCarrier(e.target.value)}
                className="w-48"
              />
            )}
          </div>
        </div>

        {/* Plans Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading plans...</p>
          </div>
        ) : plans.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
            <p className="text-gray-600 dark:text-gray-400">No plans found for the selected criteria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {plans.map((plan) => {
              const monthlyPremium = plan.monthlyPremium || 0;
              
              return (
                <div
                  key={plan.planId}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-orange-300 dark:hover:border-orange-700 transition-all group"
                >
                  {/* Plan Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${getPlanTypeColor(plan.planType)}`}>
                        {getProductIcon(plan.product)}
                      </div>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${getPlanTypeColor(plan.planType)}`}>
                        {plan.planType}
                      </span>
                    </div>
                    <Badge variant={plan.product === 'MAPD' ? 'primary' : plan.product === 'PDP' ? 'info' : 'default'}>
                      {plan.product}
                    </Badge>
                  </div>

                  {/* Plan Name */}
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2 group-hover:text-orange-600 dark:group-hover:text-orange-400">
                    {plan.planName}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    {plan.contractNumber}-{plan.pbp}
                  </p>
                  {plan.marketingName && (
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-3">
                      {plan.marketingName}
                    </p>
                  )}

                  {/* Star Rating */}
                  {plan.starRating && (
                    <div className="mb-3">
                      {renderStars(plan.starRating)}
                    </div>
                  )}

                  {/* Premium */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700 mb-4">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Monthly Premium</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        ${monthlyPremium.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Enroll Button */}
                  <Button
                    onClick={() => handleEnroll(plan.planId)}
                    className="w-full"
                    leftIcon={<ChevronRight className="w-4 h-4" />}
                  >
                    Enroll Now
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

