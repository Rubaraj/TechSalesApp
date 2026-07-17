/**
 * Phase 4 — `/plans/compare` page.
 *
 * Compact selection UX: chosen plans render as removable chips on a single
 * row, and an "Add plan" combobox opens a floating result dropdown only
 * while searching — the comparison grid owns the page, not the picker.
 *
 * Deep-linkable: `/plans/compare?ids=PLAN-001,PLAN-025` preselects the
 * plans and auto-runs the comparison — this is the URL Atlas's
 * compare_plans flow navigates to. Selections keep the URL in sync so any
 * comparison is shareable.
 *
 * Returns an "AI required" placeholder when AI is disabled — full
 * keyword-only comparison fallback is out of scope for Phase 4.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  AlertTriangle,
  Scale,
  Star,
  Plus,
  X,
} from 'lucide-react';
import { Button, Badge } from '../../components/common';
import { EmptyState } from '../../components/common/EmptyState';
import { ComparisonGrid, type ComparisonRow } from '../../components/comparison/ComparisonGrid';
import { useAuth } from '../../context/AuthContext';
import { useAiEnabled } from '../../hooks/useAiEnabled';
import { aiService, type CompareResponseData } from '../../services/aiService';
import {
  searchPlans,
  getPlanById,
  getPlanWithDetails,
  type PlanWithPremium,
} from '../../services/planService';

const MAX_PLANS = 4;

interface SelectedPlan {
  planId: string;
  planName: string;
  monthlyPremium?: number;
}

export function PlanCompare() {
  const navigate = useNavigate();
  const aiEnabled = useAiEnabled();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [results, setResults] = useState<PlanWithPremium[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedPlan[]>([]);
  const [data, setData] = useState<CompareResponseData | null>(null);
  const [starByPlan, setStarByPlan] = useState<Record<string, number | null>>({});
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickerRef = useRef<HTMLDivElement>(null);
  // One-shot deep-link consumption: ?ids=A,B preselects and auto-compares.
  const deepLinkConsumed = useRef(false);

  // Combobox search — only fetches while the picker is in use.
  useEffect(() => {
    const load = async () => {
      setIsSearching(true);
      const res = await searchPlans({
        searchTerm: searchTerm || undefined,
        page: 1,
        pageSize: 30,
      });
      if (res.success && res.data) {
        setResults(res.data.data);
      }
      setIsSearching(false);
    };
    void load();
  }, [searchTerm]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (deepLinkConsumed.current) return;
    deepLinkConsumed.current = true;
    const ids = (searchParams.get('ids') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_PLANS);
    if (ids.length >= 2) {
      void (async () => {
        const loaded = await Promise.all(ids.map((id) => getPlanById(id)));
        setSelected(
          ids.map((id, i) => {
            const p = loaded[i];
            return {
              planId: id,
              planName: p.success && p.data ? p.data.planName : id,
              monthlyPremium:
                p.success && p.data
                  ? (p.data as { monthlyPremium?: number }).monthlyPremium
                  : undefined,
            };
          }),
        );
        void runCompare(ids);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncUrl = (ids: string[]) => {
    setSearchParams(ids.length >= 2 ? { ids: ids.join(',') } : {}, { replace: true });
  };

  const addPlan = (plan: PlanWithPremium) => {
    setSelected((prev) => {
      if (prev.some((s) => s.planId === plan.planId) || prev.length >= MAX_PLANS) return prev;
      const next = [
        ...prev,
        { planId: plan.planId, planName: plan.planName, monthlyPremium: plan.monthlyPremium },
      ];
      syncUrl(next.map((s) => s.planId));
      return next;
    });
    setSearchTerm('');
    setPickerOpen(false);
  };

  const removePlan = (planId: string) => {
    setSelected((prev) => {
      const next = prev.filter((s) => s.planId !== planId);
      syncUrl(next.map((s) => s.planId));
      return next;
    });
  };

  const runCompare = async (planIds?: string[]) => {
    const ids = planIds ?? selected.map((s) => s.planId);
    if (ids.length < 2) return;
    setIsComparing(true);
    setError(null);
    syncUrl(ids);
    const [res, details] = await Promise.all([
      aiService.compare(ids, {
        ...(user?.userId ? { userId: user.userId } : {}),
      }),
      Promise.all(ids.map((id) => getPlanWithDetails(id))),
    ]);
    setIsComparing(false);
    if (res.success && res.data) {
      setData(res.data);
      const stars: Record<string, number | null> = {};
      ids.forEach((id, i) => {
        const d = details[i];
        stars[id] =
          d.success && d.data?.starRating ? (d.data.starRating.overallRating ?? null) : null;
      });
      setStarByPlan(stars);
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
      label: 'Carrier',
      values: planList.map((p) => p.carrier ?? '—'),
      alwaysShow: true,
    });
    rows.push({
      label: 'Plan Type',
      values: planList.map((p) =>
        p.planType ? <Badge variant="primary">{p.planType}</Badge> : '—',
      ),
      compareValues: planList.map((p) => p.planType ?? null),
      alwaysShow: true,
    });
    rows.push({
      label: 'Monthly Premium',
      values: planList.map((p) =>
        typeof p.premium === 'number' ? `$${p.premium.toFixed(2)}` : '—',
      ),
      compareValues: planList.map((p) => p.premium ?? null),
      alwaysShow: true,
    });
    rows.push({
      label: 'Star Rating',
      values: planList.map((p) => {
        const rating = starByPlan[p.planId];
        if (typeof rating !== 'number' || rating <= 0) return '—';
        return (
          <span className="inline-flex items-center gap-1">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            {rating.toFixed(1)}
          </span>
        );
      }),
      compareValues: planList.map((p) => starByPlan[p.planId] ?? null),
      alwaysShow: true,
    });

    // Build a unique benefit category list across all plans (preserve order).
    const allCats = new Set<string>();
    for (const p of planList) {
      for (const b of p.benefits) allCats.add(b.category);
    }
    for (const cat of allCats) {
      const cells = planList.map((p) => {
        const match = p.benefits.find((b) => b.category === cat);
        if (!match) return '—';
        if (match.isAvailable === false) return 'Not covered';
        return 'Covered';
      });
      rows.push({ label: cat, values: cells, compareValues: cells });
    }
    return rows;
  };

  const canAddMore = selected.length < MAX_PLANS;
  const dropdownResults = results.filter(
    (p) => !selected.some((s) => s.planId === p.planId),
  );

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
            Add 2–4 plans, then ask the AI to surface the key differences.
          </p>
        </div>
        <Button onClick={() => void runCompare()} disabled={selected.length < 2 || isComparing}>
          {isComparing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          Compare {selected.length > 0 && `(${selected.length})`}
        </Button>
      </div>

      {/* Compact plan selector — chips + combobox, one row tall */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {selected.map((s) => (
            <span
              key={s.planId}
              className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 text-sm text-primary-800 dark:text-primary-200"
            >
              <span className="font-medium">{s.planName}</span>
              {typeof s.monthlyPremium === 'number' && (
                <span className="text-xs opacity-70">${s.monthlyPremium.toFixed(2)}/mo</span>
              )}
              <button
                onClick={() => removePlan(s.planId)}
                className="p-0.5 rounded-full hover:bg-primary-100 dark:hover:bg-primary-800/60 transition-colors"
                title="Remove"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}

          {canAddMore && (
            <div className="relative flex-1 min-w-[220px]" ref={pickerRef}>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 focus-within:border-primary-400 dark:focus-within:border-primary-500 transition-colors">
                <Plus className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPickerOpen(true);
                  }}
                  onFocus={() => setPickerOpen(true)}
                  placeholder={
                    selected.length === 0
                      ? 'Add a plan — search by name, carrier, or type…'
                      : 'Add another plan…'
                  }
                  className="w-full bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none py-0.5"
                />
              </div>

              {pickerOpen && (
                <div className="absolute z-20 mt-2 w-full max-h-72 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                  {isSearching ? (
                    <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      <Loader2 className="w-4 h-4 mx-auto animate-spin mb-1" />
                      Searching…
                    </div>
                  ) : dropdownResults.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      No matching plans.
                    </div>
                  ) : (
                    dropdownResults.map((plan) => (
                      <button
                        key={plan.planId}
                        onClick={() => addPlan(plan)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {plan.planName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {plan.contractNumber}-{plan.pbp} · {plan.planType} · {plan.product}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white shrink-0">
                          ${plan.monthlyPremium?.toFixed(2) ?? '0.00'}
                          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">/mo</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {!canAddMore && (
            <span className="text-xs text-gray-400 dark:text-gray-500 pl-1">
              Max {MAX_PLANS} plans
            </span>
          )}
        </div>
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
            columnLinks={data.comparison.plans.map((p) => `/plans/${p.planId}`)}
            items={buildRows(data)}
            highlightChanges
            collapseUnchanged
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

      {/* First-run hint when nothing selected and nothing compared yet */}
      {!data && selected.length === 0 && (
        <EmptyState
          icon={Scale}
          title="Nothing to compare yet"
          description="Add two or more plans above to see a side-by-side comparison."
        />
      )}
    </div>
  );
}
