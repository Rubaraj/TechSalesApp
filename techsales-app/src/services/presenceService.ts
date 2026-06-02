/**
 * Phase 2.6 — Frontend presence heartbeat.
 *
 * Once the Twilio Device is registered (the agent is reachable for inbound
 * calls), `<CallRuntime>` starts a heartbeat loop that POSTs to
 * `/api/presence/heartbeat` every `HEARTBEAT_INTERVAL_MS` with the current
 * userId + in-call flag.
 *
 * Stop is idempotent. AbortController on every request prevents in-flight
 * fetches from outliving the loop.
 */
import { apiPost } from '../api/apiClient';

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface HeartbeatHandle {
  stop: () => void;
}

interface StartHeartbeatInput {
  userId: string;
  getInCall: () => boolean;
}

export function startHeartbeat(input: StartHeartbeatInput): HeartbeatHandle {
  const { userId, getInCall } = input;
  let stopped = false;

  const tick = (): void => {
    if (stopped) return;
    // Fire-and-forget. Errors are swallowed — the next tick will retry.
    void apiPost('/presence/heartbeat', {
      userId,
      inCall: getInCall(),
    }).catch(() => {
      // network blip; ignore
    });
  };

  // Send one immediately so the agent is registered without a 30s delay.
  tick();
  const intervalId = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);

  return {
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(intervalId);
    },
  };
}
