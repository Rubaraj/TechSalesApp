/**
 * Phase 3a — Call Analysis Agent (stub / rule-based path).
 *
 * Subscribes to a single call's transcript stream (via `callBus`), runs
 * rule-based extraction + compliance scanning on each FINAL chunk, and
 * publishes `actions` + `entities` events back into `callBus` for the SSE
 * bridge to forward to the FE.
 *
 * Phase 3c will swap the `runStub` body for a LangGraph ReAct loop driven by
 * `getChatModel()`. The wire-format (callBus events) stays identical — zero
 * FE changes needed for the swap.
 *
 * Critical correctness fixes from the plan review:
 *   - The "unimplemented LLM path" throw fires at `startCallAnalysis()`
 *     invocation (once per call) — NOT inside the per-chunk subscribe
 *     callback. A throw inside the EventEmitter listener would propagate
 *     back through `publish()` into the Deepgram transcript callback and
 *     kill the Media Stream WS handler.
 *   - Per-chunk handling is wrapped in a try/catch as defense.
 *   - Per-call accumulator AND dedup-set are torn down in `stop()` so the
 *     map doesn't leak across calls.
 */
import { logger } from '../../config/logger.js';
import {
  subscribe,
  publish,
  publishGlobal,
  registerCall,
  unregisterCall,
  type CallBusEvent,
} from '../../services/callBus.js';
import { persistCallRecord } from '../audit/persistCallRecord.js';
import type { CallLine, CallTag } from '../../models/callRecord.model.js';
import {
  emptyExtractedEntities,
  type ExtractedEntities,
  type AiAction,
  type TranscriptChunk,
} from '../types/call.types.js';
import { scanForViolations } from '../tools/complianceCheck.tool.js';
import { lookupMedicareTerm } from '../tools/medicareKnowledge.tool.js';
import { extractFromProspectChunk } from '../rules/entityExtractor.js';
import { summarizeTranscript } from '../rules/noteSummarizer.js';
import { auditCallAnalysisEvent } from '../audit/auditCallAnalysisEvent.js';

// --- Per-call state (cleaned up on stop) ----------------------------------

const accumulators = new Map<string, ExtractedEntities>();
const shownTopics = new Map<string, Set<string>>();
/** Phase 3b — per-call caller E.164 for phone-extraction dedup on inbound. */
const callerNumbers = new Map<string, string>();
/** Phase 3b.1 — accumulated FINAL prospect chunks fed to the post-call
 *  note summarizer when `stop()` runs. */
const transcriptHistory = new Map<string, TranscriptChunk[]>();
/** Phase 3b.1 — unsubscribe handle per callSid so `stopCallAnalysisByCallSid`
 *  can find it. The returned `stop()` handle from `startCallAnalysis` also
 *  delegates here for a single teardown funnel. */
const unsubscribers = new Map<string, () => void>();
/** Phase 3b.1 — userId per callSid so the post-call summary audit knows
 *  who to attribute (set if provided at startCallAnalysis). */
const userIds = new Map<string, string>();
/** QA pipeline — per-call metadata the WS handler doesn't thread anywhere
 *  else; owned here because the persist hook lives in stop(). */
const callMeta = new Map<string, { direction: 'inbound' | 'outbound'; startedAt: number }>();
/** QA pipeline — tags the rule-based analysis produced during the call
 *  (compliance / info / entity / note), persisted with the transcript. */
const callTags = new Map<string, CallTag[]>();

function addTag(callSid: string, kind: CallTag['kind'], data: Record<string, unknown>): void {
  const tags = callTags.get(callSid);
  if (tags) tags.push({ kind, ts: Date.now(), data });
}

// --- Public API -----------------------------------------------------------

