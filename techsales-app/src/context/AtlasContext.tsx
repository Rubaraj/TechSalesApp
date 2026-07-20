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
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { atlasService, type AtlasStreamEvent } from '../services/atlasService';
import { useAuth } from './AuthContext';
import { useCallContext } from './CallContext';
import type { LeadPhoneLookup } from '../services/leadService';

export type AtlasMode = 'assist' | 'auto';

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
  kind: 'email' | 'status' | 'drug' | 'lead_update' | 'note';
  preview: unknown;
  /** State of the approval UI for the card; updates after Approve / Reject click. */
  status: 'pending' | 'approved' | 'rejected' | 'error';
  result?: unknown;
  /** Phase 4 — proposals are now interleaved into the chat stream by
   *  timestamp (replacing the old footer deck), so each one needs a `ts`. */
  ts: number;
  /** True when the proposal was auto-approved by Auto Pilot mode — the
   *  ApprovalCard renders the success line directly instead of flashing
   *  the Approve/Reject buttons in between. */
  autoApproved?: boolean;
}

export interface AtlasNavigationSuggestion {
  id: string;
  route: string;
  reason: string;
  ts: number;
}

/**
 * Phase 4 outbound-dial — Atlas surfaces a card in chat when the agent dials
 * a number. `kind: 'identified'` is shown when the phone matches a known
 * lead; `kind: 'create'` is shown when no lead matches and the agent might
 * want to create one. Both render inline in ChatPane via the existing
 * ChatRow union; both auto-clear when the call ends.
 */
export type AtlasLeadSuggestion =
  | { id: string; kind: 'identified'; lead: LeadPhoneLookup; phone: string; ts: number }
  | { id: string; kind: 'create'; phone: string; ts: number };

/**
 * Rich-chat — a tool result rendered as a purpose-built card in the chat
 * stream (comparison grid, lead list, pacing bars, …). Emitted by the
 * backend's `display_card` SSE event; also rehydrated from persisted
 * session messages.
 */
export interface AtlasDisplayCard {
  id: string;
  card: string;
  tool: string;
  data: unknown;
  ts: number;
}

export interface AtlasContextValue {
  messages: AtlasMessage[];
  isStreaming: boolean;
  proposals: AtlasProposal[];
  navigationSuggestions: AtlasNavigationSuggestion[];
  /** Rich-chat — display cards interleaved into the chat stream by ts. */
  cards: AtlasDisplayCard[];
  mode: AtlasMode;
  setMode: (m: AtlasMode) => void;
  send: (text: string) => Promise<void>;
  abort: () => void;
  clear: () => void;
  approve: (proposalId: string) => Promise<void>;
  reject: (proposalId: string) => Promise<void>;
  consumeNavigationSuggestion: (id: string) => AtlasNavigationSuggestion | null;
  /**
   * Phase 4 outbound-dial — lead-match / create-lead suggestions surfaced
   * inline in Atlas chat when the agent dials a number. Populated by the
   * `useOutboundLeadIdentification` hook, consumed by IdentifiedLeadCard /
   * CreateLeadCard, and bulk-cleared on call end.
   */
  leadSuggestions: AtlasLeadSuggestion[];
  addLeadSuggestion: (s: AtlasLeadSuggestion) => void;
  consumeLeadSuggestion: (id: string) => AtlasLeadSuggestion | null;
  clearLeadSuggestions: () => void;
  /** Phase 4 — Session control. `resumedFromPriorSession` is true when the
   *  current message list was hydrated from MongoDB on mount (i.e. the agent
   *  has prior history). `startNewSession` wipes both server + local state
   *  and dismisses the "continuing from" banner. `dismissResumeBanner` keeps
   *  the prior history but hides the banner (user acknowledged). */
  resumedFromPriorSession: boolean;
  startNewSession: () => Promise<void>;
  dismissResumeBanner: () => void;
  /**
   * Phase 4 (dock) — Atlas panel chrome state. Lifted into context so the
   * Layout can reflow main content when the panel opens (push-not-overlay)
   * and the Header's dialer button can open the panel imperatively.
   * `isPanelOpen=true` ⇒ panel docks at the right edge and Layout pads main
   * content by `panelWidth`. `false` ⇒ panel collapses to the bottom-right
   * bubble and main content reflows to full width.
   */
  isPanelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  panelWidth: number;
  setPanelWidth: (w: number) => void;
}

