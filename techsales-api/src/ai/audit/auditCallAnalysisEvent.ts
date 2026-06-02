/**
 * Phase 3a — Lightweight audit helper for call-analysis events.
 *
 * Writes one `aiInteractions` row per interesting event (compliance flag,
 * info card surfaced, entities extracted) so that Phase 3d's post-call
 * summary has structured data to chew on without re-walking the transcript.
 *
 * Fire-and-forget: callers `void` the returned promise. Failures log but do
 * NOT throw — the call's audio path doesn't depend on audit succeeding.
 */
import { logger } from '../../config/logger.js';
import { repos } from '../../repositories/registry.js';

export interface AuditEventInput {
  callSid: string;
  userId?: string;
  kind: 'compliance_flag' | 'info_card' | 'entities';
  payload: Record<string, unknown>;
}

export async function auditCallAnalysisEvent(input: AuditEventInput): Promise<void> {
  try {
    await repos.aiInteraction.create({
      kind: 'call_analysis',
      provider: 'stub',
      model: 'stub',
      ...(input.userId ? { userId: input.userId } : {}),
      input: { callSid: input.callSid, eventKind: input.kind },
      output: input.payload,
      tokensIn: 0,
      tokensOut: 0,
      cachedInputTokens: 0,
      cachedReadTokens: 0,
      latencyMs: 0,
      toolCalls: [],
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    // Audit failure must not affect the live-call path. Log + swallow.
    logger.warn(
      { err, callSid: input.callSid, kind: input.kind },
      'auditCallAnalysisEvent: failed to write aiInteraction row',
    );
  }
}
