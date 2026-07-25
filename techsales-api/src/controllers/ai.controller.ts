/**
 * AI controllers. Phase 1 ships only `/api/ai/echo` — an end-to-end
 * pipeline smoke test (LangGraph ReAct agent + one tool + Claude + audit
 * write). Phase 3 adds `/api/ai/recommend` (lead-triggered plan
 * recommendation). Phase 4 adds /explain, /search, /compare, /drug-coverage.
 * Phase 5 adds /chat.
 *
 * Auth/RBAC is intentionally out of scope (per Phase 1 plan).
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { ServiceResponse } from '../repositories/types.js';
import type {
  AIEchoResult,
  AIRecommendation,
  AIExplanation,
  AISearchResult,
  AIComparison,
  AIDrugAnswer,
} from '../ai/types.js';
import { repos } from '../repositories/registry.js';
import type { AiStatsAggregate } from '../repositories/types.js';
import { runEchoAgent } from '../ai/agents/echoAgent.js';
import { runRecommendAgent } from '../ai/agents/recommendAgent.js';
import { runExplainAgent } from '../ai/agents/explainAgent.js';
import { runSearchAgent } from '../ai/agents/searchAgent.js';
import { runCompareAgent } from '../ai/agents/compareAgent.js';
import { runDrugCoverageAgent } from '../ai/agents/drugCoverageAgent.js';
import { streamChatAgent } from '../ai/agents/chatAgent.js';
import { AuditCallbackHandler } from '../ai/llm/callbacks.js';
import { getProviderReadinessError } from '../ai/llm/chatModel.js';
import { logger } from '../config/logger.js';
import { friendlyLlmError } from '../ai/llm/friendlyError.js';

interface EchoRequestBody {
  text?: unknown;
  userId?: unknown;
  memberId?: unknown;
}

interface EchoResponseData extends AIEchoResult {
  interactionId?: string;
}

export async function postEcho(
  req: Request,
  res: Response<ServiceResponse<EchoResponseData>>,
): Promise<void> {
  const body = (req.body ?? {}) as EchoRequestBody;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const userId = typeof body.userId === 'string' ? body.userId : undefined;
  const memberId = typeof body.memberId === 'string' ? body.memberId : undefined;

  if (!text) {
    res.status(400).json({ success: false, error: '`text` is required (non-empty string)' });
    return;
  }

  // Hard precondition: the active provider must be ready (Anthropic needs a
  // key; Ollama needs nothing). Surface a clear 503 here rather than a 500
  // from deeper down.
  if (!(await requireProviderReady(res as Response<ServiceResponse<unknown>>))) return;

  const audit = new AuditCallbackHandler();
  let output = '';
  let agentError: string | undefined;
  try {
    const result = await runEchoAgent({ text, audit });
    output = result.output;
  } catch (err) {
    agentError = err instanceof Error ? err.message : String(err);
    logger.error({ err, text }, 'echoAgent failed');
  }

  // Always flush the audit row — success or failure — so we have observability
  // on every /api/ai/* call regardless of outcome.
  const interactionId = await audit.flush({
    kind: 'echo',
    userId,
    memberId,
    input: { text },
    output: { output },
    error: agentError,
  });

  if (agentError) {
    res.status(500).json({
      success: false,
      error: `Echo agent failed: ${agentError}`,
      data: { input: text, output: '', interactionId },
    });
    return;
  }

  res.json({
    success: true,
    data: { input: text, output, interactionId },
  });
}

// ---------------- shared helpers ----------------

interface ZodFieldError {
  field: string;
  message: string;
}

function formatZodIssues(err: z.ZodError): string {
  const fields: ZodFieldError[] = err.issues.map((i) => ({
    field: i.path.join('.') || '(root)',
    message: i.message,
  }));
  return `Invalid request body: ${fields.map((f) => `${f.field} – ${f.message}`).join('; ')}`;
}

/**
 * Pattern-match well-known LLM provider error shapes so we can return a
 * clean 503/504 instead of a generic 500. We don't import the SDK's error
 * classes — both Anthropic and Ollama churn those across versions.
 */
function classifyAgentError(message: string, label: string): { status: number; userMsg: string } {
  const lower = message.toLowerCase();
  if (
    lower.includes('anthropic_api_key') ||
    lower.includes('authentication') ||
    lower.includes('unauthorized') ||
    lower.includes('401') ||
    lower.includes('invalid api key')
  ) {
    return {
      status: 503,
      userMsg: 'AI provider authentication failed. Check ANTHROPIC_API_KEY or switch AI_LLM_PROVIDER=ollama.',
    };
  }
  if (
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('fetch failed') ||
    lower.includes('11434') ||
    lower.includes('ollama') ||
    (lower.includes('connect') && lower.includes('refused'))
  ) {
    return {
      status: 503,
      userMsg: 'AI provider unreachable. Ollama is not responding on the configured URL.',
    };
  }
  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('etimedout') ||
    lower.includes('aborted')
  ) {
    return {
      status: 504,
      userMsg: `${label} timed out. Try again or reduce the request scope.`,
    };
  }
  return {
    status: 500,
    userMsg: `${label} failed: ${message}`,
  };
}

