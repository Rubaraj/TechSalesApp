/**
 * Phase 4 — Drug Coverage modal.
 *
 * Drives off `aiService.drugCoverage` for a single drug across the plan ids
 * that are currently top-of-mind for this lead (we re-use the
 * `recommendationCache` so the modal can open instantly when the lead's
 * recommendation tab has already been generated).
 *
 * If no recommendations are cached, we show a placeholder asking the user to
 * generate the recommendations tab first — the alternative would be to fire
 * a recommend call here, which is out of scope (slower + more costly).
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from '../common';
import { useAuth } from '../../context/AuthContext';
import type { Lead, TaggedDrug } from '../../types';
import type { DrugCoverageResponseData } from '../../services/aiService';
import { aiService } from '../../services/aiService';
import { recommendationCache } from '../../services/recommendationCache';

interface DrugCoverageModalProps {
  lead: Lead;
  drug: TaggedDrug;
  isOpen: boolean;
  onClose: () => void;
}

export function DrugCoverageModal({ lead, drug, isOpen, onClose }: DrugCoverageModalProps) {
  const { user } = useAuth();
  const [data, setData] = useState<DrugCoverageResponseData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const cached = recommendationCache.get(lead.leadId);
    const planIds = cached?.recommendations.map((r) => r.planId) ?? [];
    if (planIds.length === 0) {
      setError(
        'No recommended plans cached for this lead yet — open the AI Recommendations tab first to populate the plan set.',
      );
      return;
    }
    const run = async () => {
      setIsLoading(true);
      setError(null);
      const res = await aiService.drugCoverage(
        lead.leadId,
        planIds,
        [drug.drugId],
        { ...(user?.userId ? { userId: user.userId } : {}) },
      );
      setIsLoading(false);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error ?? 'Unable to retrieve drug coverage.');
      }
    };
    void run();
  }, [isOpen, lead.leadId, drug.drugId, user?.userId]);

  const drugLabel = drug.drugName || drug.drugId;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Coverage for ${drugLabel}`} size="lg">
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
          <strong>Simulated formulary</strong> — pilot data only. Always verify against the
          official plan formulary before acting.
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            <span className="ml-3 text-gray-600 dark:text-gray-400">
              Looking up coverage…
            </span>
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!isLoading && data && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300 font-semibold">
                      Plan
                    </th>
                    <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300 font-semibold">
                      Covered
                    </th>
                    <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300 font-semibold">
                      Tier
                    </th>
                    <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300 font-semibold">
                      Prior Auth
                    </th>
                    <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300 font-semibold">
                      Step Therapy
                    </th>
                    <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300 font-semibold">
                      Qty Limit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.coverage.map((row) => (
                    <tr
                      key={`${row.planId}-${row.drugId}`}
                      className="border-b border-gray-100 dark:border-gray-700"
                    >
                      <td className="py-2 px-3 text-gray-900 dark:text-white font-medium">
                        {row.planId}
                      </td>
                      <td className="py-2 px-3">
                        {row.isCovered ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            Yes
                          </span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            No
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                        {row.tier ?? '—'}
                      </td>
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                        {row.priorAuth === undefined ? '—' : row.priorAuth ? 'Required' : 'No'}
                      </td>
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                        {row.stepTherapy === undefined ? '—' : row.stepTherapy ? 'Required' : 'No'}
                      </td>
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                        {row.qtyLimit ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.narrative && (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {data.narrative}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
