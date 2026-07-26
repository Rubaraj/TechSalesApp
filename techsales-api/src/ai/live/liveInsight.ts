/**
 * Live insight — the SINGLE periodic LLM loop for in-call intelligence.
 *
 * Merges what used to be two independent Haiku loops (emotionTracker's
 * sampler + coachingAdvisor's reactive tip generator) into ONE structured
 * call on ONE clock, and adds an LLM compliance double-check for phrasing
 * the regex rules miss:
 *
 *   every TICK_MS (15s), if new final lines arrived since the last run:
 *     one Haiku call over the last WINDOW_LINES returns
 *       { emotion, confidence, rationale, tip|null, focus|null,
 *         complianceConcern|null }
 *
 * Delivery reuses the existing wire events — zero FE changes:
 *   - emotion        → per-call `emotion` event every run; on CHANGE also
 *                      an `emotion` tag + `emotion_shift` on the global bus
 *   - tip            → `coaching` event (source 'ai') + `coaching` tag,
 *                      capped at TIPS_PER_CALL
 *   - concern        → `compliance_flag` action + tag + global event
 *                      (ruleName "AI compliance review"), deduped by phrase
 *
 * Reactivity is preserved where it's free: a regex violation still publishes
 * its instant canned tip immediately via `noteViolationForInsight`; the
 * violation detail is queued as trigger context for the NEXT tick's richer
 * tip. The first prospect utterance triggers an immediate early run (same
 * "first read fast" behavior the emotion tracker had).
 *
 * The rule-based engines (complianceCheck regex scan, proactiveCoach
 * thresholds) are untouched — they're free, instant, and admin-controlled.
 *
 * Never blocks the call path: provider==='stub' or any error → skip
 * silently (one debug log). State + timer cleaned in stopCallAnalysis.
 */
import { z } from 'zod';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { getChatModel, getActiveProvider } from '../llm/chatModel.js';
import { AuditCallbackHandler } from '../llm/callbacks.js';
import { publish, publishGlobal, type ProspectEmotion } from '../../services/callBus.js';
import type { TranscriptChunk, AiAction } from '../types/call.types.js';

const TICK_MS = 15_000;
const WINDOW_LINES = 10;
const TIPS_PER_CALL = 5;

const InsightSchema = z.object({
  emotion: z
    .enum(['positive', 'neutral', 'confused', 'frustrated', 'upset'])
    .describe("The prospect's current emotional state"),
  confidence: z.number().min(0).max(1).describe('Emotion confidence, 0-1'),
  rationale: z.string().max(200).describe('One short sentence of emotion evidence'),
  tip: z
    .string()
    .max(220)
    .nullable()
    .describe(
      'ONE actionable coaching sentence the agent can apply in their next ' +
        'sentence (second person, no preamble) — or null when nothing is ' +
        'genuinely worth interrupting the agent for',
    ),
  focus: z
    .enum(['compliance', 'empathy', 'clarity', 'pacing', 'discovery'])
    .nullable()
    .describe('What the tip addresses; null when tip is null'),
  complianceConcern: z
    .object({
      phrase: z.string().max(120).describe('Short verbatim agent quote of concern'),
      issue: z.string().max(200).describe('Which CMS marketing rule it likely violates'),
      suggestion: z.string().max(200).describe('Compliant rephrase'),
    })
    .nullable()
    .describe(
      'A LIKELY CMS marketing-rule violation in AGENT speech that simple ' +
        'keyword rules would miss (paraphrased superlatives, implied ' +
        'guarantees, soft pressure) — null unless clearly problematic',
    ),
});

