/**
 * Phase 4 — `/plans/compare` page.
 *
 * Lets the user pick 2-4 plans (checkbox list, client-side filterable) and
 * runs `aiService.compare` to get a structured comparison + AI narrative.
 *
 * Returns an "AI required" placeholder when AI is disabled — full
 * keyword-only comparison fallback is out of scope for Phase 4.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  AlertTriangle,
  Search,
  Scale,
} from 'lucide-react';
import { Button, Badge } from '../../components/common';
import { SearchInput } from '../../components/common/SearchInput';
import { EmptyState } from '../../components/common/EmptyState';
import { ComparisonGrid, type ComparisonRow } from '../../components/comparison/ComparisonGrid';
import { useAuth } from '../../context/AuthContext';
import { useAiEnabled } from '../../hooks/useAiEnabled';
import { aiService, type CompareResponseData } from '../../services/aiService';
import { searchPlans, type PlanWithPremium } from '../../services/planService';

export function PlanCompare() {
  const navigate = useNavigate();
  const aiEnabled = useAiEnabled();
  const { user } = useAuth();

  const [plans, setPlans] = useState<PlanWithPremium[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [data, setData] = useState<CompareResponseData | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoadingPlans(true);
      const res = await searchPlans({
        searchTerm: searchTerm || undefined,
        page: 1,
        pageSize: 50,
      });
      if (res.success && res.data) {
        setPlans(res.data.data);
      }
      setIsLoadingPlans(false);
    };
    void load();
  }, [searchTerm]);

  const toggleSelect = (planId: string) => {
    setSelected((prev) => {
      if (prev.includes(planId)) return prev.filter((p) => p !== planId);
      if (prev.length >= 4) return prev;
      return [...prev, planId];
    });
  };

  const runCompare = async () => {
    if (selected.length < 2) return;
    setIsComparing(true);
    setError(null);
    const res = await aiService.compare(selected, {
      ...(user?.userId ? { userId: user.userId } : {}),
    });
    setIsComparing(false);
    if (res.success && res.data) {
      setData(res.data);
    } else {
      setError(res.error ?? 'Compare request failed.');
    }
  };

  if (!aiEnabled) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Scale}
          title="AI required"
          description="Plan comparison requires the AI features to be enabled."
        />
      </div>
    );
  }

  // Build the side-by-side rows from the comparison response.
  const buildRows = (resp: CompareResponseData): ComparisonRow[] => {
    const planList = resp.comparison.plans;
    const rows: ComparisonRow[] = [];
    rows.push({
      label: 'Plan Name',
      values: planList.map((p) => p.planName ?? p.planId),
    });
    rows.push({
      label: 'Carrier',
      values: planList.map((p) => p.carrier ?? '—'),
    });
    rows.push({
      label: 'Plan Type',
      values: planList.map((p) =>
        p.planType ? <Badge variant="primary">{p.planType}</Badge> : '—',
      ),
    });
    rows.push({
      label: 'Monthly Premium',
      values: planList.map((p) =>
        typeof p.premium === 'number' ? `$${p.premium.toFixed(2)}` : '—',
      ),
    });

    // Build a unique benefit category list across all plans (preserve order).
    const allCats = new Set<string>();
    for (const p of planList) {
      for (const b of p.benefits) allCats.add(b.category);
    }
    for (const cat of allCats) {
      rows.push({
        label: cat,
        values: planList.map((p) => {
          const match = p.benefits.find((b) => b.category === cat);
          if (!match) return '—';
          if (match.isAvailable === false) return 'Not covered';
          return 'Covered';
        }),
      });
    }
    return rows;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/plans')}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Plans
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Scale className="w-6 h-6 text-primary-600" />
            Plan Compare
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Pick 2–4 plans, then ask the AI to surface the key differences.
          </p>
        </div>
        <Button onClick={runCompare} disabled={selected.length < 2 || isComparing}>
          {isComparing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          Compare {selected.length > 0 && `(${selected.length})`}
        </Button>
      </div>

      {/* Plan picker */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Filter plans by name, contract, or carrier…"
        />
        {isLoadingPlans ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" />
            Loading plans…
          </div>
        ) : plans.length === 0 ? (
          <EmptyState icon={Search} title="No plans found" description="Try a different search." />
        ) : (
          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
            {plans.map((plan) => {
              const checked = selected.includes(plan.planId);
              const disabled = !checked && selected.length >= 4;
              return (
                <label
                  key={plan.planId}
                  className={`flex items-center gap-3 py-3 px-2 cursor-pointer transition-colors ${
                    checked
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleSelect(plan.planId)}
                    className="w-4 h-4 text-primary-600 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {plan.planName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {plan.contractNumber}-{plan.pbp} · {plan.planType} · {plan.product}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      ${plan.monthlyPremium?.toFixed(2) ?? '0.00'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">/mo</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Comparison results */}
      {data && (
        <div className="space-y-4">
          <ComparisonGrid
            columns={data.comparison.plans.map((p) => p.planName ?? p.planId)}
            items={buildRows(data)}
            highlightChanges
          />

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-primary-600" />
              AI Summary
            </h2>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {data.narrative}
            </p>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 italic text-center">
            AI may be inaccurate — verify details with official SBC documents.
          </p>
        </div>
      )}
    </div>
  );
}
