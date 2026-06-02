/**
 * Phase 2.6 — WebAudio ringtone for incoming calls.
 *
 * Two-tone burst (440 + 480 Hz) for 2 s, 4 s silence, repeat. Pure
 * oscillator — no audio assets, no autoplay-policy issue with bundled
 * files. `AudioContext.resume()` is invoked defensively in case the
 * context starts suspended (Chromium policy when the SDK incoming event
 * isn't a direct user gesture).
 *
 * Single shared module-level instance so calling `start()` while already
 * ringing is idempotent.
 */

let ctx: AudioContext | null = null;
let activeNodes: { osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;
let timer: number | null = null;

function ensureCtx(): AudioContext {
  if (!ctx) {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

function playBurst(): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
  gain.gain.setValueAtTime(0.15, now + 1.95);
  gain.gain.linearRampToValueAtTime(0, now + 2);
  gain.connect(ctx.destination);

  const osc1 = ctx.createOscillator();
  osc1.frequency.value = 440;
  osc1.type = 'sine';
  osc1.connect(gain);

  const osc2 = ctx.createOscillator();
  osc2.frequency.value = 480;
  osc2.type = 'sine';
  osc2.connect(gain);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 2);
  osc2.stop(now + 2);

  activeNodes = { osc1, osc2, gain };
}

export function start(): void {
  if (timer !== null) return; // already ringing
  ensureCtx();
  playBurst();
  // 2 s ring + 4 s silence = 6 s cycle.
  timer = window.setInterval(playBurst, 6_000);
}

export function stop(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  if (activeNodes && ctx) {
    try {
      activeNodes.osc1.stop();
      activeNodes.osc2.stop();
    } catch {
      // already stopped
    }
    activeNodes = null;
  }
}
