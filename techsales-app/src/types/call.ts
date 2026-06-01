/**
 * Live Call Copilot types — shared by CallContext, CallPanel, the speech-
 * recognition hook, and (in later phases) the SSE call-analysis client.
 *
 * Wire-format types (`CallStreamEvent`, `AiAction`, `PageRegistration`,
 * `ExtractedEntities`) MUST stay in lockstep with the backend mirror that
 * Phase 2 will add at `techsales-api/src/ai/types/call.types.ts`. Same
 * single-source-of-truth pattern as `types/ai.ts` ↔ `chatAgent.ts`.
 *
 * Phase 1 only uses `CallState` + `TranscriptChunk` + `PageRegistration`
 * skeleton + the listening/error subset. The remaining types are defined
 * up front so Phase 2/3 don't churn imports.
 */

/** Who produced a transcript chunk. `'unknown'` is reserved for the brief
 *  window between Twilio's `connected` event and the `start` event that
 *  tells us which track is which. */
export type Speaker = 'agent' | 'prospect' | 'unknown';

/** A single recognized speech segment, final or interim. */
export interface TranscriptChunk {
  id: string;
  text: string;
  /** epoch ms when the chunk was recognized client-side */
  timestamp: number;
  /** false for in-progress (interim) results, true once recognition commits */
  isFinal: boolean;
  /** Phase 2: who said it. Defaults to `'agent'` in Web Speech fallback. */
  speaker: Speaker;
  /** Optional STT confidence 0–1. Deepgram populates this; Web Speech rarely does. */
  confidence?: number;
}

/** Entities accumulated across the call. Phase 3 fills these in. */
export interface ExtractedEntities {
  drugs: { name: string; dosage?: string; frequency?: string }[];
  providers: { name: string; specialty?: string }[];
  pharmacies: { name: string }[];
  zipCode: string | null;
  dateOfBirth: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  medicareNumber: string | null;
  medicaidNumber: string | null;
  planTypeMentions: string[];
  stateCounty: { state?: string; county?: string } | null;
}

export const emptyExtractedEntities = (): ExtractedEntities => ({
  drugs: [],
  providers: [],
  pharmacies: [],
  zipCode: null,
  dateOfBirth: null,
  firstName: null,
  lastName: null,
  phone: null,
  email: null,
  medicareNumber: null,
  medicaidNumber: null,
  planTypeMentions: [],
  stateCounty: null,
});

export type PageType =
  | 'lead_form'
  | 'lead_detail'
  | 'plan_list'
  | 'plan_detail'
  | 'enrollment_form'
  | 'dashboard'
  | 'other';

export type PageCapability =
  | 'fill_field'
  | 'add_drug'
  | 'add_provider'
  | 'add_pharmacy'
  | 'show_info'
  | 'show_recommendation'
  | 'show_plans_link'
  | 'show_drug_coverage'
  | 'navigate_suggestion';

/** A page's published surface to the copilot — what actions it can absorb. */
export interface PageRegistration {
  route: string;
  pageType: PageType;
  formFields?: string[];
  currentData?: Record<string, unknown>;
  capabilities: PageCapability[];
}

/** Discrete action the AI dispatches to the rest of the app. */
export type AiAction =
  | { type: 'fill_field'; field: string; value: string | boolean; confidence: number }
  | { type: 'add_drug'; drugName: string; dosage?: string; frequency?: string }
  | { type: 'add_provider'; providerName: string }
  | { type: 'add_pharmacy'; pharmacyName: string }
  | { type: 'show_info'; topic: string; title: string; content: string; links?: { label: string; url: string }[] }
  | { type: 'show_plans_link'; planType: string; zipCode: string; count?: number; url: string }
  | { type: 'show_drug_coverage'; drugName: string; results: unknown }
  | { type: 'show_recommendation'; plans: unknown[] }
  | { type: 'compliance_flag'; phrase: string; rule: string; suggestion: string }
  | { type: 'suggested_response'; question: string; answer: string }
  | { type: 'navigate_suggestion'; url: string; reason: string };

export type AiActionType = AiAction['type'];

