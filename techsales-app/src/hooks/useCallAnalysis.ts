/**
 * Subscribe to the backend SSE call-analyze stream for the active call.
 * Pushes transcript chunks + AI events (actions, entities) into CallContext
 * as they arrive. Cancels the stream via AbortController on hangup/unmount.
 *
 * Routing (Phase 3a + 3b + 3b.1):
 *   - `show_info` / `show_plans_link` → materialized as InfoCard (dedicated slice)
 *   - `compliance_flag`               → materialized as ComplianceFlag (dedicated slice)
 *   - everything else (fill_field, add_drug, add_pharmacy, add_provider,
 *     add_note, ...) → enqueueActions for LeadForm / page consumers
 *
 * Every action ALSO pushes a one-line summary into the AI activity feed
 * (`state.aiActivityLog`) — the CallPanel's bottom-half feed reads from there.
 *
 * IMPORTANT: page consumers using `consumeActionsByType` MUST NOT pass
 * `'show_info'` or `'compliance_flag'` — those never land in `pendingActions`
 * (they're translated immediately into their own slices).
 */
import { useEffect, useRef } from 'react';
import { callService } from '../services/callService';
import { setAiHealth } from '../services/aiHealthStore';
import { useCallContext } from '../context/CallContext';
import { useAuth } from '../context/AuthContext';
import type {
  AiAction,
  AiActivityEntry,
  CallStreamEvent,
  ComplianceFlag,
  InfoCard,
  TranscriptChunk,
} from '../types/call';

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Phase 3b.1 — translate an AiAction into one row in the AI activity feed.
 * Each row has icon (emoji) + short text. Color is applied at the component
 * layer based on `kind`.
 */
function actionToActivityEntry(action: AiAction): AiActivityEntry | null {
  const id = makeId();
  const timestamp = Date.now();
  switch (action.type) {
    case 'fill_field':
      return {
        id,
        timestamp,
        kind: 'fill',
        icon: '✨',
        text: `Filled ${action.field}: ${formatFillValue(action.value)}`,
      };
    case 'add_drug': {
      const detail = [action.dosage, action.frequency].filter(Boolean).join(' · ');
      return {
        id,
        timestamp,
        kind: 'drug',
        icon: '💊',
        text: detail ? `${action.drugName} · ${detail}` : action.drugName,
      };
    }
    case 'add_pharmacy':
      return {
        id,
        timestamp,
        kind: 'pharmacy',
        icon: '🏥',
        text: action.pharmacyName,
      };
    case 'add_provider':
      return {
        id,
        timestamp,
        kind: 'provider',
        icon: '👨‍⚕️',
        text: action.providerName,
      };
    case 'add_note':
      return {
        id,
        timestamp,
        kind: 'note',
        icon: '📝',
        text: `${action.category}: ${action.text}`,
      };
    case 'show_info':
    case 'show_plans_link':
      return {
        id,
        timestamp,
        kind: 'info',
        icon: 'ℹ️',
        text: action.type === 'show_info' ? action.topic : `Plans · ${action.planType}`,
      };
    case 'compliance_flag':
      return {
        id,
        timestamp,
        kind: 'compliance',
        icon: '⚠️',
        text: `'${action.phrase}' → ${action.suggestion}`,
      };
    default:
      return null;
  }
}

function formatFillValue(value: string | boolean): string {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return value.length > 40 ? value.slice(0, 40) + '…' : value;
}

/** Chat feed — leading emoji for emotion-shift rows. */
const EMOTION_ICONS: Record<string, string> = {
  positive: '😊',
  neutral: '😐',
  confused: '😕',
  frustrated: '😠',
  upset: '😡',
};

