/**
 * Drives a single Twilio Voice call lifecycle (outbound + Phase 2.6 inbound)
 * and pumps state into CallContext.
 *
 *   - `dial(to)` — outbound. Fetches token (if needed) → connects.
 *   - `acceptIncoming()` — answer the currently-ringing inbound call.
 *   - `rejectIncoming()` — decline the currently-ringing inbound call.
 *   - `hangup()` — disconnect active call + destroy Device.
 *   - `setMute(on)` — toggle agent outgoing audio.
 *
 * Phase 2.6 changes:
 *   1. **Eager Device init.** When the user is signed in, init runs in a
 *      mount effect (not on first dial). Twilio needs to know the SDK
 *      identity is registered before it can route inbound calls.
 *   2. **`device.on('incoming')`** dispatches INCOMING_RINGING into
 *      CallContext + starts the ringtone. The incoming Call is kept in a
 *      ref so accept/reject can act on it.
 *   3. **Shared lifecycle binding** — `bindCallLifecycle(call)` wires the
 *      same `ringing`/`accept`/`disconnect`/`error` handlers regardless of
 *      whether the call came from `device.connect()` (outbound) or
 *      `device.on('incoming')` (inbound).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { callService } from '../services/callService';
import { useCallContext } from '../context/CallContext';
import { useAuth } from '../context/AuthContext';
import { lookupLeadsByPhone } from '../services/leadService';
import * as ringtone from '../services/ringtone';

type HandleType = Awaited<
  ReturnType<typeof import('../services/twilioClientService')['initTwilioDevice']>
>;
type IncomingTwilioCall = Parameters<
  Parameters<HandleType['on']>[1] extends (call: infer C) => void ? never : never
> extends never
  ? unknown
  : never;

export interface UseTwilioCallResult {
  isReady: boolean;
  isDialing: boolean;
  error: string | null;
  dial: (to: string) => Promise<void>;
  hangup: () => Promise<void>;
  setMute: (muted: boolean) => void;
  acceptIncoming: () => Promise<void>;
  rejectIncoming: () => void;
  /** Accessor for the underlying Twilio Device — used by AudioDeviceSelector
   *  to read device.audio.availableInputDevices etc. Returns null until the
   *  Device has been initialized. */
  getDevice: () => unknown | null;
}

// Narrow type for the runtime Call shape we use (the SDK's `Call` type
// changes shape across versions; this avoids version churn).
interface CallLike {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  parameters?: { CallSid?: string; From?: string };
  /** Custom TwiML <Parameter>s — carries parentCallSid on inbound calls. */
  customParameters?: Map<string, string>;
  accept: () => void;
  reject: () => void;
}

