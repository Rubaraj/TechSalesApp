/**
 * Thin wrapper around the Twilio Voice JS SDK. Lazy-loads the SDK on first
 * call so the ~180 KB bundle doesn't ship to non-call routes.
 *
 * Exposes a small surface: initialize a Device with a token, dial an E.164
 * number, hang up, mute. Returns the underlying Call SID for the FE so it
 * can subscribe to the backend SSE bridge.
 */
import type { Call as TwilioCall, Device as TwilioDevice } from '@twilio/voice-sdk';

type DeviceCtor = typeof TwilioDevice;

let _DeviceCtor: DeviceCtor | null = null;

async function loadSdk(): Promise<DeviceCtor> {
  if (_DeviceCtor) return _DeviceCtor;
  const mod = await import('@twilio/voice-sdk');
  _DeviceCtor = mod.Device;
  return _DeviceCtor;
}

export interface TwilioClientHandle {
  /** Place an outbound call. Returns the Call object so the caller can wire
   *  call-level event handlers (e.g. listen for `accept` → callSid). */
  dial: (to: string) => Promise<TwilioCall>;
  /** Phase 2.6 — Mark an externally-managed call (i.e. an inbound `Call`
   *  obtained from `device.on('incoming')` then `.accept()`'d) as the active
   *  call so `setMute` / `destroy` semantics apply. Idempotent. */
  attachCall: (call: TwilioCall) => void;
  /** Disconnect any active call(s) and destroy the Device. Idempotent. */
  destroy: () => Promise<void>;
  /** Mute the agent's outgoing audio. */
  setMute: (muted: boolean) => void;
  /** Get the current call if any. */
  getActiveCall: () => TwilioCall | null;
  /** Underlying Twilio Device (used by AudioDeviceSelector to read
   *  `device.audio.availableInputDevices` etc.). */
  getDevice: () => TwilioDevice;
  /** Subscribe to device lifecycle events. */
  on: <K extends keyof TwilioDeviceEventMap>(
    event: K,
    handler: TwilioDeviceEventMap[K],
  ) => () => void;
}

interface TwilioDeviceEventMap {
  registered: () => void;
  unregistered: () => void;
  error: (err: { code?: number; message: string }) => void;
  /** Inbound call — Phase 2.6 routes this to CallContext via useTwilioCall. */
  incoming: (call: TwilioCall) => void;
}

export interface InitDeviceInput {
  token: string;
  /** Used for client identity matching in Twilio Console. */
  identity: string;
}

export async function initTwilioDevice(
  input: InitDeviceInput,
): Promise<TwilioClientHandle> {
  const Device = await loadSdk();

  // Minimal device construction. The SDK's TS types for some options are
  // private (codecPreferences in particular); passing the token plus the
  // single safe option (logLevel) keeps the runtime predictable.
  const device = new Device(input.token, {
    logLevel: 'warn' as unknown as never,
  });

  await device.register();
  let activeCall: TwilioCall | null = null;

  const handle: TwilioClientHandle = {
    async dial(to: string): Promise<TwilioCall> {
      // Hangup any prior call before starting a new one.
      if (activeCall) {
        try {
          activeCall.disconnect();
        } catch {
          // ignore
        }
      }
      const call = await device.connect({ params: { To: to } });
      activeCall = call;
      call.on('disconnect', () => {
        if (activeCall === call) activeCall = null;
      });
      return call;
    },
    attachCall(call: TwilioCall): void {
      activeCall = call;
      call.on('disconnect', () => {
        if (activeCall === call) activeCall = null;
      });
    },
    async destroy(): Promise<void> {
      try {
        if (activeCall) {
          activeCall.disconnect();
        }
      } catch {
        // ignore
      }
      try {
        // Device.destroy() in the v2 SDK is synchronous unregister + disconnect.
        device.destroy();
      } catch {
        // ignore
      }
    },
    setMute(muted: boolean): void {
      if (activeCall) {
        try {
          activeCall.mute(muted);
        } catch {
          // ignore
        }
      }
    },
    getActiveCall(): TwilioCall | null {
      return activeCall;
    },
    getDevice(): TwilioDevice {
      return device;
    },
    on<K extends keyof TwilioDeviceEventMap>(
      event: K,
      handler: TwilioDeviceEventMap[K],
    ): () => void {
      // Twilio's SDK accepts string event names. Cast through unknown to avoid
      // chasing their EventEmitter type variance.
      const fn = handler as unknown as (...args: unknown[]) => void;
      (device as unknown as { on: (e: string, f: typeof fn) => void }).on(event, fn);
      return () => {
        (device as unknown as { off: (e: string, f: typeof fn) => void }).off(event, fn);
      };
    },
  };

  return handle;
}