export interface StartCallAnalysisInput {
  callSid: string;
  userId?: string;
  /** Phase 3b — inbound calls only. The prospect's E.164 caller ID; used by
   *  the entity extractor to suppress phone matches that equal it (prospect
   *  repeating their own number). Outbound: leave undefined. */
  callerNumber?: string;
  /** QA pipeline — call direction for the persisted record + supervisor
   *  feed. Defaults to 'outbound' when the caller doesn't know. */
  direction?: 'inbound' | 'outbound';
}

export interface CallAnalysisHandle {
  stop: () => void;
}

/**
 * Wire the agent for a single call. Returns a `stop()` handle the WS receiver
 * MUST invoke from `closeStreams()` (the single funnel for Twilio `stop` /
 * WS close / WS error / forceEndCall — see twilioMediaStream.ws.ts).
 *
 * Phase 4 — the rule-based analyzer ALWAYS runs, regardless of
 * AI_LLM_PROVIDER. The earlier provider gate (Phase 3a) was paranoia from
 * before the Atlas agent existed. Compliance scanning and entity extraction
 * are LLM-free; they run side-by-side with any LLM provider configured for
 * Atlas / chat / recommend agents.
 */
export function startCallAnalysis(input: StartCallAnalysisInput): CallAnalysisHandle {
  const { callSid, userId, callerNumber } = input;
  const direction = input.direction ?? 'outbound';

  accumulators.set(callSid, emptyExtractedEntities());
  shownTopics.set(callSid, new Set());
  transcriptHistory.set(callSid, []);
  callTags.set(callSid, []);
  callMeta.set(callSid, { direction, startedAt: Date.now() });
  if (callerNumber) callerNumbers.set(callSid, callerNumber);
  if (userId) userIds.set(callSid, userId);
  logger.info(
    { callSid, userId, callerNumber, direction },
    'callAnalysisAgent: started (stub provider)',
  );

  // Supervisor feed — this call is now live.
  registerCall(callSid, { ...(userId ? { userId } : {}), direction, startedAt: Date.now() });

  const unsubscribe = subscribe(callSid, (event: CallBusEvent) => {
    if (event.type !== 'transcript') return;
    if (!event.chunk.isFinal) return;
    try {
      // QA pipeline — accumulate BOTH speakers' final chunks (real ts/speaker
      // preserved) so the persisted record and the QA evaluator see the whole
      // conversation, not just the prospect side.
      transcriptHistory.get(callSid)?.push(event.chunk);
      runStub(callSid, event.chunk, userId);
    } catch (err) {
      logger.error({ err, callSid }, 'callAnalysisAgent: runStub threw');
    }
  });
  unsubscribers.set(callSid, unsubscribe);

  return {
    stop: () => stopCallAnalysisByCallSid(callSid),
  };
}

/**
 * Phase 3b.1 — Teardown a call's analysis state by callSid. Used by both the
 * returned `stop()` handle (from the WS handler's closeStreams) AND the debug
 * `/api/_debug/stop-call` route (which doesn't have the handle).
 *
 * Critical ordering — DO NOT REARRANGE:
 *   1. Run the post-call note summarizer FIRST so its add_note publish reaches
 *      the SSE bridge subscriber while it's still attached.
 *   2. THEN unsubscribe from the bus.
 *   3. THEN clear per-call state.
 * The WS handler's subsequent `publish('status', 'ended')` is what closes the
 * SSE stream — that runs after this function returns.
 */
