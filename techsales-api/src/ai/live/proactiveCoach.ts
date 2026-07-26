/**
 * Gap 6 — proactive coaching engine (rule-based, LLM-free).
 *
 * Unlike coachingAdvisor (which REACTS to violations / emotion shifts), this
 * module evaluates admin-editable coaching rules on EVERY final transcript
 * chunk and fires unprompted tips:
 *
 *   talk_ratio        — agent talk share (by chars) ≥ thresholdPct after
 *                       minCallSec into the call
 *   monologue         — ≥ maxConsecutiveAgentUtterances agent finals without
 *                       a prospect line in between
 *   missed_discovery  — a discovery item (zip / medications) still absent
 *                       from the entity accumulator after checkAfterSec
 *
 * Rules live in the `coachingRules` collection (Admin › Coaching Rules) with
 * the same 60s-TTL cache + explicit invalidation pattern as the compliance
 * scanner; first load on an empty collection seeds the defaults.
 *
 * Firing policy (engine-fixed): each rule fires once per call;
 * talk_ratio / monologue re-arm after REARM_MS. Tips reuse the existing
 * coaching delivery: a `coaching` bus event (source 'rule') the Coach card
 * renders, plus a persisted `coaching` tag via the registered tag writer.
 * Pure sync per-chunk path — never blocks or breaks the call.
 */
import { logger } from '../../config/logger.js';
import { repos } from '../../repositories/registry.js';
import { publish } from '../../services/callBus.js';
import type { CoachingRule } from '../../types/index.js';
import type { TranscriptChunk, ExtractedEntities } from '../types/call.types.js';

const CACHE_TTL_MS = 60_000;
const REARM_MS = 120_000;

let cache: { rules: CoachingRule[]; at: number } | null = null;
let seeding: Promise<void> | null = null;

/** Call after any rule mutation so the next call reloads immediately. */
export function invalidateCoachingRulesCache(): void {
  cache = null;
}

/** Sync view of the active-rule cache for the per-chunk hot path. Callers
 *  warm it via `loadCoachingRules()` at call start. */
export function getActiveCoachingRulesSync(): CoachingRule[] {
  return cache?.rules ?? [];
}

/**
 * Load the active rule set (TTL-cached). Never throws — on repo failure
 * returns the last cached set (or empty). Seeds defaults on first load of an
 * empty collection.
 */
export async function loadCoachingRules(): Promise<CoachingRule[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rules;
  try {
    let all = await repos.coachingRule.findAll(false);
    if (all.length === 0) {
      if (!seeding) seeding = seedDefaultRules();
      await seeding;
      seeding = null;
      all = await repos.coachingRule.findAll(false);
    }
    const active = all.filter((r) => r.isActive);
    cache = { rules: active, at: Date.now() };
    return active;
  } catch (err) {
    logger.error({ err }, 'coaching rules: load failed — using stale/empty set');
    return cache?.rules ?? [];
  }
}

// --- Per-call state ---------------------------------------------------------

interface ProactiveState {
  startedAt: number;
  /** Agent finals since the prospect last spoke. */
  consecutiveAgent: number;
  /** ruleId → last fire ts (once-per-call; talk/monologue re-arm). */
  firedAt: Map<string, number>;
}

const states = new Map<string, ProactiveState>();

export function startProactiveCoach(callSid: string): void {
  states.set(callSid, { startedAt: Date.now(), consecutiveAgent: 0, firedAt: new Map() });
}

export function stopProactiveCoach(callSid: string): void {
  states.delete(callSid);
}

export function __resetProactiveCoachForTests(): void {
  states.clear();
  cache = null;
}

/** Tag writer hook — registered by callAnalysisAgent (owner of callTags). */
type TagWriter = (callSid: string, data: Record<string, unknown>) => void;
let tagWriter: TagWriter | null = null;
export function registerProactiveCoachTagWriter(writer: TagWriter): void {
  tagWriter = writer;
}

// --- Per-chunk evaluation ---------------------------------------------------

/**
 * Called for every FINAL chunk (both speakers) from callAnalysisAgent's
 * subscribe callback. Evaluates the cached active rules and fires tips.
 */
