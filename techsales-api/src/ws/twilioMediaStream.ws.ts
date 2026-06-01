/**
 * Phase 2 — Twilio Media Streams WebSocket receiver.
 *
 * Each call's Media Stream opens one WebSocket here. Twilio sends framed
 * JSON envelopes:
 *   - `connected`: handshake — protocol/version info.
 *   - `start`: includes callSid, streamSid, tracks[], customParameters.
 *   - `media`: { track: 'inbound'|'outbound', payload: base64(μ-law) }
 *   - `stop`: stream over.
 *   - `mark`: ack for marks we'd send back (Phase 2 sends none).
 *
 * For each `start` we open two Deepgram streams (one per track), tag each
 * with a speaker label per `trackToSpeaker` below (inbound = agent,
 * outbound = prospect — see comment there), and forward `media` payloads
 * to the matching Deepgram stream. Transcripts are published to `callBus`.
 *
 * Enforces a hard per-call duration cap via `TWILIO_MAX_CALL_DURATION_SECONDS`
 * — calls Twilio REST to force-complete the call if exceeded. Prevents a
 * stuck-call from burning Twilio + Deepgram credit.
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { openDeepgramStream, type DeepgramStreamHandle } from '../services/deepgramService.js';
import { forceEndCall } from '../services/twilioService.js';
import { publish, endCall as endCallBus } from '../services/callBus.js';
import type { Speaker, TranscriptChunk } from '../ai/types/call.types.js';

interface TwilioConnectedEvent {
  event: 'connected';
  protocol: string;
  version: string;
}

interface TwilioStartEvent {
  event: 'start';
  start: {
    accountSid: string;
    callSid: string;
    streamSid: string;
    tracks: ('inbound' | 'outbound')[];
    customParameters?: Record<string, string>;
  };
}

interface TwilioMediaEvent {
  event: 'media';
  sequenceNumber: string;
  media: {
    track: 'inbound' | 'outbound';
    chunk: string;
    timestamp: string;
    payload: string; // base64 μ-law
  };
  streamSid: string;
}

interface TwilioStopEvent {
  event: 'stop';
  stop: { accountSid: string; callSid: string };
  streamSid: string;
}

type TwilioMessage =
  | TwilioConnectedEvent
  | TwilioStartEvent
  | TwilioMediaEvent
  | TwilioStopEvent
  | { event: string };

/**
 * Twilio's Media Stream track semantics on a `<Start><Stream>` attached to
 * the parent call (the Voice SDK browser client):
 *   - `inbound`  = audio coming FROM the SDK side  →  agent's mic    →  AGENT
 *   - `outbound` = audio going TO   the SDK side   →  what agent hears
 *                                                     (the prospect)  →  PROSPECT
 * Verified by real-call observation: with the prior inverse mapping a
 * voicemail prompt ("Please leave your message…") was labeled Agent and
 * the agent's own speech was labeled Prospect.
 */
function trackToSpeaker(track: 'inbound' | 'outbound'): Speaker {
  return track === 'inbound' ? 'agent' : 'prospect';
}

interface PerCallContext {
  callSid: string;
  streamSid: string;
  startedAt: number;
  streams: Partial<Record<'inbound' | 'outbound', DeepgramStreamHandle>>;
  durationTimer: NodeJS.Timeout | null;
  /** QA H5 — heartbeat timer that pings Twilio's WS every HEARTBEAT_MS and
   *  forceEndCall's the call if no pong returns within PONG_TIMEOUT_MS. */
  heartbeatTimer: NodeJS.Timeout | null;
  pongDeadline: number; // epoch ms; if Date.now() > this, heartbeat failed
  closed: boolean;
}

// QA H5 — Twilio Media Stream WS keepalive. 30s ping + 15s pong grace.
const HEARTBEAT_MS = 30_000;
const PONG_TIMEOUT_MS = 15_000;

