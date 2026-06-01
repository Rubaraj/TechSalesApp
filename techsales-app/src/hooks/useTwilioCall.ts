/**
 * Drives a single Twilio Voice outbound call lifecycle and pumps state into
 * CallContext (callSid, callStatus, isMuted, dialedNumber).
 *
 *   - `dial(to)` — fetches token (if needed) → initializes Device → connects.
 *   - `hangup()` — disconnects + destroys device.
 *   - `mute(on)` — toggles agent outgoing audio.
 *
 * Device + token are fetched lazily on first `dial`, not on mount, so users
 * who never click Dial don't pay the SDK download.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { callService } from '../services/callService';
import { useCallContext } from '../context/CallContext';
import { useAuth } from '../context/AuthContext';

type HandleType = Awaited<
  ReturnType<typeof import('../services/twilioClientService')['initTwilioDevice']>
>;

export interface UseTwilioCallResult {
  isReady: boolean;
  isDialing: boolean;
  error: string | null;
  dial: (to: string) => Promise<void>;
  hangup: () => Promise<void>;
  setMute: (muted: boolean) => void;
  /** Accessor for the underlying Twilio Device — used by AudioDeviceSelector
   *  to read device.audio.availableInputDevices etc. Returns null until the
   *  Device has been initialized (i.e. after the first dial). */
  getDevice: () => unknown | null;
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
  } = useCallContext();
  const handleRef = useRef<HandleType | null>(null);
  // QA M7 — in-flight init promise so a fast double-click on Dial doesn't
  // race ensureHandle, creating + leaking a second Twilio Device.
  const initPromiseRef = useRef<Promise<HandleType> | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isDialing, setIsDialing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setIsReady(true);
      return handle;
    })();
    initPromiseRef.current = p;
    try {
      return await p;
    } finally {
      initPromiseRef.current = null;
    }
  }, [user?.userId]);

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
        const call = await handle.dial(to);

        const callListenable = call as unknown as {
          on: (e: string, f: (...args: unknown[]) => void) => void;
          parameters?: { CallSid?: string };
        };

        callListenable.on('ringing', () => setCallStatus('ringing'));
        callListenable.on('accept', () => {
          const sid = callListenable.parameters?.CallSid;
          if (sid) setCallSid(sid);
          setCallStatus('connected');
        });
        callListenable.on('disconnect', () => {
          setCallStatus('ended');
          endCall();
        });
        callListenable.on('error', (...args: unknown[]) => {
          const errArg = args[0] as { message?: string; code?: number } | undefined;
          setError(`${errArg?.code ?? ''} ${errArg?.message ?? 'Twilio call error'}`);
          setCallStatus('error');
        });
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
      endCall,
      state.isCallActive,
      setCallSid,
      setCallStatus,
      setDialedNumber,
    ],
  );

  const hangup = useCallback(async (): Promise<void> => {
    setCallStatus('ending');
    const handle = handleRef.current;
    if (handle) {
      await handle.destroy();
      handleRef.current = null;
      setIsReady(false);
    }
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

  return { isReady, isDialing, error, dial, hangup, setMute, getDevice };
}
