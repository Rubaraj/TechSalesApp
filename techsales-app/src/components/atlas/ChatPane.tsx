/**
 * Phase 4 (M4) — Atlas chat pane. Scrollable message list + input at bottom.
 * Auto-scrolls to newest message on every update.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Square, ChevronRight, Sparkles } from 'lucide-react';
import { useAtlas } from '../../context/AtlasContext';
import { useCallContext } from '../../context/CallContext';
import type { AiActivityEntry } from '../../types/call';

type ChatRow =
  | { kind: 'msg'; id: string; ts: number; data: ReturnType<typeof useAtlas>['messages'][number] }
  | { kind: 'activity'; id: string; ts: number; data: AiActivityEntry };

export function ChatPane(): React.JSX.Element {
  const { messages, send, abort, isStreaming } = useAtlas();
  const { state: callState } = useCallContext();
  const [input, setInput] = useState<string>('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // Phase 4 — merge chat messages with the call's AI activity log so Atlas
  // surfaces both in a single chronological stream. This replaces the
  // separate AiActivityFeed that used to dock inside CallPanel.
  const rows = useMemo<ChatRow[]>(() => {
    const msgRows: ChatRow[] = messages.map((m) => ({
      kind: 'msg',
      id: m.id,
      ts: m.ts,
      data: m,
    }));
    const activityRows: ChatRow[] = callState.isCallActive
      ? callState.aiActivityLog.map((a) => ({
          kind: 'activity',
          id: a.id,
          ts: a.timestamp,
          data: a,
        }))
      : [];
    return [...msgRows, ...activityRows].sort((a, b) => a.ts - b.ts);
  }, [messages, callState.aiActivityLog, callState.isCallActive]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length]);

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input;
    setInput('');
    void send(text);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
        role="log"
        aria-live="polite"
        aria-label="Atlas conversation"
      >
        {rows.length === 0 && (
          <p className="text-xs italic text-gray-400 dark:text-gray-500 text-center mt-4">
            Ask Atlas about your pipeline, plans, drugs, or any lead.
          </p>
        )}
        {rows.map((row) =>
          row.kind === 'msg' ? (
            <MessageBubble key={row.id} message={row.data} />
          ) : (
            <ActivityRow key={row.id} entry={row.data} />
          ),
        )}
        {isStreaming && (
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse [animation-delay:200ms]" />
            <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse [animation-delay:400ms]" />
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="border-t border-gray-200 dark:border-gray-700 p-3 flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e as unknown as React.FormEvent);
            }
          }}
          placeholder="Ask Atlas anything…"
          disabled={isStreaming}
          rows={1}
          className="flex-1 resize-none rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={abort}
            className="p-2 rounded-md bg-red-600 hover:bg-red-700 text-white"
            aria-label="Stop"
            title="Stop Atlas"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="p-2 rounded-md bg-primary-600 hover:bg-primary-700 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
            aria-label="Send"
            title="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </form>
    </div>
  );
}

/**
 * Phase 4 — Renders a single AI-activity-log entry inline in the Atlas
 * chat stream. These are the events Phase 3a/3b/3b.1 used to surface in
 * a separate feed; Atlas now displays them as compact system rows
 * interleaved with chat by timestamp.
 */
function ActivityRow({ entry }: { entry: AiActivityEntry }): React.JSX.Element {
  const tone = TONE_BY_KIND[entry.kind] ?? 'bg-gray-50 dark:bg-gray-800/40 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700';
  return (
    <div className={`flex items-start gap-2 px-2 py-1.5 rounded-md border ${tone} text-[11px]`}>
      <Sparkles className="w-3 h-3 shrink-0 mt-0.5 opacity-70" />
      <span className="flex-1 min-w-0 truncate">{entry.text}</span>
    </div>
  );
}

const TONE_BY_KIND: Record<AiActivityEntry['kind'], string> = {
  compliance: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  fill: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800',
  drug: 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800',
  pharmacy: 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  provider: 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  note: 'bg-gray-50 dark:bg-gray-800/40 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
  info: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
};

function MessageBubble({
  message,
}: {
  message: ReturnType<typeof useAtlas>['messages'][number];
}): React.JSX.Element {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
          isUser
            ? 'bg-primary-600 text-white rounded-br-sm'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm'
        }`}
      >
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallTrace toolCalls={message.toolCalls} />
        )}
        {message.content || (isUser ? null : '…')}
      </div>
    </div>
  );
}

function ToolCallTrace({
  toolCalls,
}: {
  toolCalls: NonNullable<ReturnType<typeof useAtlas>['messages'][number]['toolCalls']>;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <details className="mb-1.5 text-[11px]" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer flex items-center gap-1 text-gray-600 dark:text-gray-300">
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        🔧 {toolCalls.length} tool {toolCalls.length === 1 ? 'call' : 'calls'}
      </summary>
      <ul className="mt-1 space-y-1 pl-3">
        {toolCalls.map((tc, i) => (
          <li
            key={i}
            className="text-[11px] font-mono text-gray-500 dark:text-gray-400 break-all"
          >
            {tc.tool}
            {tc.latencyMs !== undefined && <span className="ml-1 text-gray-400">({tc.latencyMs}ms)</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
