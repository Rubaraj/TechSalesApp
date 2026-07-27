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

/** Same persisted mic preference the Twilio call UI uses
 *  (AudioDeviceSelector) — Chrome's default input can be a dead device
 *  while the user's real mic is a non-default one. */
function persistedInputDevice(): { id?: string; label?: string } {
  try {
    const raw = window.localStorage.getItem('techsales:call-audio-devices');
    if (!raw) return {};
    const p = JSON.parse(raw) as { inputDeviceId?: string; inputLabel?: string };
    return { id: p.inputDeviceId, label: p.inputLabel };
  } catch {
    return {};
  }
}

export interface MicOption {
  id: string;
  label: string;
}

/** Enumerate audio inputs for the Training page's mic picker. */
export async function listMics(): Promise<MicOption[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}

/** Persist the chosen mic to the SAME key the Twilio call UI uses, so one
 *  selection fixes both surfaces. */
export function persistMicSelection(id: string, label: string): void {
  try {
    const raw = window.localStorage.getItem('techsales:call-audio-devices');
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    window.localStorage.setItem(
      'techsales:call-audio-devices',
      JSON.stringify({ ...existing, inputDeviceId: id, inputLabel: label }),
    );
  } catch {
    // ignore quota / privacy mode
  }
}

/** Heuristic: virtual devices that capture silence unless their app runs. */
export function looksVirtual(label: string): boolean {
  return /steam streaming|virtual|vb-audio|cable output|wave link/i.test(label);
}

async function resolveMicDeviceId(): Promise<string | undefined> {
  const pref = persistedInputDevice();
  if (!pref.id && !pref.label) return undefined;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === 'audioinput');
    const byId = pref.id && inputs.find((d) => d.deviceId === pref.id);
    if (byId) return byId.deviceId;
    const byLabel = pref.label && inputs.find((d) => d.label === pref.label);
    if (byLabel) return byLabel.deviceId;
  } catch {
    // fall through to default
  }
  return undefined;
}

export async function startSimulatorAudio(
  onMicFrame: (frame: ArrayBuffer) => void,
): Promise<SimulatorAudioHandle> {
  const deviceId = await resolveMicDeviceId();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const track = stream.getAudioTracks()[0];
  console.log(
    '[sim-audio] mic device:',
    track?.label || '(unnamed)',
    '| muted:',
    track?.muted,
    '| persisted pref:',
    persistedInputDevice().label ?? '(none)',
  );
  if (track) {
    if (track.muted) {
      console.warn(
        '[sim-audio] TRACK IS MUTED AT THE OS LEVEL — check the keyboard mic-mute key ' +
          '(often F4 / mic icon) or Windows Sound settings. Audio will be silent until unmuted.',
      );
    }
    track.onmute = () => console.warn('[sim-audio] mic muted by the OS');
    track.onunmute = () => console.log('[sim-audio] mic UNMUTED — audio should flow now');
  }

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
    numberOfOutputs: 1,
    processorOptions: { targetRate: TARGET_INPUT_RATE },
  });
  source.connect(worklet);
  // CRITICAL: browsers only render graph branches that reach the
  // destination — without this (muted) tap the worklet's process() never
  // runs and no mic frames are ever captured.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  worklet.connect(mute);
  mute.connect(ctx.destination);

  // Batch worklet chunks into ~100ms frames before shipping.
  let pending = new Int16Array(0);
  let framesSent = 0;
  let workletMessages = 0;
  worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    workletMessages += 1;
    if (workletMessages === 1) {
      console.log('[sim-audio] worklet producing audio (ctx rate', ctx.sampleRate, ')');
    }
    const incoming = new Int16Array(e.data);
    const merged = new Int16Array(pending.length + incoming.length);
    merged.set(pending, 0);
    merged.set(incoming, pending.length);
    pending = merged;
    while (pending.length >= FRAME_SAMPLES) {
      const frame = pending.slice(0, FRAME_SAMPLES);
      pending = pending.slice(FRAME_SAMPLES);
      framesSent += 1;
      if (framesSent === 1 || framesSent % 50 === 0) {
        // Peak level of this frame — 0 means the mic path is silent.
        let peak = 0;
        for (let i = 0; i < frame.length; i++) {
          const v = Math.abs(frame[i]);
          if (v > peak) peak = v;
        }
        console.log(`[sim-audio] mic frame #${framesSent} sent (peak ${peak}/32767)`);
      }
      onMicFrame(frame.buffer);
    }
  };
  window.setTimeout(() => {
    if (workletMessages === 0) {
      console.warn('[sim-audio] worklet produced NO audio in 3s — capture graph not running');
    }
  }, 3000);

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
      mute.disconnect();
    } catch {
      // already disconnected
    }
    for (const track of stream.getTracks()) track.stop();
    void ctx.close();
  };

  return { stop, playFrame, flushPlayback };
}