/**
 * Pre-flight check for the active LLM provider. Sends a 503 + returns false
 * if the provider isn't ready (e.g. anthropic + missing key, or ollama
 * daemon unreachable); otherwise returns true. Async because the ollama
 * branch does a 1.5s reachability probe (cached for 10s).
 */
async function requireProviderReady(res: Response<ServiceResponse<unknown>>): Promise<boolean> {
  const error = await getProviderReadinessError();
  if (error !== null) {
    res.status(503).json({ success: false, error });
    return false;
  }
  return true;
}

// ---------------- /api/ai/recommend ----------------

const recommendBodySchema = z.object({
  leadId: z.string().min(1, 'leadId is required'),
  userId: z.string().min(1).optional(),
});

type RecommendResponseData = AIRecommendation & { interactionId?: string };

export async function recommendHandler(
  req: Request,
  res: Response<ServiceResponse<RecommendResponseData>>,
): Promise<void> {
  const parsed = recommendBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ success: false, error: formatZodIssues(parsed.error) });
    return;
  }
  const { leadId, userId } = parsed.data;

  if (!(await requireProviderReady(res as Response<ServiceResponse<unknown>>))) return;

  try {
    const { result, interactionId } = await runRecommendAgent({
      leadId,
      ...(userId ? { userId } : {}),
    });
    res.json({
      success: true,
      data: { ...result, ...(interactionId ? { interactionId } : {}) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { status, userMsg } = classifyAgentError(message, 'Recommend agent');
    logger.error({ err, leadId }, 'recommendHandler failed');
    res.status(status).json({ success: false, error: userMsg });
  }
}

// ---------------- /api/ai/explain ----------------

const explainBodySchema = z.object({
  planId: z.string().min(1, 'planId is required'),
  mode: z.enum(['agent', 'member']),
  userId: z.string().min(1).optional(),
});

type ExplainResponseData = AIExplanation & { interactionId?: string };

export async function explainHandler(
  req: Request,
  res: Response<ServiceResponse<ExplainResponseData>>,
): Promise<void> {
  const parsed = explainBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ success: false, error: formatZodIssues(parsed.error) });
    return;
  }
  const { planId, mode, userId } = parsed.data;

  if (!(await requireProviderReady(res as Response<ServiceResponse<unknown>>))) return;

  try {
    const { result, interactionId } = await runExplainAgent({
      planId,
      mode,
      ...(userId ? { userId } : {}),
    });
    res.json({
      success: true,
      data: { ...result, ...(interactionId ? { interactionId } : {}) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { status, userMsg } = classifyAgentError(message, 'Explain agent');
    logger.error({ err, planId, mode }, 'explainHandler failed');
    res.status(status).json({ success: false, error: userMsg });
  }
}

// ---------------- /api/ai/search ----------------

const searchBodySchema = z.object({
  query: z.string().min(1, 'query is required'),
  userId: z.string().min(1).optional(),
});

type SearchResponseData = AISearchResult & { interactionId?: string };

export async function searchHandler(
  req: Request,
  res: Response<ServiceResponse<SearchResponseData>>,
): Promise<void> {
  const parsed = searchBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ success: false, error: formatZodIssues(parsed.error) });
    return;
  }
  const { query, userId } = parsed.data;

  if (!(await requireProviderReady(res as Response<ServiceResponse<unknown>>))) return;

  try {
    const { result, interactionId } = await runSearchAgent({
      query,
      ...(userId ? { userId } : {}),
    });
    res.json({
      success: true,
      data: { ...result, ...(interactionId ? { interactionId } : {}) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { status, userMsg } = classifyAgentError(message, 'Search agent');
    logger.error({ err, query }, 'searchHandler failed');
    res.status(status).json({ success: false, error: userMsg });
  }
}

// ---------------- /api/ai/compare ----------------

const compareBodySchema = z.object({
  planIds: z.array(z.string().min(1)).min(2).max(4),
  userId: z.string().min(1).optional(),
});

type CompareResponseData = AIComparison & { interactionId?: string };

export async function compareHandler(
  req: Request,
  res: Response<ServiceResponse<CompareResponseData>>,
): Promise<void> {
  const parsed = compareBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ success: false, error: formatZodIssues(parsed.error) });
    return;
  }
  const { planIds, userId } = parsed.data;

  if (!(await requireProviderReady(res as Response<ServiceResponse<unknown>>))) return;

  try {
    const { result, interactionId } = await runCompareAgent({
      planIds,
      ...(userId ? { userId } : {}),
    });
    res.json({
      success: true,
      data: { ...result, ...(interactionId ? { interactionId } : {}) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { status, userMsg } = classifyAgentError(message, 'Compare agent');
    logger.error({ err, planIds }, 'compareHandler failed');
    res.status(status).json({ success: false, error: userMsg });
  }
}

// ---------------- /api/ai/drug-coverage ----------------

const drugCoverageBodySchema = z.object({
  leadId: z.string().min(1).optional(),
  planIds: z.array(z.string().min(1)).min(1),
  drugIds: z.array(z.string().min(1)).min(0).optional(),
  userId: z.string().min(1).optional(),
});

type DrugCoverageResponseData = AIDrugAnswer & { interactionId?: string };

export async function drugCoverageHandler(
  req: Request,
  res: Response<ServiceResponse<DrugCoverageResponseData>>,
): Promise<void> {
  const parsed = drugCoverageBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ success: false, error: formatZodIssues(parsed.error) });
    return;
  }
  const { leadId, planIds, drugIds, userId } = parsed.data;

  if (!(await requireProviderReady(res as Response<ServiceResponse<unknown>>))) return;

  try {
    const { result, interactionId } = await runDrugCoverageAgent({
      ...(leadId ? { leadId } : {}),
      planIds,
      ...(drugIds ? { drugIds } : {}),
      ...(userId ? { userId } : {}),
    });
    res.json({
      success: true,
      data: { ...result, ...(interactionId ? { interactionId } : {}) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { status, userMsg } = classifyAgentError(message, 'Drug-coverage agent');
    logger.error({ err, leadId, planIds }, 'drugCoverageHandler failed');
    res.status(status).json({ success: false, error: userMsg });
  }
}

// ---------------- /api/ai/chat (SSE streaming) ----------------

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
});

