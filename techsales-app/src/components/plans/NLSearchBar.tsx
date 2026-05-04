/**
 * Phase 4 — Natural-Language Plan Search Bar.
 *
 * When `useAiEnabled()` is true, the input fires `aiService.search` (debounced
 * 400ms) on every keystroke ≥ 3 chars. Results are emitted via `onResults`.
 * Below the input we show the AI-interpreted filter chips (clickable to
 * remove); removing a chip re-runs the search with that filter dropped from
 * the natural-language query.
 *
 * When AI is off, we render the existing `<SearchInput>` instead so the
 * caller's keyword behaviour is preserved.
 */
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, Search, X } from 'lucide-react';
import { useAiEnabled } from '../../hooks/useAiEnabled';
import { useAuth } from '../../context/AuthContext';
import { SearchInput } from '../common/SearchInput';
import { aiService } from '../../services/aiService';
import type { AISearchFilters, AISearchResult } from '../../types/ai';
import { FilterChipRow } from './FilterChipRow';

export interface NLSearchBarProps {
  /**
   * Called with each AI search response. Pass through to the page so it can
   * render the result rows. Pages should still drive their own list when the
   * user hasn't typed an AI query yet.
   */
  onResults: (result: AISearchResult | null) => void;
  /** Placeholder text. */
  placeholder?: string;
  /**
   * Props forwarded to the fallback `<SearchInput>` when AI is disabled. We
   * deliberately don't try to AI-ify the fallback path.
   */
  fallback?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
  };
  className?: string;
}

const DEBOUNCE_MS = 400;
const MIN_CHARS = 3;

export function NLSearchBar({
  onResults,
  placeholder = 'Ask in plain English… e.g. "low premium HMO in Florida"',
  fallback,
  className = '',
}: NLSearchBarProps) {
  const aiEnabled = useAiEnabled();
  const { user } = useAuth();

  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AISearchFilters>({});
  const [rationale, setRationale] = useState<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Run the AI search.
  const runSearch = async (q: string, filterOverride?: AISearchFilters) => {
    if (q.trim().length < MIN_CHARS) {
      setIsLoading(false);
      setError(null);
      setFilters(filterOverride ?? {});
      setRationale('');
      onResults(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    const res = await aiService.search(q, {
      ...(user?.userId ? { userId: user.userId } : {}),
    });
    setIsLoading(false);
    if (res.success && res.data) {
      setFilters(res.data.filters);
      setRationale(res.data.rationale);
      onResults(res.data);
    } else {
      setError(res.error ?? 'Search failed.');
      onResults(null);
    }
  };

  // Debounced reaction to the input value. We intentionally keep the logic
  // outside the input's local state so a chip-remove can also trigger it.
  useEffect(() => {
    if (!aiEnabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, aiEnabled]);

  if (!aiEnabled) {
    if (!fallback) return null;
    return (
      <SearchInput
        value={fallback.value}
        onChange={fallback.onChange}
        placeholder={fallback.placeholder ?? placeholder}
        {...(fallback.className ? { className: fallback.className } : {})}
      />
    );
  }

  // Removing a chip clears that filter locally and re-emits results with the
  // chip removed. We don't re-run the AI parse — the user's intent already
  // produced these filters.
  const handleRemove = (key: keyof AISearchFilters) => {
    const next: AISearchFilters = { ...filters };
    delete next[key];
    setFilters(next);
    // Re-emit a synthetic result with the slimmer filter set, so the page can
    // re-filter its current rows. We don't have a fresh result list yet.
    onResults({
      filters: next,
      rephrasedQuery: query,
      rationale,
      results: [],
    });
  };

  return (
    <div className={className}>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 text-primary-500" />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="
            w-full pl-10 pr-10 py-2 border rounded-lg
            border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800
            text-gray-900 dark:text-gray-100 placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
            transition-colors
          "
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Clear search"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>

      <FilterChipRow filters={filters} onRemove={handleRemove} />

      {rationale && !error && query.length >= MIN_CHARS && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <Search className="w-3 h-3" />
          {rationale}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