const AtlasContext = createContext<AtlasContextValue | null>(null);

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const MODE_STORAGE_KEY = 'techsales:atlas-mode';
const PANEL_OPEN_STORAGE_KEY = 'techsales:atlas-panel-open';
const PANEL_WIDTH_STORAGE_KEY = 'techsales:atlas-panel-width';
const PANEL_MIN_WIDTH = 360;
const PANEL_MAX_WIDTH = 600;
const PANEL_DEFAULT_WIDTH = 440;

export function AtlasProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const userId = user?.userId ?? null;
  // Live-call context — AtlasProvider nests inside CallProvider, so the
  // active callSid is available for the backend to attach recent transcript.
  const { state: callState } = useCallContext();
  const activeCallSid = callState.isCallActive ? callState.callSid : null;

  const [messages, setMessages] = useState<AtlasMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [proposals, setProposals] = useState<AtlasProposal[]>([]);
  const [navigationSuggestions, setNavigationSuggestions] = useState<
    AtlasNavigationSuggestion[]
  >([]);
  const [leadSuggestions, setLeadSuggestions] = useState<AtlasLeadSuggestion[]>([]);
  const [cards, setCards] = useState<AtlasDisplayCard[]>([]);
  const [resumedFromPriorSession, setResumedFromPriorSession] = useState(false);
  const [mode, setModeState] = useState<AtlasMode>(() => {
    if (typeof window === 'undefined') return 'assist';
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
    // Legacy 'silent' (pre-merge) maps to 'assist'.
    return stored === 'auto' ? stored : 'assist';
  });

  // Panel dock state — persisted so the panel re-opens at the same width
  // on next sign-in. Default: open at 440px. We hydrate synchronously from
  // localStorage so the first Layout render is already correct (no flash
  // of full-width content collapsing to docked).
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem(PANEL_OPEN_STORAGE_KEY);
    if (stored === null) return true;
    return stored === '1';
  });
  const [panelWidth, setPanelWidthState] = useState<number>(() => {
    if (typeof window === 'undefined') return PANEL_DEFAULT_WIDTH;
    const stored = window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
    const n = stored ? Number.parseInt(stored, 10) : NaN;
    return Number.isFinite(n)
      ? Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, n))
      : PANEL_DEFAULT_WIDTH;
  });

  const abortRef = useRef<AbortController | null>(null);
  const hydratedForUserRef = useRef<string | null>(null);
  // `mode` snapshot for use inside SSE event handlers — those closures
  // are created at request time and won't re-render with the mode state.
  const modeRef = useRef<AtlasMode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  // `navigate` snapshot — react-router's navigate fn is stable enough but
  // we route through a ref so the SSE closure always sees the latest one
  // (and so Auto Pilot navigation works even if React Router updates the
  // function reference mid-stream).
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const setMode = useCallback((m: AtlasMode): void => {
    setModeState(m);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, m);
    } catch {
      // private mode etc — ignore
    }
  }, []);

  const setPanelOpen = useCallback((open: boolean): void => {
    setIsPanelOpen(open);
    try {
      window.localStorage.setItem(PANEL_OPEN_STORAGE_KEY, open ? '1' : '0');
    } catch {
      // ignore
    }
  }, []);

  const setPanelWidth = useCallback((w: number): void => {
    const clamped = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, w));
    setPanelWidthState(clamped);
    try {
      window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      // ignore
    }
  }, []);

  // Hydrate session on userId change.
  useEffect(() => {
    if (!userId) {
      setMessages([]);
      setCards([]);
      setResumedFromPriorSession(false);
      hydratedForUserRef.current = null;
      return;
    }
    if (hydratedForUserRef.current === userId) return;
    hydratedForUserRef.current = userId;
    void atlasService.getSession(userId).then((session) => {
      const hydrated: AtlasMessage[] = [];
      const hydratedCards: AtlasDisplayCard[] = [];
      for (const m of session.messages) {
        if (m.role !== 'user' && m.role !== 'assistant') continue;
        hydrated.push({
          id: newId(),
          role: m.role,
          content: m.content,
          ts: m.ts,
        });
        // Rich-chat — restore cards persisted on the assistant turn. Live
        // cards arrive mid-stream (before the message's persist-time ts), so
        // derive ts from the parent message + epsilon to keep the same
        // message-then-card order after reload.
        if (m.cards) {
          m.cards.forEach((c, i) => {
            hydratedCards.push({
              id: newId(),
              card: c.card,
              tool: c.tool,
              data: c.data,
              ts: m.ts + 1 + i,
            });
          });
        }
      }
      setMessages(hydrated);
      setCards(hydratedCards);
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
          const ts = Date.now();
          const isAuto = modeRef.current === 'auto';
          // In Auto Pilot, optimistically render the success state so the
          // chat stream skips straight to "approved & sent" without
          // flashing the Approve/Reject buttons. We still fire the
          // server-side approve below so the audit row is recorded.
          const initialStatus: AtlasProposal['status'] = isAuto ? 'approved' : 'pending';
          setProposals((prev) => [
            ...prev,
            {
              proposalId: ev.proposalId,
              kind: ev.kind,
              preview: ev.preview,
              status: initialStatus,
              ts,
              autoApproved: isAuto,
            },
          ]);
          if (isAuto && userId) {
            void atlasService
              .approveProposal(ev.proposalId, userId, 'approve')
              .then((res) => {
                if (!res.success) {
                  setProposals((prev) =>
                    prev.map((p) =>
                      p.proposalId === ev.proposalId
                        ? { ...p, status: 'error', result: res.result }
                        : p,
                    ),
                  );
                }
              })
              .catch(() => {
                setProposals((prev) =>
                  prev.map((p) =>
                    p.proposalId === ev.proposalId ? { ...p, status: 'error' } : p,
                  ),
                );
              });
          }
          return;
        }
        if (ev.type === 'navigate') {
          // Mode-gated dispatch:
          //   - Assist      → add to suggestions; ChatPane renders inline
          //                   NavigationCard with Open / Dismiss.
          //   - Auto Pilot  → navigate immediately. No card; the tool
          //                   trace ("navigateTo  /leads") already shows
          //                   in the chat as the explanation.
          const m = modeRef.current;
          if (m === 'auto') {
            try {
              navigateRef.current(ev.route);
            } catch {
              // ignore navigation errors (invalid route etc.)
            }
            return;
          }
          setNavigationSuggestions((prev) => [
            ...prev,
            { id: newId(), route: ev.route, reason: ev.reason, ts: Date.now() },
          ]);
          return;
        }
        if (ev.type === 'display_card') {
          // Rich-chat — tool result rendered as a purpose-built card,
          // interleaved into the stream at receipt time.
          setCards((prev) => [
            ...prev,
            {
              id: newId(),
              card: ev.card,
              tool: ev.tool,
              data: ev.data,
              ts: Date.now(),
            },
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
              ...(activeCallSid ? { callSid: activeCallSid } : {}),
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
    [userId, isStreaming, location.pathname, leadId, activeCallSid, mode],
  );

  const abort = useCallback((): void => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback((): void => {
    setMessages([]);
    setProposals([]);
    setNavigationSuggestions([]);
    setCards([]);
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
    setCards([]);
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

  const addLeadSuggestion = useCallback((s: AtlasLeadSuggestion): void => {
    setLeadSuggestions((prev) => [...prev, s]);
  }, []);
  const consumeLeadSuggestion = useCallback(
    (id: string): AtlasLeadSuggestion | null => {
      const found = leadSuggestions.find((s) => s.id === id);
      if (!found) return null;
      setLeadSuggestions((prev) => prev.filter((s) => s.id !== id));
      return found;
    },
    [leadSuggestions],
  );
  const clearLeadSuggestions = useCallback((): void => {
    setLeadSuggestions([]);
  }, []);

  const value = useMemo<AtlasContextValue>(
    () => ({
      messages,
      isStreaming,
      proposals,
      navigationSuggestions,
      cards,
      mode,
      setMode,
      send,
      abort,
      clear,
      approve,
      reject,
      consumeNavigationSuggestion,
      leadSuggestions,
      addLeadSuggestion,
      consumeLeadSuggestion,
      clearLeadSuggestions,
      resumedFromPriorSession,
      startNewSession,
      dismissResumeBanner,
      isPanelOpen,
      setPanelOpen,
      panelWidth,
      setPanelWidth,
    }),
    [
      messages,
      isStreaming,
      proposals,
      navigationSuggestions,
      cards,
      leadSuggestions,
      mode,
      setMode,
      send,
      abort,
      clear,
      approve,
      reject,
      consumeNavigationSuggestion,
      addLeadSuggestion,
      consumeLeadSuggestion,
      clearLeadSuggestions,
      resumedFromPriorSession,
      startNewSession,
      dismissResumeBanner,
      isPanelOpen,
      setPanelOpen,
      panelWidth,
      setPanelWidth,
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