export function stopCallAnalysisByCallSid(callSid: string): void {
  const userId = userIds.get(callSid);
  try {
    runPostCallNoteSummary(callSid, userId);
  } catch (err) {
    logger.error({ err, callSid }, 'callAnalysisAgent: post-call summary threw');
  }

  // QA pipeline — snapshot per-call state BEFORE the deletes below, then
  // persist + notify the supervisor feed fire-and-forget.
  const history = transcriptHistory.get(callSid) ?? [];
  const tags = callTags.get(callSid) ?? [];
  const meta = callMeta.get(callSid);
  if (meta) {
    const lines: CallLine[] = history.map((c) => ({
      speaker: c.speaker ?? 'unknown',
      text: c.text,
      ts: c.timestamp,
    }));
    const tagCounts: Record<string, number> = {};
    for (const t of tags) tagCounts[t.kind] = (tagCounts[t.kind] ?? 0) + 1;
    // Persist FIRST, publish call_ended in .then — the supervisor FE refetches
    // the call log the moment call_ended arrives, so the event must imply the
    // row exists. persistCallRecord never rejects (errors logged + swallowed),
    // so call_ended always fires; the call path stays non-blocking.
    void persistCallRecord({
      callSid,
      ...(userId ? { userId } : {}),
      direction: meta.direction,
      startedAt: meta.startedAt,
      lines,
      tags,
    }).then(() => {
      publishGlobal({
        type: 'call_ended',
        callSid,
        ...(userId ? { userId } : {}),
        flagged: tags.some((t) => t.kind === 'compliance'),
        tagCounts,
        durationSec: Math.max(0, Math.round((Date.now() - meta.startedAt) / 1000)),
      });
    });
  }
  unregisterCall(callSid);

  const unsubscribe = unsubscribers.get(callSid);
  if (unsubscribe) {
    unsubscribe();
    unsubscribers.delete(callSid);
  }
  accumulators.delete(callSid);
  shownTopics.delete(callSid);
  callerNumbers.delete(callSid);
  transcriptHistory.delete(callSid);
  userIds.delete(callSid);
  callMeta.delete(callSid);
  callTags.delete(callSid);
  logger.info({ callSid }, 'callAnalysisAgent: stopped');
}

// --- Stub core -------------------------------------------------------------

function runStub(callSid: string, chunk: TranscriptChunk, userId?: string): void {
  if (chunk.speaker === 'agent') {
    runAgentSideAnalysis(callSid, chunk.text, userId);
  } else if (chunk.speaker === 'prospect') {
    void runProspectSideAnalysis(callSid, chunk.text, userId);
  }
}

function runAgentSideAnalysis(
  callSid: string,
  text: string,
  userId?: string,
): void {
  const violations = scanForViolations(text);
  if (violations.length === 0) return;

  const actions: AiAction[] = violations.map((v) => ({
    type: 'compliance_flag',
    phrase: v.phrase,
    rule: v.rule,
    suggestion: v.suggestion,
  }));
  publish(callSid, { type: 'actions', actions });

  for (const v of violations) {
    // QA pipeline — tag for the persisted record + live supervisor feed.
    addTag(callSid, 'compliance', { phrase: v.phrase, rule: v.rule, suggestion: v.suggestion });
    publishGlobal({
      type: 'compliance_flag',
      callSid,
      ...(userId ? { userId } : {}),
      phrase: v.phrase,
      rule: v.rule,
      suggestion: v.suggestion,
      ts: Date.now(),
    });
    void auditCallAnalysisEvent({
      callSid,
      userId,
      kind: 'compliance_flag',
      payload: { phrase: v.phrase, rule: v.rule },
    });
  }
}

