/**
 * Phase 4 design — Atlas chat pane. Block-flow message list + composer.
 *
 * Visual language: WHO labels ("AI ASSIST" / "AGENT") above each turn —
 * no avatars. User turns are orange-filled bubbles right-aligned; Atlas
 * turns are unboxed text lines (matches the editorial copilot style).
 * Tool calls render as a collapsible mono card. The call's AI activity
 * log is interleaved chronologically as tinted rows.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Square, ChevronDown, ChevronUp, Wrench, Check } from 'lucide-react';
import {
  useAtlas,
  type AtlasProposal,
  type AtlasNavigationSuggestion,
  type AtlasLeadSuggestion,
} from '../../context/AtlasContext';
import { useCallContext } from '../../context/CallContext';
import type { AiActivityEntry } from '../../types/call';
import { ApprovalCard } from './ApprovalCard';
import { NavigationCard } from './NavigationCard';
import { IdentifiedLeadCard } from './IdentifiedLeadCard';
import { CreateLeadCard } from './CreateLeadCard';

type AtlasMessage = ReturnType<typeof useAtlas>['messages'][number];
type ToolCall = NonNullable<AtlasMessage['toolCalls']>[number];

type ChatRow =
  | { kind: 'msg'; id: string; ts: number; data: AtlasMessage }
  | { kind: 'activity'; id: string; ts: number; data: AiActivityEntry }
  | { kind: 'proposal'; id: string; ts: number; data: AtlasProposal }
  | { kind: 'navigation'; id: string; ts: number; data: AtlasNavigationSuggestion }
  | { kind: 'lead'; id: string; ts: number; data: AtlasLeadSuggestion };

export function ChatPane(): React.JSX.Element {
  const {
    messages,
    proposals,
    navigationSuggestions,
    leadSuggestions,
    mode,
    send,
    abort,
    isStreaming,
  } = useAtlas();
  const { state: callState } = useCallContext();
  const [input, setInput] = useState<string>('');
  const listRef = useRef<HTMLDivElement | null>(null);

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
    // Phase 4 — interleave Atlas write-action proposals into the chat
    // stream chronologically. Old deck-below-composer is gone; approvals
    // now appear as inline messages from Atlas (with Approve / Reject
    // buttons in Silent/Assist mode, success line only in Auto Pilot).
    const proposalRows: ChatRow[] = proposals.map((p) => ({
      kind: 'proposal',
      id: p.proposalId,
      ts: p.ts,
      data: p,
    }));
    // Navigation suggestions follow the same inline pattern. Only surfaced
    // in Assist mode — Silent suppresses them entirely, Auto Pilot routes
    // immediately via the nav listener (no card needed).
    const navigationRows: ChatRow[] =
      mode === 'assist'
        ? navigationSuggestions.map((s) => ({
            kind: 'navigation',
            id: s.id,
            ts: s.ts,
            data: s,
          }))
        : [];
    // Phase 4 outbound-dial — IdentifiedLeadCard / CreateLeadCard cards
    // surfaced when the agent dials a number. Always shown regardless of
    // Atlas mode (this is plain UX, not an agentic suggestion).
    const leadRows: ChatRow[] = leadSuggestions.map((s) => ({
      kind: 'lead',
      id: s.id,
      ts: s.ts,
      data: s,
    }));
    return [
      ...msgRows,
      ...activityRows,
      ...proposalRows,
      ...navigationRows,
      ...leadRows,
    ].sort((a, b) => a.ts - b.ts);
  }, [
    messages,
    proposals,
    navigationSuggestions,
    leadSuggestions,
    mode,
    callState.aiActivityLog,
    callState.isCallActive,
  ]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length, isStreaming]);

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput('');
    void send(text);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div
        ref={listRef}
        className="atlas-chat-scroll flex-1 overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
        aria-label="Atlas conversation"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--color-atlas-surface-4) transparent' }}
      >
        {rows.length === 0 && !isStreaming && (
          <p
            className="text-[12.5px] italic text-center mt-6"
            style={{ color: 'var(--color-atlas-fg-subtle)' }}
          >
            Ask Atlas about your pipeline, plans, drugs, or any lead.
          </p>
        )}
        {rows.map((row) => {
          if (row.kind === 'msg') {
            return <MessageRow key={row.id} message={row.data} />;
          }
          if (row.kind === 'activity') {
            return <ActivityRow key={row.id} entry={row.data} />;
          }
          if (row.kind === 'proposal') {
            return <ApprovalCard key={row.id} proposal={row.data} />;
          }
          if (row.kind === 'navigation') {
            return <NavigationCard key={row.id} suggestion={row.data} />;
          }
          // lead — discriminated by row.data.kind
          if (row.data.kind === 'identified') {
            return <IdentifiedLeadCard key={row.id} suggestion={row.data} />;
          }
          return <CreateLeadCard key={row.id} suggestion={row.data} />;
        })}
        {isStreaming && <ThinkingDots />}
      </div>

      <Composer
        input={input}
        setInput={setInput}
        onSubmit={onSubmit}
        onAbort={abort}
        isStreaming={isStreaming}
      />
    </div>
  );
}

const WHO_LABEL: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 6,
  display: 'block',
};

function MessageRow({ message }: { message: AtlasMessage }): React.JSX.Element {
  if (message.role === 'user') return <UserBubble text={message.content} />;
  return <AiMessage message={message} />;
}

function UserBubble({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="msg-in flex flex-col items-end">
      <span style={{ ...WHO_LABEL, color: 'var(--color-atlas-fg-subtle)', marginRight: 2 }}>
        Agent
      </span>
      <div
        style={{
          maxWidth: '82%',
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 1.45,
          padding: '10px 15px',
          borderRadius: '14px 14px 4px 14px',
          background: 'var(--color-exl-orange)',
          color: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </div>
    </div>
  );
}

function AiMessage({ message }: { message: AtlasMessage }): React.JSX.Element {
  return (
    <div className="msg-in flex flex-col items-start">
      <span style={{ ...WHO_LABEL, color: 'var(--color-exl-orange)' }}>AI Assist</span>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="w-full mb-2 flex flex-col gap-1.5">
          {message.toolCalls.map((tc, i) => (
            <ToolTrace key={i} call={tc} />
          ))}
        </div>
      )}
      {message.content && (
        <div
          className="w-full"
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: 'var(--color-atlas-fg)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message.content}
        </div>
      )}
    </div>
  );
}

function ThinkingDots(): React.JSX.Element {
  return (
    <div className="msg-in flex flex-col items-start">
      <span style={{ ...WHO_LABEL, color: 'var(--color-exl-orange)' }}>AI Assist</span>
      <div
        className="inline-flex gap-1.5"
        style={{
          background: 'var(--color-atlas-surface-3)',
          padding: '11px 15px',
          borderRadius: '14px 14px 14px 4px',
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--color-atlas-fg-muted)',
              animation: 'atlas-blink 1.4s var(--ease-soft) infinite both',
              animationDelay: `${i * 0.2}s`,
              display: 'inline-block',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ToolTrace({ call }: { call: ToolCall }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const latency = call.latencyMs !== undefined ? `${(call.latencyMs / 1000).toFixed(1)}s` : null;
  return (
    <div
      className="flex-shrink-0"
      style={{
        border: '1px solid var(--color-atlas-border)',
        borderRadius: 11,
        background: 'var(--color-atlas-surface-2)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ background: 'transparent', cursor: 'pointer' }}
      >
        <Wrench className="w-3.5 h-3.5" style={{ color: 'var(--color-atlas-fg-muted)' }} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--color-atlas-fg)',
          }}
        >
          {call.tool}
        </span>
        <span
          className="ml-auto flex items-center gap-1"
          style={{ fontSize: 11, color: 'var(--color-atlas-success, #6ad48f)' }}
        >
          <Check className="w-3 h-3" />
          {latency ?? 'ok'}
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--color-atlas-fg-subtle)' }} />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--color-atlas-fg-subtle)' }} />
        )}
      </button>
      {open && (call.input !== undefined || call.output !== undefined) && (
        <div
          style={{
            borderTop: '1px solid var(--color-atlas-border)',
            padding: '10px 12px',
            background: 'var(--color-atlas-bg)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            lineHeight: 1.7,
            color: 'var(--color-atlas-fg-muted)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {call.input !== undefined && (
            <div>
              <span style={{ color: 'var(--color-atlas-fg-subtle)' }}>input </span>
              {typeof call.input === 'string' ? call.input : JSON.stringify(call.input)}
            </div>
          )}
          {call.output !== undefined && (
            <div style={{ color: 'var(--color-atlas-fg-subtle)', marginTop: 4 }}>
              {typeof call.output === 'string'
                ? call.output.slice(0, 200)
                : JSON.stringify(call.output).slice(0, 200)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ACTIVITY_TONE: Record<
  AiActivityEntry['kind'],
  { bg: string; border: string; dot: string; label: string }
> = {
  compliance: { bg: 'rgba(255,107,107,0.10)', border: 'rgba(255,107,107,0.35)', dot: '#ff6b6b', label: 'Compliance' },
  fill: { bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.35)', dot: '#eab308', label: 'Auto-fill' },
  drug: { bg: 'rgba(106,212,143,0.10)', border: 'rgba(106,212,143,0.30)', dot: '#6ad48f', label: 'Drug' },
  pharmacy: { bg: 'rgba(79,147,247,0.10)', border: 'rgba(79,147,247,0.30)', dot: '#4f93f7', label: 'Pharmacy' },
  provider: { bg: 'rgba(79,147,247,0.10)', border: 'rgba(79,147,247,0.30)', dot: '#4f93f7', label: 'Provider' },
  note: { bg: 'rgba(255,255,255,0.04)', border: 'var(--color-atlas-border)', dot: 'var(--color-atlas-fg-muted)', label: 'Note' },
  info: { bg: 'rgba(149,128,255,0.10)', border: 'rgba(149,128,255,0.30)', dot: '#9580ff', label: 'Info' },
};

function ActivityRow({ entry }: { entry: AiActivityEntry }): React.JSX.Element {
  const tone = ACTIVITY_TONE[entry.kind] ?? ACTIVITY_TONE.info;
  return (
    <div
      className="msg-in flex items-start gap-2 px-2.5 py-1.5 rounded-md"
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        fontSize: 11.5,
        color: 'var(--color-atlas-fg)',
      }}
    >
      <span
        className="shrink-0"
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: tone.dot,
          marginTop: 5,
        }}
      />
      <div className="min-w-0 flex-1">
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-atlas-fg-subtle)',
            marginRight: 8,
          }}
        >
          {tone.label}
        </span>
        <span style={{ color: 'var(--color-atlas-fg)' }}>{entry.text}</span>
      </div>
    </div>
  );
}

function Composer({
  input,
  setInput,
  onSubmit,
  onAbort,
  isStreaming,
}: {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onAbort: () => void;
  isStreaming: boolean;
}): React.JSX.Element {
  return (
    <form
      onSubmit={onSubmit}
      className="px-3 py-2.5 flex items-end gap-2 border-t"
      style={{
        borderColor: 'var(--color-atlas-border)',
        background: 'var(--color-atlas-surface-2)',
      }}
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
        className="flex-1 resize-none rounded-lg px-3 py-2 text-sm focus:outline-none disabled:opacity-60"
        style={{
          background: 'var(--color-atlas-surface-3)',
          color: 'var(--color-atlas-fg)',
          border: '1px solid var(--color-atlas-border)',
          fontFamily: 'inherit',
          minHeight: 38,
          maxHeight: 120,
        }}
      />
      {isStreaming ? (
        <button
          type="button"
          onClick={onAbort}
          className="p-2 rounded-lg text-white transition-colors"
          style={{ background: '#dc2626' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#b91c1c')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#dc2626')}
          aria-label="Stop"
          title="Stop Atlas"
        >
          <Square className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!input.trim()}
          className="p-2 rounded-lg text-white transition-colors disabled:cursor-not-allowed"
          style={{
            background: input.trim() ? 'var(--color-exl-orange)' : 'var(--color-atlas-surface-3)',
            color: input.trim() ? '#fff' : 'var(--color-atlas-fg-subtle)',
          }}
          onMouseEnter={(e) => {
            if (input.trim()) e.currentTarget.style.background = 'var(--color-exl-orange-bright)';
          }}
          onMouseLeave={(e) => {
            if (input.trim()) e.currentTarget.style.background = 'var(--color-exl-orange)';
          }}
          aria-label="Send"
          title="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      )}
    </form>
  );
}