const chatBodySchema = z.object({
  memberId: z.string().min(1, 'memberId is required'),
  planId: z.string().min(1, 'planId is required'),
  history: z.array(chatMessageSchema).default([]),
  message: z.string().min(1, 'message is required'),
  userId: z.string().min(1).optional(),
});

/**
 * SSE streaming chat handler. Body validated before any stream is opened so a
 * 400 / 503 still surfaces as plain JSON. Once we flip to text/event-stream
 * we never re-set the status code; runtime errors are written into the
 * stream itself as `{ type: 'error' }` events.
 */
export async function chatHandler(req: Request, res: Response): Promise<void> {
  const parsed = chatBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ success: false, error: formatZodIssues(parsed.error) });
    return;
  }
  const { memberId, planId, history, message, userId } = parsed.data;

  if (!(await requireProviderReady(res as unknown as Response<ServiceResponse<unknown>>))) return;

  // Switch the response into SSE mode. flushHeaders() forces Express to send
  // the headers right now so the browser can begin reading the stream
  // before the first event arrives.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Heartbeat — many proxies will drop a connection that's silent for 30-60s.
  // SSE comments (lines starting with `:`) are ignored by EventSource clients
  // but keep the TCP socket warm.
  const heartbeat = setInterval(() => {
    try {
      res.write(':\n\n');
    } catch {
      // socket already closed; the next iteration of the loop will exit.
    }
  }, 15_000);

  // Propagate client disconnect into the agent's stream. We listen on the
  // response's `close` event (fires when the underlying socket closes) and
  // gate on `res.writableEnded` so that a normal end-of-stream doesn't get
  // misread as a client-side abort. In Express 5 / Node 20 the request's
  // `close` event fires on response completion as well, which would
  // otherwise abort our own audit flush.
  const abortController = new AbortController();
  const onClose = (): void => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  };
  res.on('close', onClose);

  try {
    for await (const event of streamChatAgent(
      {
        memberId,
        planId,
        history,
        userMessage: message,
        ...(userId ? { userId } : {}),
      },
      abortController.signal,
    )) {
      if (abortController.signal.aborted) break;
      // Each SSE message ends with a blank line. JSON.stringify guarantees
      // single-line data so we don't need to handle multi-line `data:` framing.
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (err) {
    logger.error({ err, memberId, planId }, 'chatHandler stream errored');
    try {
      res.write(`data: ${JSON.stringify({ type: 'error', error: friendlyLlmError(err) })}\n\n`);
    } catch {
      // socket dead — nothing more to do.
    }
  } finally {
    clearInterval(heartbeat);
    res.off('close', onClose);
    try {
      res.end();
    } catch {
      // already ended
    }
  }
}

// ---------------- /api/ai/stats (Phase 6 — read-only metrics) ----------------

/**
 * Read-only aggregate of the last 24h of /api/ai/* calls. Pure metrics on past
 * data, so this endpoint deliberately bypasses the AI_ENABLED guard, the rate
 * limiter, and the daily token cap — it's safe to hit from a curl loop or a
 * monitoring dashboard.
 */
export async function aiStatsHandler(
  _req: Request,
  res: Response<ServiceResponse<AiStatsAggregate>>,
): Promise<void> {
  try {
    const data = await repos.aiInteraction.aggregateLast24h();
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'aiStatsHandler failed');
    res.status(500).json({ success: false, error: `Stats aggregation failed: ${message}` });
  }
}
