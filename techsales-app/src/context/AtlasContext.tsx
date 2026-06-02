/**
 * Phase 4 (M4) — Atlas Chat context. Holds the conversation, streaming state,
 * pending approval cards, and exposes `send()` / `abort()` / `approve()`.
 *
 * Vertical-slice scope: idle mode only (no call integration yet — the call
 * panel will fold in once the BE call hooks land). Mode is wired to a simple
 * state value; per-call override is deferred.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { atlasService, type AtlasStreamEvent } from '../services/atlasService';
import { useAuth } from './AuthContext';

export type AtlasMode = 'silent' | 'assist' | 'auto';

export interface AtlasMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Optional inline tool trace for the most recent assistant turn. */
  toolCalls?: Array<{ tool: string; input: unknown; output?: unknown; latencyMs?: number }>;
  ts: number;
}

export interface AtlasProposal {
  proposalId: string;
  kind: 'email' | 'status' | 'drug';
  preview: unknown;
  /** State of the approval UI for the card; updates after Approve / Reject click. */
  status: 'pending' | 'approved' | 'rejected' | 'error';
  result?: unknown;
}

export interface AtlasNavigationSuggestion {
  id: string;
  route: string;
  reason: string;
  ts: number;
}

export interface AtlasContextValue {
  messages: AtlasMessage[];
  isStreaming: boolean;
  proposals: AtlasProposal[];
  navigationSuggestions: AtlasNavigationSuggestion[];
  mode: AtlasMode;
  setMode: (m: AtlasMode) => void;
  send: (text: string) => Promise<void>;
  abort: () => void;
  clear: () => void;
  approve: (proposalId: string) => Promise<void>;
  reject: (proposalId: string) => Promise<void>;
  consumeNavigationSuggestion: (id: string) => AtlasNavigationSuggestion | null;
  /** Phase 4 — Session control. `resumedFromPriorSession` is true when the
   *  current message list was hydrated from MongoDB on mount (i.e. the agent
   *  has prior history). `startNewSession` wipes both server + local state
   *  and dismisses the "continuing from" banner. `dismissResumeBanner` keeps
   *  the prior history but hides the banner (user acknowledged). */
  resumedFromPriorSession: boolean;
  startNewSession: () => Promise<void>;
  dismissResumeBanner: () => void;
}

const AtlasContext = createContext<AtlasContextValue | null>(null);

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const MODE_STORAGE_KEY = 'techsales:atlas-mode';

