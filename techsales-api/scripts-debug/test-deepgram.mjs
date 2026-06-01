// Quick smoke test: opens a Deepgram streaming WS with the configured key,
// confirms 'open' fires, sends a few silent μ-law frames, then closes. If the
// model name or language is unsupported by our project, this will error.
import { DeepgramClient } from '@deepgram/sdk';
import 'dotenv/config';

const key = process.env.DEEPGRAM_API_KEY;
if (!key) {
  console.error('DEEPGRAM_API_KEY not set');
  process.exit(1);
}

const dg = new DeepgramClient({ apiKey: key });

const RUN_TIMEOUT_MS = 8000;
const timeout = setTimeout(() => {
  console.error('TIMEOUT — no events received in 8s');
  process.exit(2);
}, RUN_TIMEOUT_MS);

try {
  const socket = await dg.listen.v1.connect({
    model: process.env.DEEPGRAM_MODEL ?? 'nova-3',
    language: process.env.DEEPGRAM_LANGUAGE ?? 'en-US',
    encoding: 'mulaw',
    sample_rate: 8000,
    channels: 1,
    smart_format: true,
    punctuate: true,
    interim_results: true,
    diarize: false,
  });

  let openSeen = false;
  socket.on('open', () => {
    openSeen = true;
    console.log('[OK] socket open');
    // Send 1 second of silence (50 frames × 20ms × 160 bytes each).
    const silenceFrame = Buffer.alloc(160, 0xff); // μ-law silence
    for (let i = 0; i < 50; i++) socket.sendMedia(silenceFrame);
    console.log('[OK] sent 50 silent frames');
    setTimeout(() => {
      socket.close();
      clearTimeout(timeout);
      console.log('[OK] closed cleanly');
      process.exit(0);
    }, 1500);
  });

  socket.on('error', (err) => {
    console.error('[ERR] socket error:', err?.message ?? err);
    clearTimeout(timeout);
    process.exit(3);
  });

  socket.on('message', (msg) => {
    console.log('[event]', JSON.stringify(msg).slice(0, 200));
  });

  socket.on('close', () => {
    if (!openSeen) {
      console.error('[ERR] closed before opening');
      clearTimeout(timeout);
      process.exit(4);
    }
  });

  // SDK v5: handlers registered, NOW connect.
  socket.connect();
} catch (err) {
  console.error('[ERR] connect threw:', err?.message ?? err);
  clearTimeout(timeout);
  process.exit(5);
}
