/**
 * Phase 4 — Plan Explainer Panel.
 *
 * Renders an AI-generated plan summary in either `'agent'` (technical,
 * markdown-structured) or `'member'` (plain English) mode. Markdown is
 * rendered with a tiny inline parser so we don't pull in a new dep.
 *
 * Returns null when AI is disabled (no greyed-out shell).
 */
import { useEffect, useState, useCallback, type ReactElement } from 'react';
import { Sparkles, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '../common';
import { useAuth } from '../../context/AuthContext';
import { useAiEnabled } from '../../hooks/useAiEnabled';
import { aiService, type ExplainResponseData } from '../../services/aiService';

interface PlanExplainerPanelProps {
  planId: string;
  mode: 'agent' | 'member';
}

/**
 * Tiny markdown renderer. Supports:
 *   - `# ` / `## ` headings
 *   - `**bold**`
 *   - `- ` unordered list items
 *   - blank-line-delimited paragraphs
 *
 * It is intentionally NOT a full CommonMark parser — just enough to render
 * Claude's output safely without a runtime dependency.
 */
function renderMarkdown(md: string): ReactElement[] {
  const lines = md.split('\n');
  const blocks: ReactElement[] = [];
  let listBuffer: string[] = [];
  let paragraphBuffer: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(' ');
    blocks.push(
      <p
        key={`p-${key++}`}
        className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3"
      >
        {renderInline(text)}
      </p>,
    );
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul
        key={`ul-${key++}`}
        className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300 mb-3 pl-2"
      >
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3
          key={`h2-${key++}`}
          className="text-base font-semibold text-gray-900 dark:text-white mt-4 mb-2"
        >
          {renderInline(line.slice(3))}
        </h3>,
      );
      continue;
    }
    if (line.startsWith('# ')) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2
          key={`h1-${key++}`}
          className="text-lg font-bold text-gray-900 dark:text-white mt-4 mb-2"
        >
          {renderInline(line.slice(2))}
        </h2>,
      );
      continue;
    }
    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      listBuffer.push(listMatch[1]);
      continue;
    }
    paragraphBuffer.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Inline `**bold**` rendering — splits text on `**` pairs. */
function renderInline(text: string): ReactElement[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={i} className="font-semibold text-gray-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function PlanExplainerPanel({ planId, mode }: PlanExplainerPanelProps) {
  const aiEnabled = useAiEnabled();
  const { user } = useAuth();

  const [data, setData] = useState<ExplainResponseData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExplain = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const res = await aiService.explain(planId, mode, {
      ...(user?.userId ? { userId: user.userId } : {}),
    });
    if (res.success && res.data) {
      setData(res.data);
    } else {
      setError(res.error ?? 'Unable to generate explanation.');
    }
    setIsLoading(false);
  }, [planId, mode, user?.userId]);

  useEffect(() => {
    if (!aiEnabled) return;
    void fetchExplain();
  }, [aiEnabled, fetchExplain]);

  if (!aiEnabled) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            {mode === 'agent' ? 'AI Plan Summary' : 'Plain-English Explanation'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {mode === 'agent'
              ? 'Technical breakdown for licensed sales agents.'
              : 'A simple walkthrough of what this plan does and what it costs.'}
          </p>
        </div>
        <Button variant="outline" onClick={() => fetchExplain()} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Regenerate
        </Button>
      </div>

      {isLoading && !data && (
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <div className="w-10 h-10 mx-auto border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mb-3" />
            <p className="text-gray-600 dark:text-gray-400">
              Generating {mode === 'agent' ? 'technical summary' : 'plain-English explanation'}…
            </p>
          </div>
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-red-500 mb-3" />
          <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
          <Button className="mt-4" onClick={() => fetchExplain()}>
            <Sparkles className="w-4 h-4" />
            Retry
          </Button>
        </div>
      )}

      {data && data.markdown && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="prose-sm dark:prose-invert max-w-none">
            {renderMarkdown(data.markdown)}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400 italic text-center pt-2">
        AI may be inaccurate — verify with official SBC documents.
      </p>
    </div>
  );
}