export function AtlasProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { user } = useAuth();
  const location = useLocation();
  const params = useParams<{ id?: string }>();
  const userId = user?.userId ?? null;

  const [messages, setMessages] = useState<AtlasMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [proposals, setProposals] = useState<AtlasProposal[]>([]);
  const [navigationSuggestions, setNavigationSuggestions] = useState<
    AtlasNavigationSuggestion[]
  >([]);
  const [resumedFromPriorSession, setResumedFromPriorSession] = useState(false);
  const [mode, setModeState] = useState<AtlasMode>(() => {
    if (typeof window === 'undefined') return 'assist';
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
    return stored === 'silent' || stored === 'auto' ? stored : 'assist';
  });

  const abortRef = useRef<AbortController | null>(null);
  const hydratedForUserRef = useRef<string | null>(null);

  const setMode = useCallback((m: AtlasMode): void => {
    setModeState(m);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, m);
    } catch {
      // private mode etc — ignore
    }
  }, []);

  // Hydrate session on userId change.
  useEffect(() => {
    if (!userId) {
      setMessages([]);
      setResumedFromPriorSession(false);
      hydratedForUserRef.current = null;
      return;
    }
    if (hydratedForUserRef.current === userId) return;
    hydratedForUserRef.current = userId;
    void atlasService.getSession(userId).then((session) => {
      const hydrated: AtlasMessage[] = session.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: newId(),
          role: m.role as 'user' | 'assistant',
          content: m.content,
          ts: m.ts,
        }));
      setMessages(hydrated);
      // Surface the "continuing from prior session" banner only when there's
      // actual prior history. New sign-ins / first-time users skip straight
      // to the greeting card.
      setResumedFromPriorSession(hydrated.length > 0);
    });
  }, [userId]);

  // Resolve current leadId from the URL for context injection.
  const leadId = useMemo<string | undefined>(() => {
    if (location.pathname.startsWith('/leads/') && params.id && params.id !== 'new') {
      return params.id;
    }
    return undefined;
  }, [location.pathname, params.id]);

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed || !userId || isStreaming) return;

      const userMsg: AtlasMessage = {
        id: newId(),
        role: 'user',
        content: trimmed,
        ts: Date.now(),
      };
      const assistantMsg: AtlasMessage = {
        id: newId(),
        role: 'assistant',
        content: '',
        toolCalls: [],
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const onEvent = (ev: AtlasStreamEvent): void => {
        if (ev.type === 'token') {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + ev.content };
            }
            return next;
          });
          return;
        }
        if (ev.type === 'tool_start') {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                toolCalls: [...(last.toolCalls ?? []), { tool: ev.tool, input: ev.input }],
              };
            }
            return next;
          });
          return;
        }
        if (ev.type === 'tool_end') {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant' && last.toolCalls) {
              const idx = [...last.toolCalls].reverse().findIndex((tc) => tc.tool === ev.tool && tc.output === undefined);
              if (idx !== -1) {
                const realIdx = last.toolCalls.length - 1 - idx;
                const updated = [...last.toolCalls];
                updated[realIdx] = { ...updated[realIdx], output: ev.output, latencyMs: ev.latencyMs };
                next[next.length - 1] = { ...last, toolCalls: updated };
              }
            }
            return next;
          });
          return;
        }
        if (ev.type === 'proposal_created') {
          setProposals((prev) => [
            ...prev,
            { proposalId: ev.proposalId, kind: ev.kind, preview: ev.preview, status: 'pending' },
          ]);
          return;
        }
        if (ev.type === 'navigate') {
          setNavigationSuggestions((prev) => [
            ...prev,
            { id: newId(), route: ev.route, reason: ev.reason, ts: Date.now() },
          ]);
          return;
        }
        if (ev.type === 'error') {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                content: last.content + `\n\n⚠️ ${ev.error}`,
              };
            }
            return next;
          });
        }
      };

      try {
        await atlasService.chat(
          {
            userId,
            message: trimmed,
            context: {
              route: location.pathname,
              ...(leadId ? { leadId } : {}),
              mode,
            },
          },
          { onEvent, signal: controller.signal },
        );
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          // user aborted; nothing else to do
        } else {
          // eslint-disable-next-line no-console
          console.error('Atlas chat failed:', err);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [userId, isStreaming, location.pathname, leadId, mode],
  );

  const abort = useCallback((): void => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback((): void => {
    setMessages([]);
    setProposals([]);
    setNavigationSuggestions([]);
    setResumedFromPriorSession(false);
  }, []);

  /**
   * Phase 4 — Start a fresh session: wipes BOTH the server-persisted history
   * AND local state, then dismisses the resume banner. The greeting card
   * re-appears on the next render because messages.length === 0.
   */
  const startNewSession = useCallback(async (): Promise<void> => {
    if (!userId) return;
    // Optimistically clear local state so the UI snaps to the empty-greeting
    // view; if the DELETE fails we surface a soft warning in console but
    // don't roll back (the server-side TTL will eventually clean the row).
    setMessages([]);
    setProposals([]);
    setNavigationSuggestions([]);
    setResumedFromPriorSession(false);
    try {
      await atlasService.clearSession(userId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Atlas: server-side session clear failed (local state already wiped)', err);
    }
  }, [userId]);

  const dismissResumeBanner = useCallback((): void => {
    setResumedFromPriorSession(false);
  }, []);

  const approve = useCallback(
    async (proposalId: string): Promise<void> => {
      if (!userId) return;
      setProposals((prev) =>
        prev.map((p) => (p.proposalId === proposalId ? { ...p, status: 'pending' } : p)),
      );
      const res = await atlasService.approveProposal(proposalId, userId, 'approve');
      setProposals((prev) =>
        prev.map((p) =>
          p.proposalId === proposalId
            ? { ...p, status: res.success ? 'approved' : 'error', result: res.result }
            : p,
        ),
      );
    },
    [userId],
  );

  const reject = useCallback(
    async (proposalId: string): Promise<void> => {
      if (!userId) return;
      await atlasService.approveProposal(proposalId, userId, 'reject');
      setProposals((prev) =>
        prev.map((p) => (p.proposalId === proposalId ? { ...p, status: 'rejected' } : p)),
      );
    },
    [userId],
  );

  const consumeNavigationSuggestion = useCallback(
    (id: string): AtlasNavigationSuggestion | null => {
      const found = navigationSuggestions.find((s) => s.id === id);
      if (!found) return null;
      setNavigationSuggestions((prev) => prev.filter((s) => s.id !== id));
      return found;
    },
    [navigationSuggestions],
  );

  const value = useMemo<AtlasContextValue>(
    () => ({
      messages,
      isStreaming,
      proposals,
      navigationSuggestions,
      mode,
      setMode,
      send,
      abort,
      clear,
      approve,
      reject,
      consumeNavigationSuggestion,
      resumedFromPriorSession,
      startNewSession,
      dismissResumeBanner,
    }),
    [
      messages,
      isStreaming,
      proposals,
      navigationSuggestions,
      mode,
      setMode,
      send,
      abort,
      clear,
      approve,
      reject,
      consumeNavigationSuggestion,
      resumedFromPriorSession,
      startNewSession,
      dismissResumeBanner,
    ],
  );

  return <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>;
}

export function useAtlas(): AtlasContextValue {
  const ctx = useContext(AtlasContext);
  if (!ctx) {
    throw new Error('useAtlas must be used inside <AtlasProvider>');
  }
  return ctx;
}
