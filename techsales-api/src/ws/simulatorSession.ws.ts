/**
 * Training simulator — per-session bridge between the trainee's browser and
 * Deepgram's Voice Agent (one cloud WS bundling STT → persona LLM → TTS
 * with barge-in orchestration).
 *
 *   browser mic (linear16@16k binary)  →  this handler  →  DG sendMedia
 *   DG TTS audio (linear16@24k binary) →  this handler  →  browser
 *   DG ConversationText (both roles)   →  callBus transcript chunks under
 *                                         a SIM- callSid → the ENTIRE
 *                                         existing analysis pipeline
 *                                         (compliance, coaching, insight,
 *                                         emotion, supervisor, persist, QA)
 *
 * NOTE: connects to DG with RAW `ws`, not @deepgram/sdk's agent socket —
 * the SDK (5.3.0) JSON.parses every incoming frame, so binary TTS audio
 * crashes it, and its auto-reconnect silently drops Settings. Speaker
 * mapping: DG role 'user' = the trainee = 'agent' in our pipeline; role
 * 'assistant' = the persona = 'prospect'.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { repos } from '../repositories/registry.js';
import { publish, endCall as endCallBus } from '../services/callBus.js';
import { startCallAnalysis } from '../ai/agents/callAnalysisAgent.js';
import { getPersona } from '../ai/simulator/personas.js';
import type { TranscriptChunk } from '../ai/types/call.types.js';

const DG_AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const KEEPALIVE_MS = 8_000;
/** Mic frames buffered while waiting for SettingsApplied (drop-oldest). */
const MAX_PENDING_FRAMES = 500;

interface SessionCtx {
  simSid: string;
  userId: string;
  browserWs: WebSocket;
  dgWs: WebSocket | null;
  dgReady: boolean;
  pendingMic: Buffer[];
  analysisStop: (() => void) | null;
  keepalive: NodeJS.Timeout | null;
  capTimer: NodeJS.Timeout | null;
  chunkCounter: number;
  closed: boolean;
}

function sendBrowserJson(ctx: SessionCtx, payload: Record<string, unknown>): void {
  if (ctx.browserWs.readyState === WebSocket.OPEN) {
    ctx.browserWs.send(JSON.stringify(payload));
  }
}

/**
 * Idempotent teardown funnel — mirrors twilioMediaStream's closeStreams
 * ordering: analysis stop runs BEFORE publishing 'ended' (the post-call
 * note summary's publish needs the SSE subscriber still attached).
 */
function teardown(ctx: SessionCtx, reason: string): void {
  if (ctx.closed) return;
  ctx.closed = true;
  if (ctx.keepalive) clearInterval(ctx.keepalive);
  if (ctx.capTimer) clearTimeout(ctx.capTimer);
  try {
    ctx.analysisStop?.();
  } catch (err) {
    logger.error({ err, simSid: ctx.simSid }, 'simulator: analysis stop threw');
  }
  try {
    ctx.dgWs?.close();
  } catch {
    // already closed
  }
  sendBrowserJson(ctx, { type: 'ended', reason });
  try {
    if (ctx.browserWs.readyState === WebSocket.OPEN) ctx.browserWs.close();
  } catch {
    // already closed
  }
  publish(ctx.simSid, { type: 'status', status: 'ended', at: Date.now() });
  endCallBus(ctx.simSid);
  logger.info({ simSid: ctx.simSid, reason }, 'simulator: session ended');
}

function buildSettings(personaId: string | undefined): Record<string, unknown> {
  const persona = getPersona(personaId);
  return {
    type: 'Settings',
    audio: {
      input: { encoding: 'linear16', sample_rate: 16000 },
      output: { encoding: 'linear16', sample_rate: 24000, container: 'none' },
    },
    agent: {
      language: 'en',
      greeting: persona.greeting,
      listen: { provider: { type: 'deepgram', model: 'nova-3' } },
      think: {
        provider: { type: 'anthropic', model: env.SIMULATOR_THINK_MODEL },
        prompt: persona.prompt,
      },
      speak: { provider: { type: 'deepgram', model: persona.voice } },
    },
  };
}

function handleDgJson(ctx: SessionCtx, raw: string): void {
  let msg: { type?: string; role?: string; content?: string; description?: string };
  try {
    msg = JSON.parse(raw) as typeof msg;
  } catch {
    return;
  }
  switch (msg.type) {
    case 'SettingsApplied': {
      ctx.dgReady = true;
      for (const frame of ctx.pendingMic) ctx.dgWs?.send(frame);
      ctx.pendingMic = [];
      sendBrowserJson(ctx, { type: 'ready' });
      return;
    }
    case 'ConversationText': {
      const text = (msg.content ?? '').trim();
      if (!text) return;
      // DG 'user' = the trainee (our 'agent'); 'assistant' = the persona.
      const speaker = msg.role === 'user' ? 'agent' : 'prospect';
      const chunk: TranscriptChunk = {
        id: `${ctx.simSid}:${msg.role ?? 'x'}:${ctx.chunkCounter++}`,
        text,
        timestamp: Date.now(),
        isFinal: true,
        speaker,
      };
      publish(ctx.simSid, { type: 'transcript', chunk });
      return;
    }
    case 'UserStartedSpeaking':
      // Barge-in: the browser must flush its queued persona audio.
      sendBrowserJson(ctx, { type: 'barge_in' });
      return;
    case 'AgentStartedSpeaking':
      sendBrowserJson(ctx, { type: 'agent_state', speaking: true });
      return;
    case 'AgentAudioDone':
      sendBrowserJson(ctx, { type: 'agent_state', speaking: false });
      return;
    case 'Error': {
      const description = msg.description ?? 'Voice agent error';
      logger.error({ simSid: ctx.simSid, description }, 'simulator: Deepgram agent error');
      sendBrowserJson(ctx, { type: 'error', message: description });
      teardown(ctx, 'deepgram_error');
      return;
    }
    default:
      // Welcome / AgentThinking / History / Warning — not needed.
      return;
  }
}