async function runProspectSideAnalysis(
  callSid: string,
  text: string,
  userId?: string,
): Promise<void> {
  const current = accumulators.get(callSid) ?? emptyExtractedEntities();
  const callerNumber = callerNumbers.get(callSid);

  // (QA pipeline note: transcript accumulation moved up into the subscribe
  // callback so BOTH speakers are captured with their real timestamps.)

  // Entity extraction (zip / drugs / plan-type mentions + Phase 3b additions).
  const diff = await extractFromProspectChunk(
    text,
    current,
    callerNumber ? { callerNumber } : {},
  );
  if (Object.keys(diff).length > 0) {
    const merged: ExtractedEntities = { ...current, ...diff };
    accumulators.set(callSid, merged);
    publish(callSid, { type: 'entities', entities: diff });
    addTag(callSid, 'entity', diff as Record<string, unknown>);
    void auditCallAnalysisEvent({
      callSid,
      userId,
      kind: 'entities',
      payload: diff as Record<string, unknown>,
    });

    // Phase 3b — emit `fill_field` + `add_drug` actions for new entities so
    // LeadForm can populate its fields and tagging UI in real time. Confidence
    // 0.9 for anchor-word matches, 0.7 for dictionary-only / weaker patterns.
    //
    // The diff.drugs field contains the FULL merged drug list (per the
    // extractor's contract — needed so the accumulator merge stays correct).
    // For action emission, narrow to ONLY drugs not already in `current.drugs`
    // so the FE doesn't see duplicate add_drug events on subsequent chunks.
    const currentDrugNames = new Set(
      (current.drugs ?? []).map((d) => d.name.toLowerCase()),
    );
    const newDrugs = (diff.drugs ?? []).filter(
      (d) => !currentDrugNames.has(d.name.toLowerCase()),
    );
    // Phase 3b.1 — same narrowing for pharmacy + provider so we don't
    // re-emit the same add_* action on subsequent chunks.
    const currentPharmacies = new Set(
      (current.pharmacies ?? []).map((p) => p.name.toLowerCase()),
    );
    const newPharmacies = (diff.pharmacies ?? []).filter(
      (p) => !currentPharmacies.has(p.name.toLowerCase()),
    );
    const currentProviders = new Set(
      (current.providers ?? []).map((p) => p.name.toLowerCase()),
    );
    const newProviders = (diff.providers ?? []).filter(
      (p) => !currentProviders.has(p.name.toLowerCase()),
    );
    const fillActions = buildFillActions(diff);
    const drugActions = buildDrugActions({ drugs: newDrugs });
    const pharmacyActions = buildPharmacyActions(newPharmacies);
    const providerActions = buildProviderActions(newProviders);
    const allActions: AiAction[] = [
      ...fillActions,
      ...drugActions,
      ...pharmacyActions,
      ...providerActions,
    ];
    if (allActions.length > 0) {
      publish(callSid, { type: 'actions', actions: allActions });
    }
  }

  // Medicare term lookup (zip-aware once we know the zip).
  const accum = accumulators.get(callSid) ?? emptyExtractedEntities();
  const zipForLink = accum.zipCode ?? undefined;
  const term = lookupMedicareTerm(text, zipForLink ? { zipCode: zipForLink } : {});
  if (term) {
    const shown = shownTopics.get(callSid) ?? new Set<string>();
    if (!shown.has(term.topic)) {
      shown.add(term.topic);
      shownTopics.set(callSid, shown);
      const action: AiAction = {
        type: 'show_info',
        topic: term.topic,
        title: term.title,
        content: term.content,
        ...(term.links ? { links: term.links } : {}),
      };
      publish(callSid, { type: 'actions', actions: [action] });
      addTag(callSid, 'info', { topic: term.topic, title: term.title });
      void auditCallAnalysisEvent({
        callSid,
        userId,
        kind: 'info_card',
        payload: { topic: term.topic, hasZipLink: !!term.links },
      });
    }
  }
}

// --- Phase 3b — action builders --------------------------------------------

/**
 * Map an entity-diff into FE-bound `fill_field` actions. One action per
 * scalar / boolean entity slot in the diff; the FE LeadForm's empty-field
 * rule ensures we never overwrite agent-typed values.
 *
 * `medicareNumber` maps to FormData key `mbi` (the LeadForm uses MBI). All
 * other field names match FormData / Lead-type keys exactly.
 */
function buildFillActions(diff: Partial<ExtractedEntities>): AiAction[] {
  const out: AiAction[] = [];
  const push = (field: string, value: string | boolean, confidence: number): void => {
    out.push({ type: 'fill_field', field, value, confidence });
  };

  if (diff.zipCode) push('zipCode', diff.zipCode, 0.9);
  if (diff.phone) push('phone', diff.phone, 0.9);
  if (diff.email) push('email', diff.email, 0.9);
  if (diff.firstName) push('firstName', diff.firstName, 0.7);
  if (diff.lastName) push('lastName', diff.lastName, 0.7);
  if (diff.medicareNumber) push('mbi', diff.medicareNumber, 0.9);
  if (diff.medicaidNumber) push('medicaidNumber', diff.medicaidNumber, 0.8);
  if (diff.isDualEligible === true) push('isDualEligible', true, 0.85);
  if (diff.isLISEligible === true) push('isLISEligible', true, 0.85);

  return out;
}