function handleConnection(ws: WebSocket, req: IncomingMessage): void {
  const remote = req.socket?.remoteAddress;
  logger.info({ remote }, 'Twilio Media Stream WS connection opened');

  let ctx: PerCallContext | null = null;

  const closeStreams = (): void => {
    if (!ctx || ctx.closed) return;
    ctx.closed = true;
    if (ctx.durationTimer) {
      clearTimeout(ctx.durationTimer);
      ctx.durationTimer = null;
    }
    if (ctx.heartbeatTimer) {
      clearInterval(ctx.heartbeatTimer);
      ctx.heartbeatTimer = null;
    }
    for (const s of Object.values(ctx.streams)) {
      try {
        s?.close();
      } catch {
        // ignore
      }
    }
    publish(ctx.callSid, { type: 'status', status: 'ended', at: Date.now() });
    endCallBus(ctx.callSid);
  };

  const handleTranscript = (chunk: TranscriptChunk): void => {
    if (!ctx) return;
    publish(ctx.callSid, { type: 'transcript', chunk });
  };

  ws.on('message', (raw: RawData) => {
    let msg: TwilioMessage;
    try {
      msg = JSON.parse(raw.toString('utf8')) as TwilioMessage;
    } catch (err) {
      logger.warn({ err }, 'Twilio media WS: unparseable JSON');
      return;
    }

    if (msg.event === 'connected') {
      const m = msg as TwilioConnectedEvent;
      logger.debug({ proto: m.protocol, ver: m.version }, 'Twilio media WS: connected');
      return;
    }

    if (msg.event === 'start') {
      const m = msg as TwilioStartEvent;
      ctx = {
        callSid: m.start.callSid,
        streamSid: m.start.streamSid,
        startedAt: Date.now(),
        streams: {},
        durationTimer: null,
        heartbeatTimer: null,
        pongDeadline: Date.now() + HEARTBEAT_MS + PONG_TIMEOUT_MS,
        closed: false,
      };
      logger.info(
        { callSid: ctx.callSid, streamSid: ctx.streamSid, tracks: m.start.tracks },
        'Twilio media WS: start',
      );

      // Open one Deepgram stream per advertised track.
      for (const track of m.start.tracks) {
        try {
          const handle = openDeepgramStream({
            speakerLabel: trackToSpeaker(track),
            chunkIdPrefix: `${ctx.callSid}:${track}`,
          });
          handle.onTranscript(handleTranscript);
          handle.onError((err) => {
            publish(ctx!.callSid, { type: 'error', error: `deepgram[${track}]: ${err.message}` });
          });
          ctx.streams[track] = handle;
        } catch (err) {
          logger.error({ err, track }, 'Failed to open Deepgram stream');
          publish(ctx.callSid, {
            type: 'error',
            error: `Failed to open Deepgram[${track}]: ${
              err instanceof Error ? err.message : String(err)
            }`,
          });
        }
      }

      publish(ctx.callSid, { type: 'status', status: 'connected', at: ctx.startedAt });

      // Per-call duration cap. Hard-stop the call via Twilio REST.
      const cap = env.TWILIO_MAX_CALL_DURATION_SECONDS;
      ctx.durationTimer = setTimeout(() => {
        if (!ctx || ctx.closed) return;
        logger.warn({ callSid: ctx.callSid, cap }, 'Twilio media WS: duration cap exceeded, force-ending');
        forceEndCall(ctx.callSid).catch((err) => {
          logger.error({ err, callSid: ctx?.callSid }, 'forceEndCall failed');
        });
      }, cap * 1000);

      // QA H5 — keepalive heartbeat. If a pong doesn't return within
      // PONG_TIMEOUT_MS, the laptop is offline (or Cloudflare dropped) — force
      // the Twilio call to end so we don't sit on a stuck call billing
      // minutes until the duration cap.
      ctx.heartbeatTimer = setInterval(() => {
        if (!ctx || ctx.closed) return;
        if (Date.now() > ctx.pongDeadline) {
          logger.warn(
            { callSid: ctx.callSid },
            'Twilio media WS: heartbeat timeout, force-ending',
          );
          forceEndCall(ctx.callSid).catch((err) => {
            logger.error({ err, callSid: ctx?.callSid }, 'forceEndCall (heartbeat) failed');
          });
          try {
            ws.terminate();
          } catch {
            // ignore
          }
          return;
        }
        try {
          ws.ping();
        } catch (err) {
          logger.error({ err, callSid: ctx.callSid }, 'WS ping threw');
        }
      }, HEARTBEAT_MS);

      return;
    }

    if (msg.event === 'media') {
      if (!ctx || ctx.closed) return;
      const m = msg as TwilioMediaEvent;
      const stream = ctx.streams[m.media.track];
      if (!stream) return;
      // Twilio sends base64-encoded μ-law payload. Deepgram wants raw bytes.
      const buf = Buffer.from(m.media.payload, 'base64');
      stream.send(buf);
      return;
    }

    if (msg.event === 'stop') {
      logger.info({ callSid: ctx?.callSid }, 'Twilio media WS: stop');
      closeStreams();
      return;
    }

    // Unknown event — ignore but log so we notice protocol drift.
    if (msg.event !== 'mark') {
      logger.debug({ event: msg.event }, 'Twilio media WS: unknown event');
    }
  });

  ws.on('close', () => {
    logger.info({ callSid: ctx?.callSid }, 'Twilio media WS: socket closed');
    closeStreams();
  });

  ws.on('error', (err: Error) => {
    logger.error({ err, callSid: ctx?.callSid }, 'Twilio media WS: socket error');
    closeStreams();
  });

  // QA H5 — pong received → push the deadline forward.
  ws.on('pong', () => {
    if (ctx && !ctx.closed) {
      ctx.pongDeadline = Date.now() + HEARTBEAT_MS + PONG_TIMEOUT_MS;
    }
  });
}

/**
 * Attach the Twilio Media Stream WS server to the running HTTP server.
 * Routes only `/ws/twilio-media` to this handler; any other upgrade attempt
 * gets the socket destroyed.
 */
export function attachTwilioMediaStreamWs(httpServer: import('node:http').Server): void {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', handleConnection);

  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url === '/ws/twilio-media') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
      return;
    }
    // Not our path. Close gracefully so other upgrade handlers can claim.
    // If no one claims it within a tick, destroy the socket.
    setImmediate(() => {
      if (!socket.destroyed) socket.destroy();
    });
  });

  logger.info('Twilio Media Streams WS listening on /ws/twilio-media');
}