async function handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const url = new URL(req.url ?? '', 'http://localhost');
  const userId = url.searchParams.get('userId') ?? '';
  const personaId = url.searchParams.get('personaId') ?? undefined;

  const user = userId ? await repos.user.findById(userId) : null;
  if (!user) {
    ws.close(4401, 'unknown user');
    return;
  }

  const ctx: SessionCtx = {
    simSid: `SIM-${randomUUID()}`,
    userId,
    browserWs: ws,
    dgWs: null,
    dgReady: false,
    pendingMic: [],
    analysisStop: null,
    keepalive: null,
    capTimer: null,
    chunkCounter: 0,
    closed: false,
  };

  // FE attaches its analyze SSE with this sid BEFORE the greeting's
  // ConversationText can land.
  sendBrowserJson(ctx, { type: 'session', callSid: ctx.simSid });

  // Wire the full analysis pipeline (registers the call internally).
  const handle = startCallAnalysis({
    callSid: ctx.simSid,
    userId,
    direction: 'outbound',
    simulated: true,
  });
  ctx.analysisStop = handle.stop;
  publish(ctx.simSid, { type: 'status', status: 'connected', at: Date.now() });

  // Deepgram Voice Agent connection (raw ws — see module docblock).
  const dgWs = new WebSocket(DG_AGENT_URL, {
    headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}` },
  });
  ctx.dgWs = dgWs;

  dgWs.on('open', () => {
    dgWs.send(JSON.stringify(buildSettings(personaId)));
  });
  dgWs.on('message', (data: RawData, isBinary: boolean) => {
    if (ctx.closed) return;
    if (isBinary) {
      // Persona TTS audio → straight to the browser.
      if (ctx.browserWs.readyState === WebSocket.OPEN) {
        ctx.browserWs.send(data, { binary: true });
      }
      return;
    }
    handleDgJson(ctx, data.toString());
  });
  dgWs.on('error', (err) => {
    logger.error({ err, simSid: ctx.simSid }, 'simulator: Deepgram WS error');
    sendBrowserJson(ctx, { type: 'error', message: 'Voice agent connection failed.' });
    teardown(ctx, 'deepgram_ws_error');
  });
  dgWs.on('close', () => teardown(ctx, 'deepgram_closed'));

  ctx.keepalive = setInterval(() => {
    if (dgWs.readyState === WebSocket.OPEN) {
      dgWs.send(JSON.stringify({ type: 'KeepAlive' }));
    }
  }, KEEPALIVE_MS);
  ctx.capTimer = setTimeout(
    () => teardown(ctx, 'max_duration'),
    env.SIMULATOR_MAX_SESSION_SECONDS * 1000,
  );

  // Browser messages: binary = mic audio; JSON = control.
  ws.on('message', (data: RawData, isBinary: boolean) => {
    if (ctx.closed) return;
    if (isBinary) {
      const frame = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      if (ctx.dgReady && dgWs.readyState === WebSocket.OPEN) {
        dgWs.send(frame);
      } else {
        if (ctx.pendingMic.length >= MAX_PENDING_FRAMES) ctx.pendingMic.shift();
        ctx.pendingMic.push(frame);
      }
      return;
    }
    try {
      const msg = JSON.parse(data.toString()) as { type?: string };
      if (msg.type === 'end') teardown(ctx, 'user_ended');
    } catch {
      // ignore malformed control messages
    }
  });
  ws.on('close', () => teardown(ctx, 'browser_closed'));
  ws.on('error', (err) => {
    logger.warn({ err, simSid: ctx.simSid }, 'simulator: browser WS error');
    teardown(ctx, 'browser_ws_error');
  });

  logger.info(
    { simSid: ctx.simSid, userId, personaId: getPersona(personaId).id },
    'simulator: session started',
  );
}

export function createSimulatorWss(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    void handleConnection(ws, req).catch((err) => {
      logger.error({ err }, 'simulator: connection setup failed');
      try {
        ws.close(1011, 'setup failed');
      } catch {
        // ignore
      }
    });
  });
  logger.info('Training simulator WS handler ready (/ws/simulator)');
  return wss;
}