/** Materialized info card derived from a `show_info` / `show_plans_link` / `show_drug_coverage` action. */
export interface InfoCard {
  id: string;
  topic: string;
  title: string;
  content: string;
  links?: { label: string; url: string }[];
  /** epoch ms it was added */
  timestamp: number;
}

/** Materialized compliance violation derived from a `compliance_flag` action. */
export interface ComplianceFlag {
  id: string;
  phrase: string;
  rule: string;
  suggestion: string;
  timestamp: number;
  dismissed?: boolean;
}

/** SSE event the backend emits over /api/ai/call/analyze. Phase 2 delivers
 *  `open`, `transcript`, `call_status`, `error`. Phase 3+ extends with
 *  `actions`, `entities`, `tool_start`, `tool_end`, `thinking`. */
export type CallStreamEvent =
  | { type: 'open'; callSid: string }
  | { type: 'transcript'; chunk: TranscriptChunk }
  | { type: 'call_status'; status: 'connected' | 'ended' }
  | { type: 'actions'; actions: AiAction[] }
  | { type: 'entities'; entities: Partial<ExtractedEntities> }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: unknown; latencyMs: number }
  | { type: 'thinking'; content: string }
  | { type: 'error'; error: string };

/** Which transcription pipeline drives the current call. Single value today
 *  (Twilio + Deepgram); kept as a single-literal union for forward extension
 *  if we add inbound calls / voicemail playback / etc. later. */
export type CallMode = 'twilio';

/** Lifecycle status for the call leg the agent is on. */
export type CallStatus =
  | 'idle' // panel open, no call yet
  | 'connecting' // token fetched, Device initializing
  | 'ringing' // PSTN ringing
  | 'connected' // both legs up, audio flowing
  | 'ending' // hangup in progress
  | 'ended' // peer or local hung up
  | 'error';

/** Top-level call state. */
export interface CallState {
  isCallActive: boolean;
  isCallPanelOpen: boolean;
  /** Our internal logical call ID, generated client-side on startCall. Used
   *  as the sessionStorage key and the callBus subscription key when in
   *  Web Speech fallback. */
  callId: string | null;
  /** Twilio's Call SID, populated once Twilio assigns it (after dial). Used
   *  to subscribe to the backend SSE bridge in Twilio mode. */
  callSid: string | null;
  leadId: string | null;
  /** epoch ms */
  callStartTime: number | null;
  /** Phase 2: which transcription pipeline this call uses. */
  mode: CallMode;
  /** Phase 2: high-level Twilio call status. `'idle'` in Web Speech mode. */
  callStatus: CallStatus;
  /** Phase 2: is the agent's outgoing audio muted? */
  isMuted: boolean;
  /** Phase 2: the E.164 number being dialed (outbound only). */
  dialedNumber: string | null;
  /** Phase 2: direction of the call. Always `'outbound'` for now. */
  direction: 'outbound' | 'inbound' | null;
  /** Phase 2.5: an E.164 number set by `dialNumber()` that the always-mounted
   *  `<CallRuntime/>` host reads via useEffect and actually places via the
   *  Twilio SDK. Null when no dial is queued. Cleared by CallRuntime once
   *  `useTwilioCall.dial()` has been invoked. */
  pendingDial: string | null;
  currentPage: PageRegistration | null;
  transcript: TranscriptChunk[];
  extractedEntities: ExtractedEntities;
  pendingActions: AiAction[];
  actionLog: AiAction[];
  complianceFlags: ComplianceFlag[];
  infoCards: InfoCard[];
}

export const initialCallState = (): CallState => ({
  isCallActive: false,
  isCallPanelOpen: false,
  callId: null,
  callSid: null,
  leadId: null,
  callStartTime: null,
  mode: 'twilio',
  callStatus: 'idle',
  isMuted: false,
  dialedNumber: null,
  direction: null,
  pendingDial: null,
  currentPage: null,
  transcript: [],
  extractedEntities: emptyExtractedEntities(),
  pendingActions: [],
  actionLog: [],
  complianceFlags: [],
  infoCards: [],
});