export function noteChunkForProactiveCoach(
  callSid: string,
  chunk: TranscriptChunk,
  history: TranscriptChunk[],
  entities: ExtractedEntities,
): void {
  const state = states.get(callSid);
  if (!state) return;

  if (chunk.speaker === 'agent') state.consecutiveAgent += 1;
  else if (chunk.speaker === 'prospect') state.consecutiveAgent = 0;

  const rules = getActiveCoachingRulesSync();
  if (rules.length === 0) return;

  const now = Date.now();
  const elapsedSec = (now - state.startedAt) / 1000;

  for (const rule of rules) {
    const lastFired = state.firedAt.get(rule.ruleId);
    if (lastFired !== undefined) {
      if (rule.type === 'missed_discovery') continue; // once per call
      if (now - lastFired < REARM_MS) continue;
    }

    let fires = false;
    let focus: 'pacing' | 'discovery' = 'pacing';

    switch (rule.type) {
      case 'talk_ratio': {
        const minSec = rule.params.minCallSec ?? 60;
        const pct = rule.params.thresholdPct ?? 75;
        if (elapsedSec < minSec) break;
        let agentChars = 0;
        let totalChars = 0;
        for (const c of history) {
          totalChars += c.text.length;
          if (c.speaker === 'agent') agentChars += c.text.length;
        }
        fires = totalChars > 0 && (agentChars / totalChars) * 100 >= pct;
        break;
      }
      case 'monologue': {
        const max = rule.params.maxConsecutiveAgentUtterances ?? 6;
        if (state.consecutiveAgent >= max) {
          fires = true;
          state.consecutiveAgent = 0;
        }
        break;
      }
      case 'missed_discovery': {
        const after = rule.params.checkAfterSec ?? 120;
        if (elapsedSec < after) break;
        const item = rule.params.item ?? 'zip';
        fires =
          item === 'zip'
            ? !entities.zipCode
            : !(entities.drugs && entities.drugs.length > 0);
        if (fires) focus = 'discovery';
        break;
      }
    }

    if (!fires) continue;
    state.firedAt.set(rule.ruleId, now);
    publish(callSid, { type: 'coaching', source: 'rule', tip: rule.tip, focus, ts: now });
    tagWriter?.(callSid, {
      tip: rule.tip,
      focus,
      trigger: rule.type,
      ruleId: rule.ruleId,
      ruleName: rule.name,
    });
    logger.info(
      { callSid, ruleId: rule.ruleId, type: rule.type },
      'proactiveCoach: rule fired',
    );
  }
}

// --- Default seed -----------------------------------------------------------

const DEFAULT_RULES: Array<Omit<CoachingRule, 'ruleId' | 'createdAt'>> = [
  {
    name: 'Talk-ratio imbalance',
    type: 'talk_ratio',
    tip: "You've been doing most of the talking — pause and ask an open question to get them engaged.",
    params: { thresholdPct: 75, minCallSec: 60 },
    isActive: true,
  },
  {
    name: 'Long agent monologue',
    type: 'monologue',
    tip: "Long stretch without the prospect speaking — check in: \"Does that make sense so far?\"",
    params: { maxConsecutiveAgentUtterances: 6 },
    isActive: true,
  },
  {
    name: 'Missing zip code',
    type: 'missed_discovery',
    tip: "You haven't captured their zip code yet — plan availability depends on it.",
    params: { item: 'zip', checkAfterSec: 120 },
    isActive: true,
  },
  {
    name: 'Missing medications',
    type: 'missed_discovery',
    tip: "Ask what medications they take — drug coverage is key to the right plan match.",
    params: { item: 'medications', checkAfterSec: 180 },
    isActive: true,
  },
];

async function seedDefaultRules(): Promise<void> {
  try {
    for (const rule of DEFAULT_RULES) {
      await repos.coachingRule.create(rule);
    }
    logger.info({ count: DEFAULT_RULES.length }, 'coaching rules: seeded defaults');
  } catch (err) {
    logger.error({ err }, 'coaching rules: default seed failed');
  }
}