const SYSTEM_PROMPT =
  'You are the live analyst for a Medicare tele-sales call. You are given the ' +
  'last transcript lines (both speakers) and sometimes a TRIGGER note about a ' +
  'rule violation that just fired. Return ALL of the following in one shot:\n' +
  "1) emotion — the PROSPECT's current emotional state, weighting their most " +
  'recent lines heaviest. confused = losing track; frustrated = irritated with ' +
  'the process or agent; upset = distressed or angry. Be conservative: prefer ' +
  'neutral unless the words clearly signal otherwise.\n' +
  '2) tip — at most ONE short coaching tip for the AGENT, only when something ' +
  'is genuinely worth acting on right now (a trigger, a negative emotion, an ' +
  'obvious missed opportunity). Second person, no judgment, never suggest ' +
  'anything that violates CMS marketing rules. Otherwise null.\n' +
  '3) complianceConcern — a LIKELY CMS violation in AGENT speech that keyword ' +
  'rules would miss (paraphrased superlatives, implied guarantees, soft ' +
  'pressure, disparaging Original Medicare). Skip anything listed under ' +
  'ALREADY FLAGGED. Be conservative: null unless clearly problematic.';

// --- Hooks (registered once by callAnalysisAgent; avoids import cycle) ------

type TagWriter = (callSid: string, data: Record<string, unknown>) => void;

interface InsightHooks {
  historyReader: (callSid: string) => TranscriptChunk[];
  userIdReader: (callSid: string) => string | undefined;
  emotionTagWriter: TagWriter;
  coachingTagWriter: TagWriter;
  complianceTagWriter: TagWriter;
}

let hooks: InsightHooks | null = null;
export function wireLiveInsight(h: InsightHooks): void {
  hooks = h;
}

// --- Per-call state ---------------------------------------------------------

interface InsightState {
  timer: NodeJS.Timeout;
  lastEmotion: ProspectEmotion | null;
  /** History length at the last run — a tick with no new lines is skipped. */
  lastLineCount: number;
  tipCount: number;
  inFlight: boolean;
  /** True once the first run happened (first prospect line fast-paths it). */
  hasSampled: boolean;
  /** Violation context queued for the next run's prompt. */
  pendingTrigger: string | null;
  /** Normalized phrases already flagged (regex or LLM) — dedup + prompt. */
  flaggedPhrases: Set<string>;
}

const states = new Map<string, InsightState>();

export function startLiveInsight(callSid: string): void {
  const timer = setInterval(() => void runTick(callSid), TICK_MS);
  states.set(callSid, {
    timer,
    lastEmotion: null,
    lastLineCount: 0,
    tipCount: 0,
    inFlight: false,
    hasSampled: false,
    pendingTrigger: null,
    flaggedPhrases: new Set(),
  });
}

export function stopLiveInsight(callSid: string): void {
  const state = states.get(callSid);
  if (state) clearInterval(state.timer);
  states.delete(callSid);
}

export function __resetLiveInsightForTests(): void {
  for (const state of states.values()) clearInterval(state.timer);
  states.clear();
}

/** First prospect utterance → immediate early run (don't wait for the tick). */
export function noteProspectChunkForInsight(callSid: string): void {
  const state = states.get(callSid);
  if (!state || state.hasSampled) return;
  void runTick(callSid);
}

/**
 * A regex compliance violation fired. Publishes the instant canned tip NOW
 * (free, works in stub mode) and queues the violation as trigger context so
 * the next tick's LLM tip addresses it.
 */
export function noteViolationForInsight(
  callSid: string,
  input: { detail: string; instantTip: string; phrase: string },
): void {
  const state = states.get(callSid);
  if (!state) return;
  publish(callSid, {
    type: 'coaching',
    source: 'rule',
    tip: input.instantTip,
    focus: 'compliance',
    ts: Date.now(),
  });
  state.pendingTrigger = input.detail;
  state.flaggedPhrases.add(normalize(input.phrase));
}

// --- The merged tick --------------------------------------------------------

async function runTick(callSid: string): Promise<void> {
  const state = states.get(callSid);
  if (!state || state.inFlight || !hooks) return;
  if (getActiveProvider() === 'stub') return;

  const history = hooks.historyReader(callSid);
  if (history.length === 0) return;
  // Nothing new since the last run and no queued trigger → skip the tick.
  if (history.length === state.lastLineCount && !state.pendingTrigger) return;

  state.inFlight = true;
  state.hasSampled = true;
  state.lastLineCount = history.length;
  const trigger = state.pendingTrigger;
  state.pendingTrigger = null;

  try {
    await analyze(callSid, state, history, trigger);
  } catch (err) {
    logger.debug({ err, callSid }, 'liveInsight: tick failed (skipped)');
  } finally {
    const s = states.get(callSid);
    if (s) s.inFlight = false;
  }
}

