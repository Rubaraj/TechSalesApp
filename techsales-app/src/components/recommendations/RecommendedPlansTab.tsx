import { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '../common';
import { useAuth } from '../../context/AuthContext';
import { useAiEnabled } from '../../hooks/useAiEnabled';
import { aiService, type RecommendResponseData } from '../../services/aiService';
import { recommendationCache } from '../../services/recommendationCache';
import { RecommendationCard } from './RecommendationCard';

interface RecommendedPlansTabProps {
  leadId: string;
}

export function RecommendedPlansTab({ leadId }: RecommendedPlansTabProps) {
  const aiEnabled = useAiEnabled();
  const { user } = useAuth();

  const [data, setData] = useState<RecommendResponseData | null>(() =>
    recommendationCache.get(leadId),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecs = useCallback(
    async (force: boolean) => {
      setIsLoading(true);
      setError(null);
      const res = await aiService.recommend(leadId, {
        ...(user?.userId ? { userId: user.userId } : {}),
        force,
      });
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error ?? 'Unable to generate recommendations.');
      }
      setIsLoading(false);
    },
    [leadId, user?.userId],
  );

  // Auto-fetch when no cached data is present.
  useEffect(() => {
    if (!aiEnabled) return;
    const cached = recommendationCache.get(leadId);
    if (!cached) {
      void fetchRecs(false);
    } else {
      setData(cached);
    }
  }, [aiEnabled, leadId, fetchRecs]);

  if (!aiEnabled) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            AI-recommended plans
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Ranked by overall fit against this lead's profile and tagged drugs.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => fetchRecs(true)}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Regenerate
        </Button>
      </div>

      {/* Loading */}
      {isLoading && !data && (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Generating recommendations...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-red-500 mb-3" />
          <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
          <Button className="mt-4" onClick={() => fetchRecs(true)}>
            <Sparkles className="w-4 h-4" />
            Generate
          </Button>
        </div>
      )}

      {/* Data */}
      {data && data.recommendations.length > 0 && (
        <div className="space-y-4">
          {data.recommendations.map((item, idx) => (
            <RecommendationCard key={item.planId} item={item} rank={idx + 1} />
          ))}
        </div>
      )}

      {data && data.recommendations.length === 0 && !error && !isLoading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Sparkles className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            No recommendations available
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Try regenerating after updating the lead's tagged drugs or location.
          </p>
        </div>
      )}

      {/* Footer disclaimer */}
      <p className="text-xs text-gray-500 dark:text-gray-400 italic text-center pt-2">
        AI may be inaccurate — verify against official SBC documents.
      </p>
    </div>
  );
}
