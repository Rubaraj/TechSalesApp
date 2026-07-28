/**
 * AI call screening — audio bridge between a Twilio BIDIRECTIONAL media
 * stream (<Connect><Stream> on the parent call) and the Deepgram Voice
 * Agent. The AI answers on the agent's behalf until takeover.
 *
 * AUDIO-ONLY by design: the call's original <Start><Stream> transcription
 * fork survives the TwiML redirect and keeps feeding the analysis
 * pipeline — the caller on the inbound track ('prospect') and whatever
 * the caller hears (the AI's voice) on the outbound track ('agent'). So
 * this bridge starts NO analysis session and publishes NO transcripts
 * (contingency flag below), and its teardown touches bridge resources
 * only. mulaw@8000 both ways → pure base64 passthrough.
 *
 * Twilio wire: in {event: connected|start|media|stop}; out
 * {event:'media', streamSid, media:{payload}} and {event:'clear',
 * streamSid} (barge-in flush). Auth: the 'start' event's
 * customParameters must carry the callSid + nonce registered by
 * POST /api/screening/start.
 */
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { publish } from '../services/callBus.js';
import { getScreening } from '../ai/screening/screeningState.js';
import { getCallerNumber } from '../ai/agents/callAnalysisAgent.js';
import {
  DEFAULT_SCREENING_VOICE,
  DEFAULT_SCREENING_GREETING,
  DEFAULT_UNATTENDED_GREETING,
  buildScreeningPrompt,
  renderGreeting,
  type KnownLeadContext,
} from '../ai/screening/screeningPersonaDefaults.js';
import {
  buildScreeningFunctionDefs,
  executeScreeningFunction,
} from '../ai/screening/screeningTools.js';
import { resolveAgentName } from '../services/agentNameCache.js';
import { repos } from '../repositories/registry.js';
import type { ScreeningPersonaRecord } from '../types/index.js';
import type { TranscriptChunk } from '../ai/types/call.types.js';

const DG_AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const KEEPALIVE_MS = 8_000;
const MAX_PENDING_FRAMES = 500;

interface BridgeCtx {
  callSid: string | null;
  streamSid: string | null;
  /** Screening agent's userId — injected into every tool invocation
   *  server-side (the voice model never chooses whose data it reads). */
  agentUserId: string | null;
  /** Persona toggle — drive the browser + save the lead during the call. */
  createLeadLive: boolean;
  twilioWs: WebSocket;
  dgWs: WebSocket | null;
  dgReady: boolean;
  pendingAudio: Buffer[];
  keepalive: NodeJS.Timeout | null;
  chunkCounter: number;
  closed: boolean;
}

/** Bridge-only teardown — the analysis session and screeningState belong
 *  to the fork/teardown path, never to this bridge. */
function teardown(ctx: BridgeCtx, reason: string): void {
  if (ctx.closed) return;
  ctx.closed = true;
  if (ctx.keepalive) clearInterval(ctx.keepalive);
  try {
    ctx.dgWs?.close();
  } catch {
    // already closed
  }
  try {
    if (ctx.twilioWs.readyState === WebSocket.OPEN) ctx.twilioWs.close();
  } catch {
    // already closed
  }
  logger.info({ callSid: ctx.callSid, reason }, 'screening: bridge closed');
}

function buildSettings(
  agentName: string | null,
  persona: ScreeningPersonaRecord | null,
  unattended: boolean,
  knownLead: KnownLeadContext | null,
): Record<string, unknown> {
  const who = agentName ?? 'our agent';
  // Auto-screened calls override the persona greeting: the agent is not
  // joining, so a custom "they'll be with you shortly" line would mislead
  // the caller. Voice and instructions still come from the persona.
  const greeting = unattended
    ? renderGreeting(DEFAULT_UNATTENDED_GREETING, who)
    : renderGreeting(persona?.greeting || DEFAULT_SCREENING_GREETING, who);
  const voice = persona?.voice || DEFAULT_SCREENING_VOICE;
  return {
    type: 'Settings',
    audio: {
      input: { encoding: 'mulaw', sample_rate: 8000 },
      output: { encoding: 'mulaw', sample_rate: 8000, container: 'none' },
    },
    agent: {
      language: 'en',
      greeting,
      listen: { provider: { type: 'deepgram', model: 'nova-3' } },
      think: {
        provider: { type: 'anthropic', model: env.SIMULATOR_THINK_MODEL },
        prompt: buildScreeningPrompt(who, persona?.instructions ?? '', {
          withTools: env.SCREENING_TOOLS_ENABLED,
          // Absent persona → both capabilities on (the shipped defaults).
          offerPlans: persona?.offerPlans ?? true,
          createLeadLive: persona?.createLeadLive ?? true,
          knownLead,
        }),
        // Client-side function calling (no endpoint ⇒ DG sends
        // FunctionCallRequest over this socket) — the Atlas tool set.
        ...(env.SCREENING_TOOLS_ENABLED ? { functions: buildScreeningFunctionDefs() } : {}),
      },
      speak: { provider: { type: 'deepgram', model: voice } },
    },
  };
}