/** One `add_drug` action per new drug in the diff. The FE looks up drugId
 *  against its local catalog (`drugService.findDrugByName`) when consuming. */
function buildDrugActions(diff: Partial<ExtractedEntities>): AiAction[] {
  if (!diff.drugs || diff.drugs.length === 0) return [];
  return diff.drugs.map((d) => ({
    type: 'add_drug' as const,
    drugName: d.name,
    ...(d.dosage ? { dosage: d.dosage } : {}),
    ...(d.frequency ? { frequency: d.frequency } : {}),
  }));
}

/** Phase 3b.1 — one `add_pharmacy` per new chain mention. FE consumer
 *  looks up the pharmacy catalog by chainName (and zip when known). */
function buildPharmacyActions(
  newPharmacies: { name: string }[],
): AiAction[] {
  return newPharmacies.map((p) => ({
    type: 'add_pharmacy' as const,
    pharmacyName: p.name,
  }));
}

/** Phase 3b.1 — one `add_provider` per new provider mention. FE consumer
 *  fuzzy-matches against the provider catalog; on miss falls back to
 *  appending a `catalog_miss` note (handled in the agent's post-call
 *  summary path). */
function buildProviderActions(
  newProviders: { name: string }[],
): AiAction[] {
  return newProviders.map((p) => ({
    type: 'add_provider' as const,
    providerName: p.name,
  }));
}

/**
 * Phase 3b.1 — Post-call note summarization.
 *
 * Runs from `stop()` BEFORE unsubscribe + cleanup so the SSE bridge's
 * subscription is still attached and forwards the resulting add_note actions
 * to the FE. Scans the per-call transcript history with the rule-based
 * `summarizeTranscript`; emits one `actions` event carrying every note.
 *
 * Catalog-miss notes are deferred to the FE today — the LeadForm consumer
 * decides whether a pharmacy/provider name resolved, and emits a note via
 * the activity log if it didn't. That's because the catalog lives on the FE
 * (drugData/pharmacyData/providerData are imported FE-side). Backend would
 * need to mirror those JSONs to compute misses server-side; defer to follow-up.
 */
function runPostCallNoteSummary(callSid: string, userId?: string): void {
  const history = transcriptHistory.get(callSid);
  if (!history || history.length === 0) return;

  // QA pipeline — history now holds BOTH speakers; the note summarizer's
  // contract is prospect-side only, so filter here.
  const prospectHistory = history.filter((c) => c.speaker === 'prospect');
  if (prospectHistory.length === 0) return;

  const notes = summarizeTranscript(prospectHistory);
  if (notes.length === 0) return;

  const actions: AiAction[] = notes.map((n) => ({
    type: 'add_note',
    text: n.text,
    category: n.category,
  }));
  publish(callSid, { type: 'actions', actions });
  for (const n of notes) addTag(callSid, 'note', { category: n.category, text: n.text });
  logger.info(
    { callSid, noteCount: notes.length },
    'callAnalysisAgent: post-call notes emitted',
  );

  for (const n of notes) {
    void auditCallAnalysisEvent({
      callSid,
      userId,
      kind: 'entities',
      payload: { kind: 'post_call_note', category: n.category, text: n.text },
    });
  }
}

// --- Test / debug helpers --------------------------------------------------

/** Test-only: reset all per-call state. Used by debug fixture-replay tests. */
export function __resetAllForTests(): void {
  accumulators.clear();
  shownTopics.clear();
  callerNumbers.clear();
  transcriptHistory.clear();
  callMeta.clear();
  callTags.clear();
}
