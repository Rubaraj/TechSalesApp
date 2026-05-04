import { useNavigate } from 'react-router-dom';
import { Sparkles, DollarSign, Pill, ArrowRight, CheckCircle } from 'lucide-react';
import { Badge, Button } from '../common';
import type { AIRecommendationItem } from '../../types/ai';

interface RecommendationCardProps {
  item: AIRecommendationItem;
  rank: number;
}

const scoreClasses = (score: number): string => {
  if (score >= 90) return 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30';
  if (score >= 75) return 'text-primary-700 bg-primary-100 dark:text-primary-300 dark:bg-primary-900/30';
  if (score >= 60) return 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30';
  return 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30';
};

export function RecommendationCard({ item, rank }: RecommendationCardProps) {
  const navigate = useNavigate();
  const goDetails = () => navigate(`/plans/${item.planId}`);

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
      onClick={goDetails}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold ${
                rank === 1
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                  : rank === 2
                    ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                    : 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
              }`}
            >
              #{rank}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                {item.planName}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 truncate">{item.carrier}</p>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Badge variant="primary">{item.carrier}</Badge>
              </div>
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <div
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-bold ${scoreClasses(item.matchScore)}`}
            >
              <Sparkles className="w-4 h-4" />
              {Math.round(item.matchScore)}% Match
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                ${item.monthlyPremium.toFixed(2)}
                <span className="text-sm font-normal text-gray-500">/mo</span>
              </p>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-green-600 dark:text-green-400">
              <Pill className="w-4 h-4" />
              <span className="font-bold">{Math.round(item.drugCoveragePercent)}%</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Drugs Covered</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-purple-600 dark:text-purple-400">
              <DollarSign className="w-4 h-4" />
              <span className="font-bold">${Math.round(item.estimatedAnnualCost)}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Est. Annual Cost</p>
          </div>
        </div>

        {/* Rationale */}
        {item.rationale && (
          <p className="mt-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {item.rationale}
          </p>
        )}

        {/* Highlights */}
        {item.keyHighlights && item.keyHighlights.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {item.keyHighlights.map((highlight, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs rounded-full"
              >
                <CheckCircle className="w-3 h-3" />
                {highlight}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <Button
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              goDetails();
            }}
          >
            View Details
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
