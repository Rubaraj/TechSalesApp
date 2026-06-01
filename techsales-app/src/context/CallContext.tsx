/**
 * CallContext — the App Context Bus from `SALES_IQ_COPILOT.md` §Architecture.
 *
 * Owns call lifecycle, transcript accumulation, and (in later phases) AI
 * actions, extracted entities, info cards, compliance flags, and the
 * currently-registered page surface. Phase 1 wires only what the foundation
 * needs (start/end/togglePanel/appendTranscript + sessionStorage resilience).
 * The remaining mutators are present as typed stubs so Phase 2/3 can drop
 * implementations in without breaking the public shape.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type {
  AiAction,
  AiActionType,
  CallMode,
  CallState,
  CallStatus,
  ComplianceFlag,
  ExtractedEntities,
  InfoCard,
  PageRegistration,
  TranscriptChunk,
} from '../types/call';
import { initialCallState } from '../types/call';
import { useAuth } from './AuthContext';
import { addRecent } from '../services/recentCalls';

const STORAGE_KEY_PREFIX = 'techsales:callState';
const MAX_PERSISTED_TRANSCRIPT = 50;

/** QA H3 — scope by userId so two users on the same laptop don't hydrate
 *  each other's call state. `null` means "no signed-in user; don't persist". */
function storageKeyFor(userId: string | null): string | null {
  if (!userId) return null;
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

// QA H2 — module-level ref so `AuthContext.logout` can end any active call
// before tearing down auth state. CallProvider registers on mount; logout
// invokes it (no-op if no provider mounted).
let _endActiveCallAsync: (() => Promise<void>) | null = null;

export function registerEndActiveCallAsync(fn: (() => Promise<void>) | null): void {
  _endActiveCallAsync = fn;
}

export async function endActiveCallAsyncIfAny(): Promise<void> {
  const fn = _endActiveCallAsync;
  if (!fn) return;
  try {
    await fn();
  } catch {
    // best-effort
  }
}

type Action =
  | {
      kind: 'START_CALL';
      callId: string;
      leadId: string | null;
      startTime: number;
      mode: CallMode;
    }
  | { kind: 'END_CALL' }
  | { kind: 'TOGGLE_PANEL' }
  | { kind: 'SET_PANEL_OPEN'; open: boolean }
  | { kind: 'SET_CALL_SID'; sid: string | null }
  | { kind: 'SET_CALL_STATUS'; status: CallStatus }
  | { kind: 'SET_MUTE'; muted: boolean }
  | { kind: 'SET_DIALED_NUMBER'; number: string | null }
  | { kind: 'SET_PENDING_DIAL'; to: string }
  | { kind: 'CLEAR_PENDING_DIAL' }
  | { kind: 'APPEND_TRANSCRIPT'; chunk: TranscriptChunk }
  | { kind: 'MERGE_ENTITIES'; entities: Partial<ExtractedEntities> }
  | { kind: 'ENQUEUE_ACTIONS'; actions: AiAction[] }
  | { kind: 'CONSUME_ACTIONS'; ids: string[]; type?: AiActionType }
  | { kind: 'ADD_INFO_CARD'; card: InfoCard }
  | { kind: 'ADD_COMPLIANCE'; flag: ComplianceFlag }
  | { kind: 'DISMISS_COMPLIANCE'; id: string }
  | { kind: 'REGISTER_PAGE'; registration: PageRegistration }
  | { kind: 'UNREGISTER_PAGE' }
  | { kind: 'HYDRATE'; state: CallState };

function reducer(state: CallState, action: Action): CallState {
  switch (action.kind) {
    case 'START_CALL':
      return {
        ...initialCallState(),
        isCallActive: true,
        isCallPanelOpen: true,
        callId: action.callId,
        leadId: action.leadId,
        callStartTime: action.startTime,
        mode: action.mode,
        // Always idle on open: the dialer is shown until the user clicks
        // Dial (or click-to-dial fires).
        callStatus: 'idle',
        direction: 'outbound',
        // currentPage survives across the call start so a page already mounted
        // when the call begins remains registered.
        currentPage: state.currentPage,
      };
    case 'END_CALL':
      return {
        ...initialCallState(),
        currentPage: state.currentPage,
      };
    case 'TOGGLE_PANEL':
      return { ...state, isCallPanelOpen: !state.isCallPanelOpen };
    case 'SET_PANEL_OPEN':
      return { ...state, isCallPanelOpen: action.open };
    case 'SET_CALL_SID':
      return { ...state, callSid: action.sid };
    case 'SET_CALL_STATUS':
      return { ...state, callStatus: action.status };
    case 'SET_MUTE':
      return { ...state, isMuted: action.muted };
    case 'SET_DIALED_NUMBER':
      return { ...state, dialedNumber: action.number };
    case 'SET_PENDING_DIAL':
      return { ...state, pendingDial: action.to };
    case 'CLEAR_PENDING_DIAL':
      return { ...state, pendingDial: null };
    case 'APPEND_TRANSCRIPT': {
      // Dedupe by id: Deepgram emits multiple events per utterance (interim
      // refinements + final), all sharing the same `start`-based id. Replace
      // an existing chunk with the same id (newer text + final flag wins).
      // Falls back to plain append for chunks with no matching id.
      const idx = state.transcript.findIndex((c) => c.id === action.chunk.id);
      if (idx === -1) {
        // eslint-disable-next-line no-console
        console.debug('[CallContext] transcript append', action.chunk.id, action.chunk.speaker, action.chunk.isFinal, action.chunk.text);
        return { ...state, transcript: [...state.transcript, action.chunk] };
      }
      // eslint-disable-next-line no-console
      console.debug('[CallContext] transcript replace', action.chunk.id, action.chunk.speaker, action.chunk.isFinal, action.chunk.text);
      const next = state.transcript.slice();
      next[idx] = action.chunk;
      return { ...state, transcript: next };
    }
    case 'MERGE_ENTITIES':
      return {
        ...state,
        extractedEntities: { ...state.extractedEntities, ...action.entities },
      };
    case 'ENQUEUE_ACTIONS':
      return {
        ...state,
        pendingActions: [...state.pendingActions, ...action.actions],
      };
    case 'CONSUME_ACTIONS': {
      // Move matching actions from pendingActions → actionLog.
      const idSet = new Set(action.ids);
      const consumed = state.pendingActions.filter((_, i) => idSet.has(String(i)));
      const remaining = state.pendingActions.filter((_, i) => !idSet.has(String(i)));
      return {
        ...state,
        pendingActions: remaining,
        actionLog: [...state.actionLog, ...consumed],
      };
    }
    case 'ADD_INFO_CARD':
      return { ...state, infoCards: [action.card, ...state.infoCards] };
    case 'ADD_COMPLIANCE':
      return {
        ...state,
        complianceFlags: [action.flag, ...state.complianceFlags],
      };
    case 'DISMISS_COMPLIANCE':
      return {
        ...state,
        complianceFlags: state.complianceFlags.map((f) =>
          f.id === action.id ? { ...f, dismissed: true } : f,
        ),
      };
    case 'REGISTER_PAGE':
      return { ...state, currentPage: action.registration };
    case 'UNREGISTER_PAGE':
      return { ...state, currentPage: null };
    case 'HYDRATE':
      return action.state;
    default:
      return state;
  }
}

export interface DialNumberInput {
  /** Raw or E.164. Caller normalizes — this method assumes it's already valid. */
  to: string;
  leadId?: string;
  leadName?: string;
}

export interface CallContextValue {
  state: CallState;
  // Phase 1/2 surface
  startCall: (opts?: { leadId?: string; mode?: CallMode }) => void;
  endCall: () => void;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  setCallSid: (sid: string | null) => void;
  setCallStatus: (status: CallStatus) => void;
  setMute: (muted: boolean) => void;
  setDialedNumber: (number: string | null) => void;
  appendTranscript: (chunk: TranscriptChunk) => void;
  // Phase 2.5 — click-to-dial entry point. Funnels every "start a call
  // programmatically with this number" use case through a single door:
  // sets state.pendingDial, which the always-mounted <CallRuntime/> reads
  // via useEffect and hands to useTwilioCall.dial().
  dialNumber: (input: DialNumberInput) => void;
  clearPendingDial: () => void;
  // Phase 2/3 surface — wired now so consumers can import the types but the
  // implementations are pass-throughs to the reducer; they become meaningful
  // once the SSE client and page-registration code lands.
  mergeEntities: (entities: Partial<ExtractedEntities>) => void;
  enqueueActions: (actions: AiAction[]) => void;
  consumeActionsByType: (type: AiActionType) => AiAction[];
  addInfoCard: (card: InfoCard) => void;
  addComplianceFlag: (flag: ComplianceFlag) => void;
  dismissComplianceFlag: (id: string) => void;
  registerPage: (registration: PageRegistration) => void;
  unregisterPage: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

// --- sessionStorage helpers -------------------------------------------------

function loadPersisted(userId: string | null): CallState | null {
  if (typeof window === 'undefined') return null;
  const key = storageKeyFor(userId);
  if (!key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CallState> | null;
    if (!parsed || !parsed.isCallActive || !parsed.callId) return null;
    const base = initialCallState();
    return {
      ...base,
      isCallActive: true,
      isCallPanelOpen: parsed.isCallPanelOpen ?? true,
      callId: parsed.callId,
      leadId: parsed.leadId ?? null,
      callStartTime: parsed.callStartTime ?? Date.now(),
      transcript: Array.isArray(parsed.transcript) ? parsed.transcript : [],
    };
  } catch {
    return null;
  }
}

function persist(state: CallState, userId: string | null): void {
  if (typeof window === 'undefined') return;
  const key = storageKeyFor(userId);
  if (!key) return;
  if (!state.isCallActive) {
    window.sessionStorage.removeItem(key);
    return;
  }
  try {
    const minimal = {
      isCallActive: state.isCallActive,
      isCallPanelOpen: state.isCallPanelOpen,
      callId: state.callId,
      leadId: state.leadId,
      callStartTime: state.callStartTime,
      transcript: state.transcript.slice(-MAX_PERSISTED_TRANSCRIPT),
    };
    window.sessionStorage.setItem(key, JSON.stringify(minimal));
  } catch {
    // sessionStorage may be unavailable (quota / privacy mode). Silently skip.
  }
}

// --- Provider ---------------------------------------------------------------

export function CallProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, undefined, initialCallState);
  // QA H3 — userId scopes sessionStorage. CallProvider sits inside
  // AuthProvider, so useAuth() is safe here.
  const auth = useAuth();
  const userId = auth.user?.userId ?? null;
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  // Hydrate from sessionStorage when userId becomes available.
  const hydratedForUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId) {
      hydratedForUserRef.current = null;
      return;
    }
    if (hydratedForUserRef.current === userId) return;
    hydratedForUserRef.current = userId;
    const persisted = loadPersisted(userId);
    if (persisted) {
      dispatch({ kind: 'HYDRATE', state: persisted });
    }
  }, [userId]);

  // Persist on every change (cheap; sessionStorage is sync local-only).
  useEffect(() => {
    persist(state, userIdRef.current);
  }, [state]);

  // QA H2 — register an async end-call hook so AuthContext.logout can stop
  // the call (await Twilio Device destroy) before clearing auth state.
  useEffect(() => {
    const endActive = async (): Promise<void> => {
      if (state.isCallActive) {
        // We don't have the Twilio handle here — the panel's useTwilioCall
        // owns it. Fire a DOM-level event the hook listens for; the hook
        // awaits destroy then calls endCall(). This avoids a hard
        // CallProvider → useTwilioCall dependency.
        await new Promise<void>((resolve) => {
          const onDone = (): void => {
            window.removeEventListener('techsales:call-destroyed', onDone);
            resolve();
          };
          window.addEventListener('techsales:call-destroyed', onDone);
          window.dispatchEvent(new CustomEvent('techsales:logout-end-call'));
          // Safety timeout — if no listener handled it, just clear.
          window.setTimeout(() => {
            window.removeEventListener('techsales:call-destroyed', onDone);
            resolve();
          }, 1500);
        });
      }
      dispatch({ kind: 'END_CALL' });
    };
    registerEndActiveCallAsync(endActive);
    return () => {
      registerEndActiveCallAsync(null);
    };
  }, [state.isCallActive]);

  const startCall = useCallback((opts?: { leadId?: string; mode?: CallMode }) => {
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    dispatch({
      kind: 'START_CALL',
      callId,
      leadId: opts?.leadId ?? null,
      startTime: Date.now(),
      mode: opts?.mode ?? 'twilio',
    });
  }, []);

  const endCall = useCallback(() => dispatch({ kind: 'END_CALL' }), []);
  const togglePanel = useCallback(() => dispatch({ kind: 'TOGGLE_PANEL' }), []);
  const setPanelOpen = useCallback(
    (open: boolean) => dispatch({ kind: 'SET_PANEL_OPEN', open }),
    [],
  );
  const setCallSid = useCallback(
    (sid: string | null) => dispatch({ kind: 'SET_CALL_SID', sid }),
    [],
  );
  const setCallStatus = useCallback(
    (status: CallStatus) => dispatch({ kind: 'SET_CALL_STATUS', status }),
    [],
  );
  const setMute = useCallback(
    (muted: boolean) => dispatch({ kind: 'SET_MUTE', muted }),
    [],
  );
  const setDialedNumber = useCallback(
    (number: string | null) => dispatch({ kind: 'SET_DIALED_NUMBER', number }),
    [],
  );
  const appendTranscript = useCallback(
    (chunk: TranscriptChunk) => dispatch({ kind: 'APPEND_TRANSCRIPT', chunk }),
    [],
  );

  // Phase 2.5 — single door for "start a call to this number" from anywhere.
  // QA H3 fix — debounce via synchronous ref instead of state. The state
  // version was closure-pinned: rapid `dialNumber({A})` then `dialNumber({B})`
  // in the same tick both saw `pendingDial = null` (React hadn't committed)
  // and double-dispatched. The ref is set synchronously, blocking the second
  // call immediately. Cleared by `clearPendingDial`.
  const inFlightDialRef = useRef<boolean>(false);
  const dialNumber = useCallback(
    (input: DialNumberInput) => {
      const { to, leadId, leadName } = input;
      if (inFlightDialRef.current) return;
      if (state.pendingDial !== null) return;
      if (state.isCallActive && state.callStatus !== 'idle') return;
      inFlightDialRef.current = true;
      if (!state.isCallActive) {
        const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        dispatch({
          kind: 'START_CALL',
          callId,
          leadId: leadId ?? null,
          startTime: Date.now(),
          mode: 'twilio',
        });
      }
      dispatch({ kind: 'SET_DIALED_NUMBER', number: to });
      dispatch({ kind: 'SET_PENDING_DIAL', to });
      // Recents reflect intent — record on dial issuance, not on connect.
      addRecent({ to, leadId, leadName, at: Date.now() });
    },
    [state.pendingDial, state.isCallActive, state.callStatus],
  );

  const clearPendingDial = useCallback(() => {
    inFlightDialRef.current = false;
    dispatch({ kind: 'CLEAR_PENDING_DIAL' });
  }, []);


  // Phase 2/3 stubs — wire to the reducer so types stay honest. No
  // behavioural effect in Phase 1 since no producer calls them.
  const mergeEntities = useCallback(
    (entities: Partial<ExtractedEntities>) =>
      dispatch({ kind: 'MERGE_ENTITIES', entities }),
    [],
  );
  const enqueueActions = useCallback(
    (actions: AiAction[]) => dispatch({ kind: 'ENQUEUE_ACTIONS', actions }),
    [],
  );
  const consumeActionsByType = useCallback(
    (type: AiActionType): AiAction[] => {
      const matches: AiAction[] = [];
      const ids: string[] = [];
      state.pendingActions.forEach((a, i) => {
        if (a.type === type) {
          matches.push(a);
          ids.push(String(i));
        }
      });
      if (ids.length > 0) {
        dispatch({ kind: 'CONSUME_ACTIONS', ids, type });
      }
      return matches;
    },
    [state.pendingActions],
  );
  const addInfoCard = useCallback(
    (card: InfoCard) => dispatch({ kind: 'ADD_INFO_CARD', card }),
    [],
  );
  const addComplianceFlag = useCallback(
    (flag: ComplianceFlag) => dispatch({ kind: 'ADD_COMPLIANCE', flag }),
    [],
  );
  const dismissComplianceFlag = useCallback(
    (id: string) => dispatch({ kind: 'DISMISS_COMPLIANCE', id }),
    [],
  );
  const registerPage = useCallback(
    (registration: PageRegistration) =>
      dispatch({ kind: 'REGISTER_PAGE', registration }),
    [],
  );
  const unregisterPage = useCallback(() => dispatch({ kind: 'UNREGISTER_PAGE' }), []);

  const value = useMemo<CallContextValue>(
    () => ({
      state,
      startCall,
      endCall,
      togglePanel,
      setPanelOpen,
      setCallSid,
      setCallStatus,
      setMute,
      setDialedNumber,
      appendTranscript,
      dialNumber,
      clearPendingDial,
      mergeEntities,
      enqueueActions,
      consumeActionsByType,
      addInfoCard,
      addComplianceFlag,
      dismissComplianceFlag,
      registerPage,
      unregisterPage,
    }),
    [
      state,
      startCall,
      endCall,
      togglePanel,
      setPanelOpen,
      setCallSid,
      setCallStatus,
      setMute,
      setDialedNumber,
      appendTranscript,
      dialNumber,
      clearPendingDial,
      mergeEntities,
      enqueueActions,
      consumeActionsByType,
      addInfoCard,
      addComplianceFlag,
      dismissComplianceFlag,
      registerPage,
      unregisterPage,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCallContext(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error('useCallContext must be used inside <CallProvider>');
  }
  return ctx;
}