export function useTwilioCall(): UseTwilioCallResult {
  const { user } = useAuth();
  const {
    state,
    startCall,
    endCall,
    setCallSid,
    setCallStatus,
    setMute: setMuteCtx,
    setDialedNumber,
    setIncomingRinging,
    setIncomingAccepted,
  } = useCallContext();
  const handleRef = useRef<HandleType | null>(null);
  const initPromiseRef = useRef<Promise<HandleType> | null>(null);
  const incomingCallRef = useRef<CallLike | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isDialing, setIsDialing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared lifecycle binding for inbound + outbound calls. Wires status
  // transitions into CallContext.
  const bindCallLifecycle = useCallback(
    (call: CallLike): void => {
      call.on('ringing', () => setCallStatus('ringing'));
      call.on('accept', () => {
        // Inbound: media/analysis run on the PARENT (PSTN) leg, whose sid the
        // backend passes via the <Client><Parameter parentCallSid>. Our own
        // child-leg CallSid would never match the transcript stream. Outbound
        // has no custom parameter and keeps the SDK's own CallSid.
        const sid =
          call.customParameters?.get('parentCallSid') ?? call.parameters?.CallSid;
        if (sid) setCallSid(sid);
        setCallStatus('connected');
      });
      call.on('disconnect', () => {
        setCallStatus('ended');
        endCall();
      });
      call.on('cancel', () => {
        // Inbound-specific: caller hung up before agent accepted. Stop the
        // ringtone and clear inbound state.
        ringtone.stop();
        incomingCallRef.current = null;
        endCall();
      });
      call.on('error', (...args: unknown[]) => {
        const errArg = args[0] as { message?: string; code?: number } | undefined;
        setError(`${errArg?.code ?? ''} ${errArg?.message ?? 'Twilio call error'}`);
        setCallStatus('error');
      });
    },
    [endCall, setCallSid, setCallStatus],
  );

  const ensureHandle = useCallback(async (): Promise<HandleType> => {
    if (handleRef.current) return handleRef.current;
    if (initPromiseRef.current) return initPromiseRef.current;
    if (!user?.userId) throw new Error('Not signed in');
    const p = (async (): Promise<HandleType> => {
      const minted = await callService.fetchToken({ userId: user.userId });
      const { initTwilioDevice } = await import('../services/twilioClientService');
      const handle = await initTwilioDevice({
        token: minted.token,
        identity: minted.identity,
      });
      handleRef.current = handle;

      // Phase 2.6 — wire the inbound handler ONCE per Device.
      handle.on('incoming', (call) => {
        const callLike = call as unknown as CallLike;
        incomingCallRef.current = callLike;
        const from = callLike.parameters?.From ?? '';
        // Best-effort lead lookup. Don't block the ring UI on it.
        // Gap 3 — ALL matches: exactly one binds (auto-open on accept);
        // several leave leadId null so the routing popup lets the agent
        // pick (auto-binding the first match hid the multi-match popup).
        void (async () => {
          let leadName: string | null = null;
          let leadId: string | null = null;
          if (from) {
            try {
              const matches = await lookupLeadsByPhone(from);
              if (matches.length === 1) {
                leadName = `${matches[0].firstName} ${matches[0].lastName}`.trim();
                leadId = matches[0].leadId;
              } else if (matches.length > 1) {
                leadName = `${matches.length} matching leads`;
              }
            } catch {
              // ignore
            }
          }
          // CallContext snapshot may already have a different state by now;
          // INCOMING_RINGING is hard-replace by design.
          setIncomingRinging({ number: from, leadName }, leadId);
          ringtone.start();
        })();

        // The Call's `cancel` event fires if the caller hangs up while
        // ringing. Bind it now (not in bindCallLifecycle, which is used
        // post-accept too — we want cancel handled in the ring window).
        callLike.on('cancel', () => {
          ringtone.stop();
          incomingCallRef.current = null;
          endCall();
        });
      });

      setIsReady(true);
      return handle;
    })();
    initPromiseRef.current = p;
    try {
      return await p;
    } finally {
      initPromiseRef.current = null;
    }
  }, [user?.userId, setIncomingRinging, endCall]);

  // Phase 2.6 — eager init on login. Twilio needs `device.register()` to
  // have run BEFORE an inbound call arrives. The init is idempotent via
  // handleRef + initPromiseRef.
  useEffect(() => {
    if (!user?.userId) return;
    if (handleRef.current) return;
    void ensureHandle().catch((err) => {
      console.error('Eager Twilio Device init failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [user?.userId, ensureHandle]);

  const dial = useCallback(
    async (to: string): Promise<void> => {
      setError(null);
      try {
        setIsDialing(true);
        const handle = await ensureHandle();
        if (!state.isCallActive) {
          startCall({ mode: 'twilio' });
        }
        setDialedNumber(to);
        setCallStatus('connecting');
        const call = (await handle.dial(to)) as unknown as CallLike;
        bindCallLifecycle(call);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setCallStatus('error');
      } finally {
        setIsDialing(false);
      }
    },
    [
      ensureHandle,
      startCall,
      bindCallLifecycle,
      state.isCallActive,
      setCallStatus,
      setDialedNumber,
    ],
  );

  const acceptIncoming = useCallback(async (): Promise<void> => {
    const call = incomingCallRef.current;
    if (!call) return;
    const handle = handleRef.current;
    setError(null);
    ringtone.stop();
    // Bind lifecycle BEFORE accept so we don't miss the `accept` event the
    // SDK fires synchronously on call.accept().
    bindCallLifecycle(call);
    try {
      call.accept();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    setIncomingAccepted();
    incomingCallRef.current = null;
    // Hand the call to the service so destroy + setMute apply to it.
    if (handle) handle.attachCall(call as unknown as Parameters<HandleType['attachCall']>[0]);
  }, [bindCallLifecycle, setIncomingAccepted]);

  const rejectIncoming = useCallback((): void => {
    const call = incomingCallRef.current;
    ringtone.stop();
    if (call) {
      try {
        call.reject();
      } catch {
        // ignore
      }
    }
    incomingCallRef.current = null;
    endCall();
  }, [endCall]);

  const hangup = useCallback(async (): Promise<void> => {
    setCallStatus('ending');
    // Hang up the CALL, not the Device. Destroying the Device here (the old
    // behavior) unregistered the agent's Twilio identity with no re-init
    // path — the next inbound call hit Twilio "busy"/fallback until a page
    // refresh, and the stopped presence heartbeat left inCall=true for the
    // 60s TTL. The Device now lives for the session; `destroy` runs only on
    // logout/unmount.
    handleRef.current?.hangupCall();
    // The call's `disconnect` event drives status 'ended'; endCall() here is
    // the idempotent fallback in case the SDK swallows that event.
    endCall();
  }, [endCall, setCallStatus]);

  const setMute = useCallback(
    (muted: boolean): void => {
      handleRef.current?.setMute(muted);
      setMuteCtx(muted);
    },
    [setMuteCtx],
  );

  useEffect(() => {
    return () => {
      if (handleRef.current) {
        void handleRef.current.destroy();
        handleRef.current = null;
      }
    };
  }, []);

  // QA H2 — bridge: CallProvider dispatches `techsales:logout-end-call`
  // during logout; we await the Twilio destroy then signal completion via
  // `techsales:call-destroyed` so the provider can finish its END_CALL.
  useEffect(() => {
    const onLogoutEndCall = (): void => {
      void (async () => {
        try {
          const handle = handleRef.current;
          if (handle) {
            await handle.destroy();
            handleRef.current = null;
            setIsReady(false);
          }
        } finally {
          window.dispatchEvent(new CustomEvent('techsales:call-destroyed'));
        }
      })();
    };
    window.addEventListener('techsales:logout-end-call', onLogoutEndCall);
    return () => {
      window.removeEventListener('techsales:logout-end-call', onLogoutEndCall);
    };
  }, []);

  const getDevice = useCallback((): unknown | null => {
    return handleRef.current?.getDevice() ?? null;
  }, []);

  // Silence unused-import for the IncomingTwilioCall helper used purely for type-
  // narrowing during refactors.
  void (null as unknown as IncomingTwilioCall);

  return {
    isReady,
    isDialing,
    error,
    dial,
    hangup,
    setMute,
    acceptIncoming,
    rejectIncoming,
    getDevice,
  };
}
