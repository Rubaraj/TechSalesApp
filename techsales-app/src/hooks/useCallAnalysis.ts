/**
 * Subscribe to the backend SSE call-analyze stream for the active call.
 * Pushes transcript chunks into CallContext as they arrive. Cancels the
 * stream via AbortController on hangup or unmount.
 *
 * Phase 2: only `transcript` and `call_status` events. Phase 3+ extends to
 * entities, actions, info cards, compliance flags.
 */
import { useEffect, useRef } from 'react';
import { callService } from '../services/callService';
import { useCallContext } from '../context/CallContext';
import type { CallStreamEvent, TranscriptChunk } from '../types/call';

export function useCallAnalysis(): void {
  const { state, appendTranscript } = useCallContext();
  const callSid = state.callSid;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Only subscribe when we have a Twilio call SID and are in Twilio mode.
    if (!callSid || state.mode !== 'twilio') return undefined;

    const controller = new AbortController();
    abortRef.current = controller;

    const onEvent = (event: CallStreamEvent): void => {
      if (event.type === 'transcript') {
        const chunk: TranscriptChunk = {
          ...event.chunk,
        };
        // eslint-disable-next-line no-console
        console.debug(
          '[useCallAnalysis] SSE transcript event',
          chunk.id,
          chunk.speaker,
          chunk.isFinal ? 'FINAL' : 'interim',
          JSON.stringify(chunk.text),
        );
        appendTranscript(chunk);
        return;
      }
      // eslint-disable-next-line no-console
      console.debug('[useCallAnalysis] SSE event', event.type);
      // 'open' / 'call_status' / 'error' could be surfaced via context later.
    };

    void callService
      .openAnalyzeStream({ callSid, onEvent, signal: controller.signal })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        // eslint-disable-next-line no-console
        console.error('Call analyze stream errored:', err);
      });

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [callSid, state.mode, appendTranscript]);
}
