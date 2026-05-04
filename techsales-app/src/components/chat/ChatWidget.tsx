/**
 * Floating chat widget for the member portal. Closed state is a small
 * round button bottom-right; opening it expands a 380×560 panel with a
 * scrolling transcript, a live tool-trace area, and a single-line input.
 *
 * Streaming model:
 *   - On send, we append the user's message to history immediately, then
 *     open an SSE connection via `aiService.chat`.
 *   - Tokens accumulate into `streamingText`, which we render as a "live"
 *     assistant bubble distinct from the persisted history.
 *   - On `final`, the streaming bubble is committed to history and cleared.
 *   - On `error`, we show an inline error notice; the user message stays in
 *     history so the user can retry by typing again.
 *   - Sending a new message while a stream is in flight aborts the previous
 *     stream first via an AbortController stored in a ref.
 *
 * Theme-aware via primary-* / gray-* tokens. Hidden entirely when AI is off.
 */
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Trash2, AlertTriangle } from 'lucide-react';
import { useAiEnabled } from '../../hooks/useAiEnabled';
import { useAuth } from '../../context/AuthContext';
import { aiService } from '../../services/aiService';
import type { ChatStreamEvent } from '../../types/ai';
import { useChatHistory } from './useChatHistory';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ChatToolTrace, type ToolTraceEntry } from './ChatToolTrace';

interface ChatWidgetProps {
  memberId: string;
  planId: string;
}

