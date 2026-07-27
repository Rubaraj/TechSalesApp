/**
 * AI cost analysis — pricing tables + pure cost math.
 *
 * All figures are ESTIMATES from published list prices; the OpenRouter
 * passthrough may add a small fee on top. Token cost uses the 4-way
 * split the audit rows carry:
 *   - base input   = tokensIn − cachedInputTokens (cache WRITES are
 *                    counted inside tokensIn by the SDK)
 *   - cache write  = cachedInputTokens × 1.25 × input rate (5-min TTL;
 *                    1h-TTL writes would be ×2 — this app uses default)
 *   - cache read   = cachedReadTokens × 0.10 × input rate (NOT part of
 *                    tokensIn)
 *   - output       = tokensOut × output rate
 *
 * Model-id normalization: rows carry OpenRouter slugs
 * ("anthropic/claude-haiku-4.5"), bare ids, 'stub', or — for ALL atlas
 * agent rows — LangChain's serialized class id
 * ("langchain.chat_models.anthropic.ChatAnthropic"). Unmapped ids on
 * provider 'anthropic' are FALLBACK-priced at the default model's
 * (haiku) rates rather than silently $0 — the biggest bucket would
 * otherwise vanish; they're surfaced in dataQuality.fallbackModels.
 */
import type { AiInteractionKind } from '../llm/callbacks.js';

/** USD per million tokens (input, output). Verify against current
 *  anthropic.com/pricing when demoing. */
export const PRICING: Record<string, { inPerMTok: number; outPerMTok: number }> = {
  'claude-haiku-4-5': { inPerMTok: 1, outPerMTok: 5 },
  'claude-opus-4-7': { inPerMTok: 5, outPerMTok: 25 },
  'claude-sonnet-4-6': { inPerMTok: 3, outPerMTok: 15 },
};

export const CACHE_WRITE_MULT = 1.25;
export const CACHE_READ_MULT = 0.1;

/** Fallback rates for unmapped anthropic-provider ids (the configured
 *  default model tier). */
const FALLBACK_KEY = 'claude-haiku-4-5';

/** Deepgram nova-3 streaming pay-as-you-go, USD per audio minute.
 *  Verify against deepgram.com/pricing when demoing. */
export const DEEPGRAM_PER_MIN = 0.0077;
/** One Deepgram stream per Twilio track (inbound + outbound) — a
 *  1-minute call transcribes 2 minutes of audio. */
export const STREAMS_PER_CALL = 2;

export type CostBucket = 'copilot' | 'qa';

/** Kind → bucket. 'transcript' is derived from callRecords, not rows. */
export const BUCKET_BY_KIND: Record<AiInteractionKind, CostBucket> = {
  echo: 'copilot',
  recommend: 'copilot',
  explain: 'copilot',
  search: 'copilot',
  compare: 'copilot',
  'drug-coverage': 'copilot',
  chat: 'copilot',
  atlas: 'copilot',
  call_analysis: 'qa', // zero-token stub rows — $0 by construction
  call_qa: 'qa',
  call_emotion: 'qa',
  call_coaching: 'qa',
  call_live_insight: 'qa',
};

export interface ModelPriceResolution {
  key: string;
  inPerMTok: number;
  outPerMTok: number;
  /** True when priced via the anthropic fallback tier (unmapped id). */
  fallback: boolean;
  /** True when priced $0 (stub / non-anthropic unknown). */
  unpriced: boolean;
}

export function normalizeModelId(model: string | undefined | null): string {
  const raw = String(model ?? '').trim();
  const afterSlash = raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw;
  return afterSlash.replace(/(\d)\.(\d)/g, '$1-$2').toLowerCase();
}

export function resolveModelPrice(
  model: string | undefined | null,
  provider: string | undefined | null,
): ModelPriceResolution {
  const key = normalizeModelId(model);
  const priced = PRICING[key];
  if (priced) return { key, ...priced, fallback: false, unpriced: false };
  if (key === 'stub' || provider === 'stub') {
    return { key: key || 'stub', inPerMTok: 0, outPerMTok: 0, fallback: false, unpriced: true };
  }
  if (provider === 'anthropic') {
    const fb = PRICING[FALLBACK_KEY];
    return { key, ...fb, fallback: true, unpriced: false };
  }
  return { key: key || 'unknown', inPerMTok: 0, outPerMTok: 0, fallback: false, unpriced: true };
}

export interface TokenFields {
  tokensIn?: number;
  tokensOut?: number;
  cachedInputTokens?: number;
  cachedReadTokens?: number;
}

/** USD cost of one audit row. */
export function costOfRow(
  row: TokenFields & { model?: string; provider?: string },
): number {
  const price = resolveModelPrice(row.model, row.provider);
  if (price.unpriced) return 0;
  const tokensIn = row.tokensIn ?? 0;
  const tokensOut = row.tokensOut ?? 0;
  const cacheWrite = row.cachedInputTokens ?? 0;
  const cacheRead = row.cachedReadTokens ?? 0;
  const baseInput = Math.max(0, tokensIn - cacheWrite);
  const usd =
    (baseInput * price.inPerMTok +
      cacheWrite * price.inPerMTok * CACHE_WRITE_MULT +
      cacheRead * price.inPerMTok * CACHE_READ_MULT +
      tokensOut * price.outPerMTok) /
    1_000_000;
  return usd;
}

/** USD transcription cost of one call (both Deepgram streams). */
export function transcriptCost(durationSec: number): number {
  return (Math.max(0, durationSec) / 60) * STREAMS_PER_CALL * DEEPGRAM_PER_MIN;
}
