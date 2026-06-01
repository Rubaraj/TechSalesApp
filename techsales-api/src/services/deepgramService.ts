/**
 * Deepgram streaming STT service. Uses @deepgram/sdk v5's `listen.v1.connect`
 * which returns a Promise<V1Socket>.
 *
 * One Deepgram WS per Twilio track (inbound/outbound). Audio format is
 * Twilio Media Streams' μ-law/8 kHz/mono. `diarize=false` because Twilio's
 * track identity already gives us the speaker.
 */
import { DeepgramClient } from '@deepgram/sdk';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { Speaker, TranscriptChunk } from '../ai/types/call.types.js';

interface OpenDeepgramStreamInput {
  speakerLabel: Speaker;
  /** Stable id prefix for chunk IDs — typically `${callSid}:${track}`. */
  chunkIdPrefix: string;
}

export interface DeepgramStreamHandle {
  send: (buffer: Buffer) => void;
  close: () => void;
  onTranscript: (handler: (chunk: TranscriptChunk) => void) => () => void;
  onError: (handler: (err: Error) => void) => () => void;
}

let _client: DeepgramClient | null = null;

function getClient(): DeepgramClient {
  if (!env.DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY is not set');
  }
  if (_client) return _client;
  _client = new DeepgramClient({ apiKey: env.DEEPGRAM_API_KEY });
  return _client;
}

/**
 * Open one Deepgram live-transcription stream. Returns a handle whose `send`
 * buffers audio until the socket connection promise resolves, then flushes.
 * Keeps callers (Twilio WS handler) synchronous from their perspective.
 */
export function openDeepgramStream(input: OpenDeepgramStreamInput): DeepgramStreamHandle {
  const dg = getClient();
  const transcriptHandlers = new Set<(c: TranscriptChunk) => void>();
  const errorHandlers = new Set<(err: Error) => void>();

  let socket: Awaited<ReturnType<typeof dg.listen.v1.connect>> | null = null;
  let closed = false;
  let pending: Buffer[] = [];
  let chunkCounter = 0;

  // The WrappedListenV1Client (CustomClient.js) injects `Authorization` from
  // the client's apiKey; the Fern-generated type declares it required, so we
  // cast through `unknown` to bypass the spurious type error.
  void dg.listen.v1
    .connect({
      model: env.DEEPGRAM_MODEL,
      language: env.DEEPGRAM_LANGUAGE,
      encoding: 'mulaw',
      sample_rate: 8000,
      channels: 1,
      smart_format: true,
      punctuate: true,
      interim_results: true,
      diarize: false,
    } as unknown as Parameters<typeof dg.listen.v1.connect>[0])
    .then((s) => {
      if (closed) {
        s.close();
        return;
      }
      socket = s;

      s.on('message', (data) => {
        // Shape: { channel: { alternatives: [{ transcript, confidence }] },
        //          is_final, speech_final, start, duration, ... }
        const d = data as {
          is_final?: boolean;
          speech_final?: boolean;
          start?: number;
          duration?: number;
          channel?: {
            alternatives?: Array<{ transcript?: string; confidence?: number }>;
          };
        };
        const alt = d.channel?.alternatives?.[0];
        const text = (alt?.transcript ?? '').trim();
        if (!text) return;
        chunkCounter += 1;
        // Stable id per utterance: use Deepgram's `start` so interim
        // refinements + the final emit for the same utterance all share
        // one id. The FE reducer replaces-on-match (no duplicate bubbles).
        // Fallback to counter if `start` isn't present.
        const startMs =
          typeof d.start === 'number' ? Math.round(d.start * 1000) : chunkCounter;
        const chunk: TranscriptChunk = {
          id: `${input.chunkIdPrefix}:${startMs}`,
          text,
          timestamp: Date.now(),
          isFinal: d.is_final === true,
          speaker: input.speakerLabel,
          ...(typeof alt?.confidence === 'number' ? { confidence: alt.confidence } : {}),
        };
        logger.debug(
          {
            id: chunk.id,
            speaker: chunk.speaker,
            text,
            isFinal: chunk.isFinal,
            speechFinal: d.speech_final === true,
          },
          'Deepgram transcript',
        );
        for (const h of transcriptHandlers) {
          try {
            h(chunk);
          } catch (err) {
            logger.error({ err }, 'Deepgram transcript handler threw');
          }
        }
      });

      s.on('error', (err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error({ err: error.message }, 'Deepgram stream error');
        for (const h of errorHandlers) h(error);
      });

      s.on('close', () => {
        closed = true;
      });

      // SDK v5: handlers registered, NOW connect. Without this the socket
      // stays in CONNECTING state and never fires `message` events.
      // QA M11 — connect BEFORE flushing so sendMedia targets an open socket.
      // We also wait for `open` before flushing the pre-connect buffer; sends
      // before `open` are queued by the SDK but the QA finding wants explicit
      // ordering.
      s.on('open', () => {
        for (const buf of pending) {
          try {
            s.sendMedia(buf);
          } catch (err) {
            logger.error({ err }, 'Deepgram flush failed');
          }
        }
        pending = [];
      });
      s.connect();
    })
    .catch((err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error({ err: error.message }, 'Deepgram connect failed');
      for (const h of errorHandlers) h(error);
      closed = true;
    });

  return {
    send(buffer: Buffer) {
      if (closed) return;
      if (!socket) {
        // Buffer until socket connects. Cap to ~500 frames (~10s of audio at 50fps).
        if (pending.length < 500) pending.push(buffer);
        return;
      }
      try {
        socket.sendMedia(buffer);
      } catch (err) {
        logger.error({ err }, 'Deepgram send failed');
      }
    },
    close() {
      if (closed) return;
      closed = true;
      pending = [];
      // QA H4 — release subscriber refs so a long-lived process doesn't
      // accumulate dead handler closures across many calls.
      transcriptHandlers.clear();
      errorHandlers.clear();
      if (socket) {
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
    },
    onTranscript(handler) {
      transcriptHandlers.add(handler);
      return () => transcriptHandlers.delete(handler);
    },
    onError(handler) {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },
  };
}
