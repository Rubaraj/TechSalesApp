/**
 * Phase 3a — Dev-only fixture replay route.
 *
 * `POST /api/_debug/inject-transcript` publishes one or more transcript
 * chunks to `callBus` as if they came from Deepgram, with a small inter-
 * chunk delay. Lets the executor exercise the callAnalysisAgent → SSE → FE
 * path without paying Twilio + Deepgram per regex tweak.
 *
 * Guarded by `NODE_ENV !== 'production'` — module-asserted; route mount
 * itself is skipped when the env is prod (see `routes/index.ts`).
 *
 * Note: this route does NOT start the callAnalysisAgent — that lives in the
 * Twilio Media Stream WS handler keyed off the Twilio `start` event. To
 * exercise the agent in isolation, the test caller can call
 * `startCallAnalysis()` themselves, OR rely on a real call's agent context.
 * For agent-less tests, see the inline helper at the bottom.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { publish, endCall as endCallBus } from '../../services/callBus.js';
import {
  startCallAnalysis,
  stopCallAnalysisByCallSid,
} from '../../ai/agents/callAnalysisAgent.js';

const ChunkSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  timestamp: z.number().optional(),
  isFinal: z.boolean().default(true),
  speaker: z.enum(['agent', 'prospect', 'unknown']),
  confidence: z.number().optional(),
});

const BodySchema = z.object({
  callSid: z.string(),
  chunks: z.array(ChunkSchema).min(1),
  /** Delay between chunks in ms (default 0). Useful for testing dedup. */
  delayMs: z.number().int().nonnegative().optional(),
  /** Whether to start the callAnalysisAgent first (default true). When false,
   *  the chunks publish into a callBus with no agent subscribed — only the
   *  SSE bridge sees them. */
  startAgent: z.boolean().optional(),
  /** QA pipeline — attribute the replayed call to an agent + set direction
   *  so the persisted callRecord and supervisor feed carry them. */
  userId: z.string().optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
});

export const injectTranscriptRouter: Router = Router();

// Hard-block in production. Belt + suspenders — `routes/index.ts` also
// should only mount this router when not in prod, but assert here too.
injectTranscriptRouter.use((_req, res, next) => {
  if (env.NODE_ENV === 'production') {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }
  next();
});

injectTranscriptRouter.post('/inject-transcript', async (req: Request, res: Response) => {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Invalid body',
      issues: parsed.error.issues,
    });
    return;
  }
  const { callSid, chunks, delayMs = 0, startAgent = true, userId, direction } = parsed.data;

  let stopAgent: (() => void) | null = null;
  if (startAgent) {
    try {
      const handle = startCallAnalysis({
        callSid,
        ...(userId ? { userId } : {}),
        ...(direction ? { direction } : {}),
      });
      stopAgent = handle.stop;
    } catch (err) {
      logger.error({ err }, 'inject-transcript: failed to start agent');
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'agent start failed',
      });
      return;
    }
  }

  logger.info(
    { callSid, count: chunks.length, delayMs, startAgent },
    'inject-transcript: replaying fixture',
  );

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    publish(callSid, {
      type: 'transcript',
      chunk: {
        id: c.id ?? `fixture:${callSid}:${i}`,
        text: c.text,
        timestamp: c.timestamp ?? Date.now(),
        isFinal: c.isFinal,
        speaker: c.speaker,
        ...(typeof c.confidence === 'number' ? { confidence: c.confidence } : {}),
      },
    });
    if (delayMs > 0 && i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Give the agent a tick to process the last chunk's async paths
  // (entityExtractor awaits lookup table load on cold start).
  await new Promise((r) => setTimeout(r, 100));

  res.json({
    success: true,
    data: { callSid, chunksPublished: chunks.length, agentStarted: startAgent },
  });

  // Note: deliberately NOT stopping the agent here — the SSE subscriber
  // (if any) is still consuming. Test callers can POST a `stop` route or
  // simply let the next call's start create new state. For one-shot tests
  // tear down via a separate request.
  void stopAgent;
});

/** Stop the agent for a given call (frees the accumulator + dedup set).
 *  Phase 3b.1 — also runs the post-call note summarizer via
 *  `stopCallAnalysisByCallSid` BEFORE publishing the 'ended' status so the
 *  resulting add_note actions reach the SSE subscriber before it closes. */
injectTranscriptRouter.post('/stop-call', (req: Request, res: Response) => {
  const { callSid } = (req.body ?? {}) as { callSid?: string };
  if (!callSid) {
    res.status(400).json({ success: false, error: 'callSid required' });
    return;
  }
  try {
    stopCallAnalysisByCallSid(callSid);
  } catch (err) {
    logger.warn({ err, callSid }, 'stop-call: agent stop threw');
  }
  // Small delay so the add_note publish settles into the SSE bridge before
  // we close the stream with 'ended'. Then tear the emitter down —
  // previously omitted, which leaked one EventEmitter per debug call.
  setTimeout(() => {
    publish(callSid, { type: 'status', status: 'ended', at: Date.now() });
    endCallBus(callSid);
  }, 50);
  res.json({ success: true });
});