function sendTwilio(ctx: BridgeCtx, payload: Record<string, unknown>): void {
  if (ctx.twilioWs.readyState === WebSocket.OPEN) {
    ctx.twilioWs.send(JSON.stringify(payload));
  }
}

function openDeepgram(
  ctx: BridgeCtx,
  agentName: string | null,
  persona: ScreeningPersonaRecord | null,
  unattended: boolean,
  knownLead: KnownLeadContext | null,
): void {
  const dgWs = new WebSocket(DG_AGENT_URL, {
    headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}` },
  });
  ctx.dgWs = dgWs;

  dgWs.on('open', () => {
    dgWs.send(JSON.stringify(buildSettings(agentName, persona, unattended, knownLead)));
  });
  dgWs.on('message', (data: RawData, isBinary: boolean) => {
    if (ctx.closed) return;
    if (isBinary) {
      // AI voice (mulaw@8000) → the caller, via Twilio's media envelope.
      if (ctx.streamSid) {
        const payload = (Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)).toString(
          'base64',
        );
        sendTwilio(ctx, { event: 'media', streamSid: ctx.streamSid, media: { payload } });
      }
      return;
    }
    let msg: {
      type?: string;
      role?: string;
      content?: string;
      description?: string;
      /** FunctionCallRequest payload (client_side functions only). */
      functions?: { id?: string; name?: string; arguments?: string; client_side?: boolean }[];
    };
    try {
      msg = JSON.parse(data.toString()) as typeof msg;
    } catch {
      return;
    }
    switch (msg.type) {
      case 'SettingsApplied': {
        ctx.dgReady = true;
        for (const frame of ctx.pendingAudio) dgWs.send(frame);
        ctx.pendingAudio = [];
        return;
      }
      case 'UserStartedSpeaking':
        // Barge-in: flush Twilio's queued playback so the AI shuts up.
        if (ctx.streamSid) sendTwilio(ctx, { event: 'clear', streamSid: ctx.streamSid });
        return;
      case 'ConversationText': {
        logger.info(
          { callSid: ctx.callSid, role: msg.role, text: (msg.content ?? '').slice(0, 80) },
          'screening: DG transcript',
        );
        // Contingency only — normally the media-stream fork transcribes the
        // AI's voice from the outbound track like any agent audio.
        if (
          env.SCREENING_PUBLISH_BOT_TRANSCRIPTS &&
          msg.role === 'assistant' &&
          ctx.callSid &&
          (msg.content ?? '').trim()
        ) {
          const chunk: TranscriptChunk = {
            id: `${ctx.callSid}:bot:${ctx.chunkCounter++}`,
            text: (msg.content ?? '').trim(),
            timestamp: Date.now(),
            isFinal: true,
            speaker: 'agent',
          };
          publish(ctx.callSid, { type: 'transcript', chunk });
        }
        return;
      }
      case 'FunctionCallRequest': {
        // Atlas-tool function calling — execute server-side, reply with the
        // matching request id. DG pauses generation until the response.
        for (const fn of msg.functions ?? []) {
          if (fn.client_side === false) continue;
          const fnId = fn.id ?? '';
          const fnName = fn.name ?? '';
          logger.info(
            { callSid: ctx.callSid, fn: fnName, args: (fn.arguments ?? '').slice(0, 200) },
            'screening: function call requested',
          );
          const respond = (content: string): void => {
            if (dgWs.readyState === WebSocket.OPEN) {
              dgWs.send(
                JSON.stringify({ type: 'FunctionCallResponse', id: fnId, name: fnName, content }),
              );
            }
          };
          if (!ctx.callSid || !ctx.agentUserId) {
            respond(JSON.stringify({ error: 'Session not ready' }));
            continue;
          }
          void executeScreeningFunction(fnName, fn.arguments ?? '{}', {
            callSid: ctx.callSid,
            agentUserId: ctx.agentUserId,
            createLeadLive: ctx.createLeadLive,
          }).then(respond);
        }
        return;
      }
      case 'Error':
        logger.error(
          { callSid: ctx.callSid, description: msg.description },
          'screening: Deepgram agent error',
        );
        teardown(ctx, 'deepgram_error');
        return;
      default:
        return;
    }
  });
  dgWs.on('error', (err) => {
    logger.error({ err, callSid: ctx.callSid }, 'screening: Deepgram WS error');
    teardown(ctx, 'deepgram_ws_error');
  });
  dgWs.on('close', () => teardown(ctx, 'deepgram_closed'));

  ctx.keepalive = setInterval(() => {
    if (dgWs.readyState === WebSocket.OPEN) {
      dgWs.send(JSON.stringify({ type: 'KeepAlive' }));
    }
  }, KEEPALIVE_MS);
}

interface TwilioStreamMessage {
  event?: string;
  start?: {
    streamSid?: string;
    callSid?: string;
    customParameters?: Record<string, string>;
  };
  media?: { track?: string; payload?: string };
}

function handleConnection(ws: WebSocket): void {
  const ctx: BridgeCtx = {
    callSid: null,
    streamSid: null,
    agentUserId: null,
    createLeadLive: true,
    twilioWs: ws,
    dgWs: null,
    dgReady: false,
    pendingAudio: [],
    keepalive: null,
    chunkCounter: 0,
    closed: false,
  };

  ws.on('message', (data: RawData) => {
    if (ctx.closed) return;
    let msg: TwilioStreamMessage;
    try {
      msg = JSON.parse(data.toString()) as TwilioStreamMessage;
    } catch {
      return;
    }
    switch (msg.event) {
      case 'start': {
        const params = msg.start?.customParameters ?? {};
        const callSid = params.callSid ?? msg.start?.callSid ?? null;
        const token = params.token ?? '';
        const entry = callSid ? getScreening(callSid) : undefined;
        if (!callSid || !entry || entry.token !== token) {
          logger.warn({ callSid }, 'screening: unauthorized stream start — closing');
          teardown(ctx, 'unauthorized');
          return;
        }
        ctx.callSid = callSid;
        ctx.streamSid = msg.start?.streamSid ?? null;
        ctx.agentUserId = entry.agentUserId;
        logger.info(
          { callSid, streamSid: ctx.streamSid, agentUserId: entry.agentUserId },
          'screening: bridge started',
        );
        // The caller's number reaches us either from the registering webhook
        // or (manual Screen) from the analysis session the ring-time fork
        // started. Needed to recognize a caller already in the system.
        const callerNumber = entry.callerNumber ?? getCallerNumber(callSid);
        void Promise.all([
          resolveAgentName(entry.agentUserId).catch(() => null),
          repos.screeningPersona.findByUserId(entry.agentUserId).catch(() => null),
          callerNumber
            ? repos.lead.findByPhone(callerNumber).catch(() => null)
            : Promise.resolve(null),
        ]).then(([name, persona, lead]) => {
          ctx.createLeadLive = persona?.createLeadLive ?? true;
          const knownLead: KnownLeadContext | null = lead
            ? {
                leadId: lead.leadId,
                firstName: lead.firstName,
                lastName: lead.lastName,
                ...(lead.leadStatus ? { leadStatus: lead.leadStatus } : {}),
                ...(lead.zipCode ? { zipCode: lead.zipCode } : {}),
                ...(lead.notes ? { notes: lead.notes } : {}),
              }
            : null;
          if (knownLead) {
            logger.info({ callSid, leadId: knownLead.leadId }, 'screening: caller is a known lead');
          }
          openDeepgram(ctx, name, persona, entry.unattended, knownLead);
        });
        return;
      }
      case 'media': {
        const payload = msg.media?.payload;
        if (!payload) return;
        const frame = Buffer.from(payload, 'base64');
        if (ctx.dgReady && ctx.dgWs?.readyState === WebSocket.OPEN) {
          ctx.dgWs.send(frame);
        } else {
          if (ctx.pendingAudio.length >= MAX_PENDING_FRAMES) ctx.pendingAudio.shift();
          ctx.pendingAudio.push(frame);
        }
        return;
      }
      case 'stop':
        teardown(ctx, 'twilio_stop');
        return;
      default:
        // 'connected' / 'mark' — nothing to do.
        return;
    }
  });
  ws.on('close', () => teardown(ctx, 'twilio_closed'));
  ws.on('error', (err) => {
    logger.warn({ err, callSid: ctx.callSid }, 'screening: Twilio WS error');
    teardown(ctx, 'twilio_ws_error');
  });
}

export function createScreeningWss(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', handleConnection);
  logger.info('AI call screening WS handler ready (/ws/screening)');
  return wss;
}
