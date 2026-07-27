/**
 * QA pipeline — fire-and-forget persistence of a finished call. Called from
 * `stopCallAnalysisByCallSid` with snapshots of the per-call state taken
 * BEFORE the agent's maps are cleared. The call path must never block on —
 * or fail because of — this write; errors are logged and swallowed.
 */
import { logger } from '../../config/logger.js';
import { repos } from '../../repositories/registry.js';
import type { CallLine, CallRecord, CallTag } from '../../models/callRecord.model.js';

const MAX_LINES = 5000;

export interface PersistCallRecordInput {
  callSid: string;
  userId?: string;
  direction: 'inbound' | 'outbound';
  /** epoch ms */
  startedAt: number;
  lines: CallLine[];
  tags: CallTag[];
  /** Training simulator session (SIM- callSid) — enables the trainee's
   *  own-record QA access and the Training cost bucket. */
  simulated?: boolean;
}

export async function persistCallRecord(input: PersistCallRecordInput): Promise<void> {
  // Ghost starts (SSE-only, no transcript, no analysis) aren't worth a row.
  if (input.lines.length === 0 && input.tags.length === 0) return;
  try {
    const now = Date.now();
    const record: CallRecord = {
      callSid: input.callSid,
      ...(input.userId ? { userId: input.userId } : {}),
      direction: input.direction,
      startedAt: new Date(input.startedAt).toISOString(),
      endedAt: new Date(now).toISOString(),
      durationSec: Math.max(0, Math.round((now - input.startedAt) / 1000)),
      lines: input.lines.slice(0, MAX_LINES),
      tags: input.tags,
      flagged: input.tags.some((t) => t.kind === 'compliance'),
      ...(input.simulated ? { simulated: true } : {}),
      qaReview: null,
      createdAt: new Date(now).toISOString(),
    };
    await repos.callRecord.create(record);
    logger.info(
      { callSid: input.callSid, lines: record.lines.length, tags: record.tags.length, flagged: record.flagged },
      'persistCallRecord: call record saved',
    );
  } catch (err) {
    logger.error({ err, callSid: input.callSid }, 'persistCallRecord: write failed (record lost)');
  }
}