async function analyze(
  callSid: string,
  state: InsightState,
  history: TranscriptChunk[],
  trigger: string | null,
): Promise<void> {
  const window = history.slice(-WINDOW_LINES);
  const transcript = window
    .map((c) => `${c.speaker === 'agent' ? 'AGENT' : 'PROSPECT'}: ${c.text}`)
    .join('\n');
  const flagged = [...state.flaggedPhrases];
  const userId = hooks?.userIdReader(callSid);

  const parts = [
    trigger ? `TRIGGER: ${trigger}` : null,
    flagged.length > 0 ? `ALREADY FLAGGED: ${flagged.join(' | ')}` : null,
    `RECENT TRANSCRIPT:\n${transcript}`,
  ].filter(Boolean);

  const auditCb = new AuditCallbackHandler();
  const llm = getChatModel({
    ...(env.AI_MODEL_QA ? { modelOverride: env.AI_MODEL_QA } : {}),
    temperature: 0.2,
  });
  const structured = llm.withStructuredOutput(InsightSchema, { name: 'live_insight' });
  const result = await structured.invoke(
    [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(parts.join('\n\n'))],
    { callbacks: [auditCb] },
  );
  void auditCb.flush({
    kind: 'call_live_insight',
    ...(userId ? { userId } : {}),
    input: { callSid, lines: window.length, trigger },
    output: result,
  });

  const live = states.get(callSid);
  if (!live) return; // call ended while analyzing

  const ts = Date.now();

  // 1) Emotion — badge event every run; tag + supervisor event on change.
  const emotion = result.emotion as ProspectEmotion;
  publish(callSid, { type: 'emotion', emotion, confidence: result.confidence, ts });
  if (emotion !== live.lastEmotion) {
    const prevEmotion = live.lastEmotion;
    live.lastEmotion = emotion;
    publishGlobal({
      type: 'emotion_shift',
      callSid,
      ...(userId ? { userId } : {}),
      emotion,
      prevEmotion,
      ts,
    });
    hooks?.emotionTagWriter(callSid, {
      from: prevEmotion,
      to: emotion,
      confidence: result.confidence,
      rationale: result.rationale,
    });
  }

  // 2) Coaching tip — capped per call; null means "nothing worth saying".
  if (result.tip && live.tipCount < TIPS_PER_CALL) {
    live.tipCount += 1;
    const focus = result.focus ?? 'clarity';
    publish(callSid, { type: 'coaching', source: 'ai', tip: result.tip, focus, ts });
    hooks?.coachingTagWriter(callSid, {
      tip: result.tip,
      focus,
      trigger: trigger ? 'compliance' : 'insight',
    });
  }

  // 3) LLM compliance double-check — same delivery pipeline as regex flags.
  const concern = result.complianceConcern;
  if (concern && !live.flaggedPhrases.has(normalize(concern.phrase))) {
    live.flaggedPhrases.add(normalize(concern.phrase));
    const action: AiAction = {
      type: 'compliance_flag',
      phrase: concern.phrase,
      rule: `AI review: ${concern.issue}`,
      suggestion: concern.suggestion,
      severity: 'warn',
      ruleName: 'AI compliance review',
    };
    publish(callSid, { type: 'actions', actions: [action] });
    hooks?.complianceTagWriter(callSid, {
      phrase: concern.phrase,
      rule: `AI review: ${concern.issue}`,
      suggestion: concern.suggestion,
      severity: 'warn',
      ruleName: 'AI compliance review',
    });
    publishGlobal({
      type: 'compliance_flag',
      callSid,
      ...(userId ? { userId } : {}),
      phrase: concern.phrase,
      rule: `AI review: ${concern.issue}`,
      suggestion: concern.suggestion,
      severity: 'warn',
      ts,
    });
    logger.info({ callSid, phrase: concern.phrase }, 'liveInsight: AI compliance concern');
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
