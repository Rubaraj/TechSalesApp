import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ChevronRight } from 'lucide-react';
import { Button } from '../../components/common';
import { getAllPlans } from '../../services/planService';

export function SelectPlanYear() {
  const navigate = useNavigate();
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [availableYears, setAvailableYears] = useState<{ value: string; label: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAvailableYears = async () => {
      setIsLoading(true);
      const result = await getAllPlans();
      if (result.success && result.data) {
        // Get unique contract years from plans, sorted descending (newest first)
        const years = [...new Set(result.data.map(p => p.contractYear))]
          .sort((a, b) => b - a)
          .map(year => ({
            value: year.toString(),
            label: year.toString(),
          }));
        setAvailableYears(years);
        // Set default to the most recent year
        if (years.length > 0 && !selectedYear) {
          setSelectedYear(years[0].value);
        }
      }
      setIsLoading(false);
    };

    loadAvailableYears();
  }, []);

  const handleContinue = () => {
    if (selectedYear) {
      navigate(`/enroll/select-plan?year=${selectedYear}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading available years...</p>
        </div>
      </div>
    );
  }

  if (availableYears.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">No plan years available</p>
          <Button onClick={() => navigate('/sales')} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 shadow-lg">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Select Plan Year
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Choose the contract year for the enrollment
            </p>
          </div>

          <div className="space-y-4 mb-8">
            {availableYears.map((year) => (
              <button
                key={year.value}
                onClick={() => setSelectedYear(year.value)}
                className={`
                  w-full p-6 rounded-lg border-2 transition-all text-left
                  ${selectedYear === year.value
                    ? 'border-primary-600 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-700'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {year.label}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Contract Year {year.value}
                    </p>
                  </div>
                  {selectedYear === year.value && (
                    <div className="w-6 h-6 rounded-full bg-primary-600 dark:bg-primary-400 flex items-center justify-center">
                      <ChevronRight className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-4">
            <Button
              variant="outline"
              onClick={() => navigate('/sales')}
            >
              Cancel
            </Button>
            <Button
              onClick={handleContinue}
              disabled={!selectedYear}
              leftIcon={<ChevronRight className="w-4 h-4" />}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

