/**
 * QA pipeline — THE single shared call-QA evaluator (explicitly a service,
 * not an agent; user decision). Invoked by BOTH the supervisor dashboard's
 * REST endpoint and Atlas's admin-gated `run_qa_review` tool. One structured
 * LLM call: transcript + tags + deterministic metrics + rubric → scorecard.
 *
 * Idempotent: re-running a call overwrites its qaReview. A module-level
 * in-flight set rejects concurrent duplicate runs for the same call.
 */
import { z } from 'zod';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { repos } from '../../repositories/registry.js';
import { getChatModel, getActiveModel } from '../llm/chatModel.js';
import { AuditCallbackHandler } from '../llm/callbacks.js';
import { publishGlobal } from '../../services/callBus.js';
import { QA_SYSTEM_PROMPT, buildQaUserPrompt } from '../prompts/callQaPrompt.js';
import { computeCallMetrics } from './computeCallMetrics.js';
import type { CallRecord, QaScorecard } from '../../models/callRecord.model.js';

const dimensionSchema = z.object({
  score: z.number().min(0).max(100),
  evidence: z.string(),
});

const ScorecardSchema = z.object({
  overallScore: z.number().min(0).max(100),
  dimensions: z.object({
    compliance: dimensionSchema,
    discovery: dimensionSchema,
    communication: dimensionSchema,
    nextSteps: dimensionSchema,
  }),
  strengths: z.array(z.string()),
  coachingPoints: z.array(z.string()),
  disclosureChecklist: z.array(
    z.object({ item: z.string(), met: z.boolean(), evidence: z.string() }),
  ),
});

const inFlight = new Set<string>();

export class QaReviewConflictError extends Error {}
export class QaReviewNotFoundError extends Error {}

export interface RunQaReviewResult {
  scorecard: QaScorecard;
  reviewedAt: string;
  model: string;
  interactionId?: string;
}

export async function runQaReview(
  callSid: string,
  requestedBy: string,
): Promise<RunQaReviewResult> {
  const record = (await repos.callRecord.findByCallSid(callSid)) as CallRecord | null;
  if (!record) throw new QaReviewNotFoundError(`No call record for ${callSid}`);

  if (inFlight.has(callSid)) {
    throw new QaReviewConflictError(`QA review already running for ${callSid}`);
  }
  inFlight.add(callSid);
  try {
    const auditCb = new AuditCallbackHandler();
    const modelOverride = env.AI_MODEL_QA;
    const llm = getChatModel({
      ...(modelOverride ? { modelOverride } : {}),
      temperature: 0.2,
    });

    const structured = llm.withStructuredOutput(ScorecardSchema, { name: 'qa_scorecard' });
    const metrics = computeCallMetrics(record.lines);
    const userPrompt = buildQaUserPrompt({
      lines: record.lines,
      tags: record.tags,
      metrics,
      direction: record.direction,
      durationSec: record.durationSec,
    });

    const scorecard = (await structured.invoke(
      [new SystemMessage(QA_SYSTEM_PROMPT), new HumanMessage(userPrompt)],
      { callbacks: [auditCb] },
    )) as QaScorecard;

    const interactionId = await auditCb.flush({
      kind: 'call_qa',
      userId: requestedBy,
      input: { callSid, agentUserId: record.userId, durationSec: record.durationSec },
      output: scorecard,
    });

    const reviewedAt = new Date().toISOString();
    const model = modelOverride || getActiveModel();
    await repos.callRecord.setQaReview(callSid, {
      ...scorecard,
      reviewedAt,
      reviewedBy: requestedBy,
      model,
      ...(interactionId ? { interactionId } : {}),
    });

    publishGlobal({ type: 'qa_completed', callSid, overallScore: scorecard.overallScore });
    logger.info(
      { callSid, overallScore: scorecard.overallScore, requestedBy },
      'runQaReview: scorecard persisted',
    );

    return { scorecard, reviewedAt, model, ...(interactionId ? { interactionId } : {}) };
  } finally {
    inFlight.delete(callSid);
  }
}
