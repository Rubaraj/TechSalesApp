/**
 * Training simulator — browser audio plumbing.
 *
 * Capture: getUserMedia (echo-cancelled) → AudioWorklet → fractional-ratio
 * downsample from the context's native rate (48k, or 44.1k on many Macs) to
 * 16 kHz → Int16 PCM → ~100ms binary frames handed to the caller (WS send).
 *
 * Playback: raw linear16 @ 24 kHz frames from the server; odd trailing
 * bytes are carried to the next frame; Int16 → Float32 (/32768) into
 * AudioBuffers scheduled back-to-back at `nextStartTime`. `flushPlayback()`
 * stops everything queued — called on barge-in so the persona shuts up the
 * moment the trainee starts talking.
 *
 * The AudioContext is created/resumed from the Start click (autoplay
 * policy). Recommend headphones in the UI: AEC helps, but speaker echo can
 * still make the agent hear itself.
 */

const TARGET_INPUT_RATE = 16_000;
const OUTPUT_RATE = 24_000;
/** ~100ms of 16k mono Int16 per outbound frame. */
const FRAME_SAMPLES = 1_600;

const WORKLET_SOURCE = `
class MicDownsampler extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ratio = sampleRate / options.processorOptions.targetRate;
    this.readPos = 0;
    this.tail = new Float32Array(0);
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    // Concatenate the unconsumed tail with the fresh block.
    const src = new Float32Array(this.tail.length + channel.length);
    src.set(this.tail, 0);
    src.set(channel, this.tail.length);
    const out = [];
    let pos = this.readPos;
    while (pos < src.length - 1) {
      const i = Math.floor(pos);
      const frac = pos - i;
      out.push(src[i] * (1 - frac) + src[i + 1] * frac);
      pos += this.ratio;
    }
    const consumed = Math.floor(pos);
    this.readPos = pos - consumed;
    this.tail = src.slice(consumed);
    if (out.length > 0) {
      const pcm = new Int16Array(out.length);
      for (let j = 0; j < out.length; j++) {
        const s = Math.max(-1, Math.min(1, out[j]));
        pcm[j] = s < 0 ? s * 32768 : s * 32767;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('mic-downsampler', MicDownsampler);
`;

export interface SimulatorAudioHandle {
  /** Stop capture + playback and release the mic. */
  stop: () => void;
  /** Queue a raw linear16@24k frame for playback. */
  playFrame: (frame: ArrayBuffer) => void;
  /** Barge-in: drop everything queued/playing. */
  flushPlayback: () => void;
}

export async function startSimulatorAudio(
  onMicFrame: (frame: ArrayBuffer) => void,
): Promise<SimulatorAudioHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const ctx = new AudioContext();
  await ctx.resume();

  const workletUrl = URL.createObjectURL(
    new Blob([WORKLET_SOURCE], { type: 'application/javascript' }),
  );
  try {
    await ctx.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }

  const source = ctx.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(ctx, 'mic-downsampler', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    processorOptions: { targetRate: TARGET_INPUT_RATE },
  });
  source.connect(worklet);

  // Batch worklet chunks into ~100ms frames before shipping.
  let pending = new Int16Array(0);
  worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    const incoming = new Int16Array(e.data);
    const merged = new Int16Array(pending.length + incoming.length);
    merged.set(pending, 0);
    merged.set(incoming, pending.length);
    pending = merged;
    while (pending.length >= FRAME_SAMPLES) {
      const frame = pending.slice(0, FRAME_SAMPLES);
      pending = pending.slice(FRAME_SAMPLES);
      onMicFrame(frame.buffer);
    }
  };

  // --- Playback queue -------------------------------------------------------
  let nextStartTime = 0;
  let leftover: Uint8Array = new Uint8Array(0);
  const liveSources = new Set<AudioBufferSourceNode>();

  const playFrame = (frame: ArrayBuffer): void => {
    // Carry odd trailing bytes between frames (Int16 alignment).
    const bytes = new Uint8Array(leftover.length + frame.byteLength);
    bytes.set(leftover, 0);
    bytes.set(new Uint8Array(frame), leftover.length);
    const usable = bytes.length - (bytes.length % 2);
    leftover = bytes.slice(usable);
    if (usable === 0) return;
    const pcm = new Int16Array(bytes.buffer.slice(0, usable));
    const buffer = ctx.createBuffer(1, pcm.length, OUTPUT_RATE);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) data[i] = pcm[i] / 32768;

    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime + 0.02, nextStartTime);
    node.start(startAt);
    nextStartTime = startAt + buffer.duration;
    liveSources.add(node);
    node.onended = () => liveSources.delete(node);
  };

  const flushPlayback = (): void => {
    for (const node of liveSources) {
      try {
        node.stop();
      } catch {
        // already stopped
      }
    }
    liveSources.clear();
    leftover = new Uint8Array(0);
    nextStartTime = 0;
  };

  const stop = (): void => {
    flushPlayback();
    worklet.port.onmessage = null;
    try {
      source.disconnect();
      worklet.disconnect();
    } catch {
      // already disconnected
    }
    for (const track of stream.getTracks()) track.stop();
    void ctx.close();
  };

  return { stop, playFrame, flushPlayback };
}