export function useCallAnalysis(): void {
  const {
    state,
    appendTranscript,
    addInfoCard,
    addComplianceFlag,
    enqueueActions,
    mergeEntities,
    appendActivity,
    setAnalysisWarning,
    setProspectEmotion,
    addCoachingTip,
  } = useCallContext();
  const { user } = useAuth();
  const userId = user?.userId ?? '';
  const callSid = state.callSid;
  const abortRef = useRef<AbortController | null>(null);
  const warnedRef = useRef(false);
  // Chat feed — last emotion seen, so only SHIFTS post an activity row
  // (samples repeat every ~20s; a row per sample would spam the chat).
  const prevEmotionRef = useRef<string | null>(null);

  useEffect(() => {
    // Only subscribe when we have a Twilio call SID and are in Twilio mode.
    // userId is required by the API's per-user call-minute cap.
    if (!callSid || !userId || state.mode !== 'twilio') return undefined;

    const controller = new AbortController();
    abortRef.current = controller;
    prevEmotionRef.current = null; // fresh call → first sample posts a row

    const onEvent = (event: CallStreamEvent): void => {
      if (event.type === 'transcript') {
        const chunk: TranscriptChunk = { ...event.chunk };
        appendTranscript(chunk);
        if (warnedRef.current) {
          // Transcript is flowing after all — retract the warning.
          warnedRef.current = false;
          setAnalysisWarning(null);
        }
        return;
      }

      if (event.type === 'call_status') {
        if (event.status === 'not_hosted') {
          // The backend we're connected to isn't receiving this call's media
          // (in-memory callBus is per-process). Without this, the panel would
          // sit on "Listening…" forever with no explanation.
          warnedRef.current = true;
          setAnalysisWarning(
            'Live analysis unavailable — this backend is not receiving the call audio. ' +
              'Point VITE_API_BASE_URL at the production API (api.rubarajan.dev) and reload.',
          );
        } else if (event.status === 'connected' && warnedRef.current) {
          // Media stream is live on this backend — retract any early warning
          // (arrives before the first transcript chunk).
          warnedRef.current = false;
          setAnalysisWarning(null);
        }
        return;
      }

      if (event.type === 'actions') {
        const passthrough: AiAction[] = [];
        for (const action of event.actions) {
          // Phase 3b.1 — every action also gets a row in the AI activity feed.
          const entry = actionToActivityEntry(action);
          if (entry) appendActivity(entry);

          const ts = Date.now();
          if (action.type === 'show_info') {
            const card: InfoCard = {
              id: makeId(),
              topic: action.topic,
              title: action.title,
              content: action.content,
              ...(action.links ? { links: action.links } : {}),
              timestamp: ts,
            };
            addInfoCard(card);
            continue;
          }
          if (action.type === 'show_plans_link') {
            const card: InfoCard = {
              id: makeId(),
              topic: action.planType,
              title: `View ${action.planType} plans`,
              content:
                typeof action.count === 'number'
                  ? `${action.count} plans available in ${action.zipCode}.`
                  : `Browse plans in ${action.zipCode}.`,
              links: [{ label: `View ${action.planType} plans in ${action.zipCode}`, url: action.url }],
              timestamp: ts,
            };
            addInfoCard(card);
            continue;
          }
          if (action.type === 'compliance_flag') {
            const flag: ComplianceFlag = {
              id: makeId(),
              phrase: action.phrase,
              rule: action.rule,
              suggestion: action.suggestion,
              ...(action.severity ? { severity: action.severity } : {}),
              ...(action.ruleName ? { ruleName: action.ruleName } : {}),
              ...(action.chunkId ? { chunkId: action.chunkId } : {}),
              timestamp: ts,
            };
            addComplianceFlag(flag);
            continue;
          }
          // Page consumers (fill_field, add_drug, add_pharmacy, add_provider,
          // add_note). LeadForm reads them via consumeActionsByType.
          passthrough.push(action);
        }
        if (passthrough.length > 0) {
          enqueueActions(passthrough);
        }
        return;
      }

      if (event.type === 'entities') {
        mergeEntities(event.entities);
        return;
      }

      if (event.type === 'ai_health') {
        // Gap 7 — instant in-call degradation update (module store, not
        // context state; the 30s Layout poll covers out-of-call).
        setAiHealth({
          degraded: event.status === 'degraded',
          ...(event.reason ? { reason: event.reason } : {}),
          since: event.ts,
        });
        return;
      }

      if (event.type === 'emotion') {
        setProspectEmotion(event.emotion, event.confidence, event.ts);
        // Chat feed — post a row on shifts only (incl. the first sample).
        const prev = prevEmotionRef.current;
        if (event.emotion !== prev) {
          prevEmotionRef.current = event.emotion;
          appendActivity({
            id: makeId(),
            timestamp: Date.now(),
            kind: 'emotion',
            icon: EMOTION_ICONS[event.emotion] ?? '🙂',
            text: prev
              ? `Prospect sounds ${event.emotion} (was ${prev})`
              : `Prospect sounds ${event.emotion}`,
          });
        }
        return;
      }

      if (event.type === 'coaching') {
        addCoachingTip({
          id: makeId(),
          source: event.source,
          tip: event.tip,
          focus: event.focus,
          ts: event.ts,
        });
        // Chat feed — coaching tips render as feed rows in the Atlas chat
        // (the call section's dedicated Coach card was retired for this).
        appendActivity({
          id: makeId(),
          timestamp: Date.now(),
          kind: 'coaching',
          icon: '💡',
          text: event.tip,
        });
        return;
      }

      // 'open' / 'call_status' / 'error' / 'tool_*' / 'thinking' could be
      // surfaced via context later.
    };

    void callService
      .openAnalyzeStream({ callSid, userId, onEvent, signal: controller.signal })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        console.error('Call analyze stream errored:', err);
        // Surface instead of failing silently (501 disabled, 429 caps, …).
        warnedRef.current = true;
        setAnalysisWarning(
          `Live analysis stream failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return () => {
      // Grace-abort: the post-call note summary is published 1-2s AFTER the
      // call ends (backend stop funnel). Keep the stream alive briefly so
      // it lands; the server closes the stream itself on 'ended'.
      setTimeout(() => controller.abort(), 5_000);
      abortRef.current = null;
    };
  }, [
    callSid,
    userId,
    state.mode,
    appendTranscript,
    addInfoCard,
    addComplianceFlag,
    enqueueActions,
    mergeEntities,
    appendActivity,
    setAnalysisWarning,
    setProspectEmotion,
    addCoachingTip,
  ]);
}
