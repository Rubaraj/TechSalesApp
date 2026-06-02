/**
 * Phase 2.5 — Always-mounted host of the single `useTwilioCall` instance.
 *
 * Fixes two Phase 2 bugs revealed by the Phase 2.5 plan review:
 *   B1) `useTwilioCall` previously lived inside CallPanel, which returns
 *       null when no call is active. A click-to-dial from a "no call yet"
 *       state would set state.pendingDial before the hook was mounted to
 *       observe it. By hoisting the hook to an always-mounted component,
 *       the dispatch+observe race disappears.
 *   R2) CallPanel unmount on call-end was destroying the Twilio Device every
 *       time the call ended, forcing re-init (SDK fetch + token mint) on
 *       the next dial. Hosting the hook here means the Device lives for
 *       the session — second dial onwards is fast.
 *
 * This component renders nothing visually. It only:
 *   1. Owns `useTwilioCall` once for the whole app.
 *   2. Watches `state.pendingDial`; when set, calls `dial(to)` and clears
 *      the field.
 *   3. Publishes the hook's handles (dial / hangup / setMute / isDialing /
 *      error / isReady) through `CallRuntimeContext` so CallPanel + Dialer
 *      + AudioDeviceSelector can consume them without re-instantiating.
 */
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useCallContext } from '../../context/CallContext';
import { useAuth } from '../../context/AuthContext';
import { useTwilioCall, type UseTwilioCallResult } from '../../hooks/useTwilioCall';
import { startHeartbeat } from '../../services/presenceService';

const CallRuntimeContext = createContext<UseTwilioCallResult | null>(null);

export function CallRuntime({ children }: { children?: ReactNode }) {
  const { state, clearPendingDial } = useCallContext();
  const { user } = useAuth();
  const twilioCall = useTwilioCall();

  // Phase 2.6 — presence heartbeat. Starts once the Device is registered
  // (so we only declare presence when the agent is actually reachable for
  // inbound calls). `getInCall` is a closure over a ref-shadowed view of
  // state so the heartbeat reports current state without re-subscribing
  // every render.
  const inCallRef = useRef<boolean>(false);
  inCallRef.current =
    state.isCallActive && state.callStatus !== 'idle';
  useEffect(() => {
    if (!twilioCall.isReady) return;
    if (!user?.userId) return;
    const handle = startHeartbeat({
      userId: user.userId,
      getInCall: () => inCallRef.current,
    });
    return () => handle.stop();
  }, [twilioCall.isReady, user?.userId]);

  // QA H4 — track the currently in-flight dial so a duplicate pendingDial
  // transition for the same `to` is a no-op, and a *different* `to`
  // arriving mid-flight doesn't double-clear. The clearPendingDial only
  // fires if our settled `to` still matches state.pendingDial — otherwise
  // the field has already advanced and clearing would wipe the new dial.
  const inFlightToRef = useRef<string | null>(null);

  useEffect(() => {
    const to = state.pendingDial;
    if (!to) return;
    if (inFlightToRef.current === to) return; // re-entry for the same to
    inFlightToRef.current = to;
    void (async () => {
      try {
        await twilioCall.dial(to);
      } finally {
        // Only clear if no newer pendingDial has superseded ours.
        if (inFlightToRef.current === to) {
          inFlightToRef.current = null;
          clearPendingDial();
        }
      }
    })();
    // twilioCall.dial is captured via closure; we don't depend on it
    // intentionally because we only want re-runs on pendingDial change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingDial]);

  return (
    <CallRuntimeContext.Provider value={twilioCall}>
      {children}
    </CallRuntimeContext.Provider>
  );
}

/**
 * Consume the single useTwilioCall instance from any descendant of
 * `<CallRuntime>`. Throws if used outside, which catches the foot-gun of
 * mounting a call-related component above CallRuntime in the tree.
 */
export function useCallRuntime(): UseTwilioCallResult {
  const ctx = useContext(CallRuntimeContext);
  if (!ctx) {
    throw new Error(
      'useCallRuntime must be used inside <CallRuntime> (rendered in Layout)',
    );
  }
  return ctx;
}