export function ChatWidget({ memberId, planId }: ChatWidgetProps) {
  const aiEnabled = useAiEnabled();
  const { user } = useAuth();
  const { messages, appendUser, appendAssistant, clear } = useChatHistory(memberId);

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [toolTrace, setToolTrace] = useState<ToolTraceEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // AbortController for the in-flight stream. Held in a ref so a re-render
  // doesn't drop our handle.
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // Auto-focus the input when the panel opens.
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Auto-scroll the transcript when new content arrives.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingText, toolTrace]);

  // Abort any in-flight stream when the widget unmounts or closes.
  useEffect(() => {
    if (!isOpen && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [isOpen]);

  if (!aiEnabled) return null;

  const handleEvent = (event: ChatStreamEvent): void => {
    switch (event.type) {
      case 'token':
        setStreamingText((prev) => prev + event.content);
        break;
      case 'tool_start': {
        const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const description = describeToolInput(event.tool, event.input);
        setToolTrace((prev) => [
          ...prev,
          {
            id,
            tool: event.tool,
            ...(description ? { description } : {}),
            status: 'running',
          },
        ]);
        break;
      }
      case 'tool_end': {
        const summary = describeToolOutput(event.tool, event.output);
        setToolTrace((prev) => {
          // Mark the most recent matching running entry as done.
          const idx = [...prev]
            .reverse()
            .findIndex((e) => e.tool === event.tool && e.status === 'running');
          if (idx === -1) return prev;
          const realIdx = prev.length - 1 - idx;
          const next = [...prev];
          next[realIdx] = {
            ...next[realIdx],
            status: 'done',
            latencyMs: event.latencyMs,
            ...(summary ? { resultSummary: summary } : {}),
          };
          return next;
        });
        break;
      }
      case 'final':
        if (event.content.trim()) {
          appendAssistant(event.content);
        }
        setStreamingText('');
        setIsStreaming(false);
        break;
      case 'error':
        setErrorMsg(event.error);
        setIsStreaming(false);
        setStreamingText('');
        break;
      default:
        break;
    }
  };

  const send = async (): Promise<void> => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setErrorMsg(null);

    // Abort any previous in-flight stream before starting the new one.
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // Snapshot the history *before* appending the new user message — the
    // backend agent will receive the user message separately.
    const historyForAgent = [...messages].slice(-30);
    appendUser(text);
    setInput('');
    setStreamingText('');
    setToolTrace([]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await aiService.chat(
        {
          memberId,
          planId,
          history: historyForAgent,
          message: text,
          ...(user?.userId ? { userId: user.userId } : {}),
        },
        {
          onEvent: handleEvent,
          signal: controller.signal,
        },
      );
    } catch (err) {
      if (controller.signal.aborted) {
        // Caller-initiated abort (new message or widget close) — silent.
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setIsStreaming(false);
      setStreamingText('');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  // Closed: round floating button.
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg flex items-center gap-2 px-4 py-3 transition-all"
        aria-label="Open chat"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-sm font-medium">Ask AI</span>
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-[380px] h-[560px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      role="dialog"
      aria-label="AI chat assistant"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              Plan Assistant
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Ask about your Medicare plan
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => {
                clear();
                setStreamingText('');
                setToolTrace([]);
                setErrorMsg(null);
              }}
              className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              aria-label="Clear conversation"
              title="Clear conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            aria-label="Close chat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Transcript */}
      <div ref={transcriptRef} className="flex-1 overflow-y-auto p-3 bg-white dark:bg-gray-800">
        {messages.length === 0 && !streamingText && (
          <div className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8 px-4">
            <MessageCircle className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
            <p className="mb-2">Hi! I can answer questions about your Medicare plan.</p>
            <p className="text-xs">
              Try: "What does my plan cover?" or "Are my drugs covered?"
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <ChatMessageBubble key={i} message={m} />
        ))}

        {/* Live streaming bubble + tool trace for the current turn. */}
        {isStreaming && toolTrace.length > 0 && <ChatToolTrace entries={toolTrace} />}
        {!isStreaming && toolTrace.length > 0 && (
          <ChatToolTrace entries={toolTrace} collapsed />
        )}

        {(isStreaming || streamingText) && (
          <ChatMessageBubble
            message={{ role: 'assistant', content: streamingText || '…' }}
            isStreaming={isStreaming && !streamingText}
          />
        )}

        {errorMsg && (
          <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded px-2 py-2 mb-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1">{errorMsg}</div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'Waiting for reply…' : 'Type your question…'}
            disabled={isStreaming}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
          />
          <button
            onClick={() => void send()}
            disabled={isStreaming || !input.trim()}
            className="p-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-center">
          AI may be inaccurate — verify with official SBC documents.
        </p>
      </div>
    </div>
  );
}

/** Best-effort one-liner describing what the agent asked a tool to do. */
function describeToolInput(tool: string, input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const i = input as Record<string, unknown>;
  if (tool === 'search_plans') {
    const bits: string[] = [];
    if (typeof i.state === 'string') bits.push(i.state);
    if (typeof i.planType === 'string') bits.push(i.planType);
    if (typeof i.maxPremium === 'number') bits.push(`under $${i.maxPremium}`);
    return bits.length ? bits.join(' · ') : undefined;
  }
  if (tool === 'check_drug_coverage') {
    const planIds = Array.isArray(i.planIds) ? (i.planIds as unknown[]).length : 0;
    const drugIds = Array.isArray(i.drugIds) ? (i.drugIds as unknown[]).length : 0;
    if (planIds || drugIds) return `${planIds} plans · ${drugIds} drugs`;
  }
  if (tool === 'compare_plans') {
    const planIds = Array.isArray(i.planIds) ? (i.planIds as unknown[]).length : 0;
    if (planIds) return `${planIds} plans`;
  }
  return undefined;
}

/** Best-effort one-liner describing what a tool returned. */
function describeToolOutput(tool: string, output: unknown): string | undefined {
  if (!output) return undefined;
  if (typeof output === 'object') {
    const o = output as Record<string, unknown>;
    if ('error' in o && typeof o.error === 'string') return `error: ${o.error}`;
    if (tool === 'search_plans' && Array.isArray(o.results)) {
      return `${o.results.length} plans found`;
    }
    if (tool === 'check_drug_coverage' && Array.isArray(o.coverage)) {
      return `${o.coverage.length} rows`;
    }
  }
  return undefined;
}
