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
  AiActivityEntry,
  CallMode,
  CallState,
  CallStatus,
  CoachingTip,
  ComplianceFlag,
  ExtractedEntities,
  IncomingCaller,
  InfoCard,
  PageRegistration,
  ProspectEmotion,
  StampedAiAction,
  TranscriptChunk,
} from '../types/call';

// Phase 3b — cap the action queues so a long call with no consumer mounted
// doesn't accumulate unbounded. Drop-oldest when over the cap.
const MAX_PENDING_ACTIONS = 200;
const MAX_ACTION_LOG = 200;
// Phase 3b.1 — AI activity feed cap. 100 entries is roughly 10 minutes of
// brisk AI activity; drop-oldest beyond that.
const MAX_AI_ACTIVITY = 100;

function newActionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
import { initialCallState } from '../types/call';
import { useAuth } from './AuthContext';
import { addRecent } from '../services/recentCalls';
import { API_BASE } from '../api/apiBase';

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
  | { kind: 'BIND_LEAD'; leadId: string }
  | { kind: 'END_CALL' }
  | { kind: 'TOGGLE_PANEL' }
  | { kind: 'SET_PANEL_OPEN'; open: boolean }
  | { kind: 'SET_CALL_SID'; sid: string | null }
  | { kind: 'SET_CALL_STATUS'; status: CallStatus }
  | { kind: 'SET_MUTE'; muted: boolean }
  | { kind: 'SET_DIALED_NUMBER'; number: string | null }
  | { kind: 'SET_PENDING_DIAL'; to: string }
  | { kind: 'CLEAR_PENDING_DIAL' }
  | { kind: 'SET_PENDING_CONTROL'; action: 'hangup' | 'mute' | 'unmute' }
  | { kind: 'CLEAR_PENDING_CONTROL' }
  | { kind: 'INCOMING_RINGING'; caller: IncomingCaller; leadId: string | null }
  | { kind: 'INCOMING_ACCEPTED' }
  | { kind: 'SCREENING_STARTED'; callSid: string }
  | { kind: 'APPEND_TRANSCRIPT'; chunk: TranscriptChunk }
  | { kind: 'MERGE_ENTITIES'; entities: Partial<ExtractedEntities> }
  | { kind: 'ENQUEUE_ACTIONS'; actions: AiAction[] }
  | { kind: 'CONSUME_ACTIONS'; ids: string[]; type?: AiActionType }
  | { kind: 'ADD_INFO_CARD'; card: InfoCard }
  | { kind: 'ADD_COMPLIANCE'; flag: ComplianceFlag }
  | { kind: 'DISMISS_COMPLIANCE'; id: string }
  | { kind: 'REGISTER_PAGE'; registration: PageRegistration }
  | { kind: 'UNREGISTER_PAGE' }
  | { kind: 'APPEND_ACTIVITY'; entry: AiActivityEntry }
  | { kind: 'SET_ANALYSIS_WARNING'; warning: string | null }
  | { kind: 'SET_PROSPECT_EMOTION'; emotion: ProspectEmotion; confidence: number; ts: number }
  | { kind: 'ADD_COACHING_TIP'; tip: CoachingTip }
  | { kind: 'DISMISS_COACHING_TIP'; id: string }
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
    case 'BIND_LEAD':
      // Phase 4 outbound-dial — late-bind a leadId onto the active call when
      // the agent clicks "Open lead" on an IdentifiedLeadCard. No-op if no
      // call is active. Existing add_note / fill_field paths consume
      // state.leadId, so this is enough to attribute post-call notes.
      if (!state.isCallActive) return state;
      return { ...state, leadId: action.leadId };
    case 'END_CALL':
      return {
        ...initialCallState(),
        currentPage: state.currentPage,
        // Keep the AI activity trail visible after hangup (post-call notes
        // land here seconds after teardown). START_CALL clears it fresh.
        aiActivityLog: state.aiActivityLog,
        // Gap 2 — captured entities/actions SURVIVE the call so the agent
        // can open the lead form afterwards and still apply them (the
        // PendingCaptureNudge points there). Cleared on the next START_CALL.
        pendingActions: state.pendingActions,
        extractedEntities: state.extractedEntities,
        leadId: state.leadId,
        dialedNumber: state.dialedNumber,
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
    case 'SET_PENDING_CONTROL':
      return { ...state, pendingControl: action.action };
    case 'CLEAR_PENDING_CONTROL':
      return { ...state, pendingControl: null };
    case 'INCOMING_RINGING': {
      // Phase 2.6 — replace any idle state with an inbound ringing call.
      // The Twilio Device fires `incoming` before any other call could have
      // started; defensively reset the slice fresh, then open the panel.
      const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return {
        ...initialCallState(),
        isCallActive: true,
        isCallPanelOpen: true,
        callId,
        leadId: action.leadId,
        callStartTime: Date.now(),
        mode: 'twilio',
        callStatus: 'ringing',
        direction: 'inbound',
        dialedNumber: action.caller.number,
        incomingCaller: action.caller,
        currentPage: state.currentPage,
      };
    }
    case 'INCOMING_ACCEPTED':
      // Transition from ring UI to live transcript UI. Clear incomingCaller
      // so CallPanel falls through to the normal connected layout.
      return {
        ...state,
        callStatus: 'connected',
        incomingCaller: null,
      };
    case 'SCREENING_STARTED':
      // AI screening — the assistant answers on the agent's behalf. Keep
      // the call slice alive (transcript streams via the parent callSid);
      // clear the ring UI. Takeover later transitions to 'connected' via
      // the normal accept flow with the SAME callSid.
      return {
        ...state,
        callSid: action.callSid,
        callStatus: 'screening',
        incomingCaller: null,
      };
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
    case 'ENQUEUE_ACTIONS': {
      // Phase 3b — stamp each new action with a stable _id so CONSUME_ACTIONS
      // can match by id (not by positional index, which drifts when two
      // consumers run between batches). Cap the queue length.
      const stamped: StampedAiAction[] = action.actions.map((a) => ({
        ...a,
        _id: newActionId(),
      }));
      const merged = [...state.pendingActions, ...stamped];
      const trimmed =
        merged.length > MAX_PENDING_ACTIONS
          ? merged.slice(merged.length - MAX_PENDING_ACTIONS)
          : merged;
      return { ...state, pendingActions: trimmed };
    }
    case 'CONSUME_ACTIONS': {
      // Move matching actions from pendingActions → actionLog. Match by
      // stable _id, not positional index.
      const idSet = new Set(action.ids);
      const consumed = state.pendingActions.filter((a) => idSet.has(a._id));
      const remaining = state.pendingActions.filter((a) => !idSet.has(a._id));
      const log = [...state.actionLog, ...consumed];
      const trimmedLog =
        log.length > MAX_ACTION_LOG ? log.slice(log.length - MAX_ACTION_LOG) : log;
      return {
        ...state,
        pendingActions: remaining,
        actionLog: trimmedLog,
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
    case 'APPEND_ACTIVITY': {
      // Phase 3b.1 — append a new activity entry; cap at MAX_AI_ACTIVITY
      // by dropping the oldest. (Reducer-level cap so no consumer can leak.)
      const merged = [...state.aiActivityLog, action.entry];
      const trimmed =
        merged.length > MAX_AI_ACTIVITY
          ? merged.slice(merged.length - MAX_AI_ACTIVITY)
          : merged;
      return { ...state, aiActivityLog: trimmed };
    }
    case 'SET_ANALYSIS_WARNING':
      // Never let a stale warning replace a fresh transcript: once chunks
      // have arrived, the pipe is proven and the warning is noise.
      if (action.warning && state.transcript.length > 0) return state;
      return { ...state, analysisWarning: action.warning };
    case 'SET_PROSPECT_EMOTION':
      return {
        ...state,
        prospectEmotion: { emotion: action.emotion, confidence: action.confidence, ts: action.ts },
      };
    case 'ADD_COACHING_TIP': {
      // An 'ai' tip supersedes the newest 'rule' tip (same trigger, richer).
      let tips = state.coachingTips;
      if (action.tip.source === 'ai' && tips[0]?.source === 'rule') {
        tips = tips.slice(1);
      }
      return { ...state, coachingTips: [action.tip, ...tips].slice(0, 5) };
    }
    case 'DISMISS_COACHING_TIP':
      return {
        ...state,
        coachingTips: state.coachingTips.map((t) =>
          t.id === action.id ? { ...t, dismissed: true } : t,
        ),
      };
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
  /** Phase 4 outbound-dial — bind a leadId onto the currently-active call.
   *  No-op when no call is active. */
  bindCurrentCallToLead: (leadId: string) => void;
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
  /** Gap 1 — queue a call-control action for CallRuntime to execute. */
  requestCallControl: (action: 'hangup' | 'mute' | 'unmute') => void;
  clearPendingControl: () => void;
  // Phase 2.6 — inbound call lifecycle. Producer (`useTwilioCall`'s
  // device.on('incoming')) calls `setIncomingRinging`; the IncomingCallView
  // calls the accept/reject helpers which are wired in CallRuntime.
  setIncomingRinging: (caller: IncomingCaller, leadId: string | null) => void;
  setIncomingAccepted: () => void;
  /** AI screening — the assistant answers on the agent's behalf. */
  screeningStarted: (callSid: string) => void;
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
  // Phase 3b.1 — append an entry to the AI activity feed surfaced in the
  // CallPanel's bottom half. Producer is `useCallAnalysis`.
  appendActivity: (entry: AiActivityEntry) => void;
  /** Surface (or clear) a live-analysis problem — e.g. the analyze stream
   *  failed, or this backend isn't hosting the call's media. */
  setAnalysisWarning: (warning: string | null) => void;
  // Live intelligence — producers are useCallAnalysis; consumers CallPanel.
  setProspectEmotion: (emotion: ProspectEmotion, confidence: number, ts: number) => void;
  addCoachingTip: (tip: CoachingTip) => void;
  dismissCoachingTip: (id: string) => void;
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
  const bindCurrentCallToLead = useCallback(
    (leadId: string) => dispatch({ kind: 'BIND_LEAD', leadId }),
    [],
  );
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
  const requestCallControl = useCallback(
    (action: 'hangup' | 'mute' | 'unmute') =>
      dispatch({ kind: 'SET_PENDING_CONTROL', action }),
    [],
  );
  const clearPendingControl = useCallback(
    () => dispatch({ kind: 'CLEAR_PENDING_CONTROL' }),
    [],
  );

  const setIncomingRinging = useCallback(
    (caller: IncomingCaller, leadId: string | null) =>
      dispatch({ kind: 'INCOMING_RINGING', caller, leadId }),
    [],
  );
  const setIncomingAccepted = useCallback(
    () => dispatch({ kind: 'INCOMING_ACCEPTED' }),
    [],
  );
  const screeningStarted = useCallback(
    (callSid: string) => dispatch({ kind: 'SCREENING_STARTED', callSid }),
    [],
  );


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
      // Phase 3b — match by stable `_id` (not positional index, which drifts
      // when two consumers run between batches). Strip the internal _id from
      // the returned shape so callers see plain AiActions.
      const matches: AiAction[] = [];
      const ids: string[] = [];
      for (const a of state.pendingActions) {
        if (a.type === type) {
          const { _id, ...rest } = a;
          matches.push(rest as AiAction);
          ids.push(_id);
        }
      }
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
  const appendActivity = useCallback(
    (entry: AiActivityEntry) => dispatch({ kind: 'APPEND_ACTIVITY', entry }),
    [],
  );
  const setAnalysisWarning = useCallback(
    (warning: string | null) => dispatch({ kind: 'SET_ANALYSIS_WARNING', warning }),
    [],
  );
  const setProspectEmotion = useCallback(
    (emotion: ProspectEmotion, confidence: number, ts: number) =>
      dispatch({ kind: 'SET_PROSPECT_EMOTION', emotion, confidence, ts }),
    [],
  );
  const addCoachingTip = useCallback(
    (tip: CoachingTip) => dispatch({ kind: 'ADD_COACHING_TIP', tip }),
    [],
  );
  const dismissCoachingTip = useCallback(
    (id: string) => dispatch({ kind: 'DISMISS_COACHING_TIP', id }),
    [],
  );

  const value = useMemo<CallContextValue>(
    () => ({
      state,
      startCall,
      endCall,
      bindCurrentCallToLead,
      togglePanel,
      setPanelOpen,
      setCallSid,
      setCallStatus,
      setMute,
      setDialedNumber,
      appendTranscript,
      dialNumber,
      clearPendingDial,
      requestCallControl,
      clearPendingControl,
      setIncomingRinging,
      setIncomingAccepted,
      screeningStarted,
      mergeEntities,
      enqueueActions,
      consumeActionsByType,
      addInfoCard,
      addComplianceFlag,
      dismissComplianceFlag,
      registerPage,
      unregisterPage,
      appendActivity,
      setAnalysisWarning,
      setProspectEmotion,
      addCoachingTip,
      dismissCoachingTip,
    }),
    [
      state,
      startCall,
      endCall,
      bindCurrentCallToLead,
      togglePanel,
      setPanelOpen,
      setCallSid,
      setCallStatus,
      setMute,
      setDialedNumber,
      appendTranscript,
      dialNumber,
      clearPendingDial,
      requestCallControl,
      clearPendingControl,
      setIncomingRinging,
      setIncomingAccepted,
      screeningStarted,
      mergeEntities,
      enqueueActions,
      consumeActionsByType,
      addInfoCard,
      addComplianceFlag,
      dismissComplianceFlag,
      registerPage,
      unregisterPage,
      appendActivity,
      setAnalysisWarning,
      setProspectEmotion,
      addCoachingTip,
      dismissCoachingTip,
    ],
  );

  // Phase 3b — DEV-ONLY debug hook. Lets you exercise the LeadForm AI auto-
  // fill pipeline without spending Twilio credit. Open DevTools console:
  //   __techsalesDebug.runFullTest()  — start fake call + inject 9 phrases.
  //   __techsalesDebug.startFakeCall()
  //   __techsalesDebug.inject('my zip is 33101')
  //   __techsalesDebug.endFakeCall()
  // Gated by `import.meta.env.DEV` so it's stripped from production bundles.
  const fakeCallSidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    type DebugApi = {
      startFakeCall: (callSid?: string) => string;
      inject: (text: string, speaker?: 'prospect' | 'agent') => Promise<unknown>;
      endFakeCall: () => void;
      runFullTest: () => Promise<void>;
    };
    const api: DebugApi = {
      startFakeCall(callSid?: string): string {
        const sid = callSid ?? `CA-debug-${Date.now().toString(36)}`;
        fakeCallSidRef.current = sid;
        const callId = `call_debug_${Date.now()}`;
        dispatch({
          kind: 'START_CALL',
          callId,
          leadId: null,
          startTime: Date.now(),
          mode: 'twilio',
        });
        dispatch({ kind: 'SET_CALL_SID', sid });
        dispatch({ kind: 'SET_CALL_STATUS', status: 'connected' });
        // eslint-disable-next-line no-console
        console.info('[__techsalesDebug] fake call started:', sid);
        return sid;
      },
      async inject(
        text: string,
        speaker: 'prospect' | 'agent' = 'prospect',
      ): Promise<unknown> {
        const sid = fakeCallSidRef.current;
        if (!sid) {
          // eslint-disable-next-line no-console
          console.warn('[__techsalesDebug] no fake call — call startFakeCall() first');
          return null;
        }
        const res = await fetch(`${API_BASE}/_debug/inject-transcript`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callSid: sid,
            chunks: [{ speaker, text, isFinal: true }],
          }),
        });
        const data = (await res.json()) as unknown;
        // eslint-disable-next-line no-console
        console.info('[__techsalesDebug] injected:', text, data);
        return data;
      },
      endFakeCall(): void {
        dispatch({ kind: 'END_CALL' });
        fakeCallSidRef.current = null;
        // eslint-disable-next-line no-console
        console.info('[__techsalesDebug] fake call ended');
      },
      async runFullTest(): Promise<void> {
        api.startFakeCall();
        const phrases: Array<[string, 'prospect' | 'agent']> = [
          ['my zip is 33101', 'prospect'],
          ['my name is John Smith', 'prospect'],
          ['my number is 555-123-4567', 'prospect'],
          ['send the info to john@example.com', 'prospect'],
          ['my medicare number is 1EG4-TE5-MK73', 'prospect'],
          ['my medicaid number is ABC123XYZ', 'prospect'],
          ['yes I have medicaid', 'prospect'],
          ['I get the low income subsidy', 'prospect'],
          ['I take Eliquis', 'prospect'],
        ];
        for (const [text, speaker] of phrases) {
          await new Promise((r) => setTimeout(r, 800));
          await api.inject(text, speaker);
        }
        // eslint-disable-next-line no-console
        console.info(
          '[__techsalesDebug] full test injected. Navigate to /leads/new to see fills, then call __techsalesDebug.endFakeCall().',
        );
      },
    };
    (window as unknown as { __techsalesDebug?: DebugApi }).__techsalesDebug = api;
    // eslint-disable-next-line no-console
    console.info(
      '[__techsalesDebug] hooks installed. Try: __techsalesDebug.runFullTest()',
    );
    return () => {
      delete (window as unknown as { __techsalesDebug?: DebugApi }).__techsalesDebug;
    };
  }, []);

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCallContext(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error('useCallContext must be used inside <CallProvider>');
  }
  return ctx;
}
