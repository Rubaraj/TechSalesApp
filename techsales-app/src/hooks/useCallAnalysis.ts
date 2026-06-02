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
import { useCallContext } from '../context/CallContext';
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

export function useCallAnalysis(): void {
  const {
    state,
    appendTranscript,
    addInfoCard,
    addComplianceFlag,
    enqueueActions,
    mergeEntities,
    appendActivity,
  } = useCallContext();
  const callSid = state.callSid;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Only subscribe when we have a Twilio call SID and are in Twilio mode.
    if (!callSid || state.mode !== 'twilio') return undefined;

    const controller = new AbortController();
    abortRef.current = controller;

    const onEvent = (event: CallStreamEvent): void => {
      if (event.type === 'transcript') {
        const chunk: TranscriptChunk = { ...event.chunk };
        appendTranscript(chunk);
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

      // 'open' / 'call_status' / 'error' / 'tool_*' / 'thinking' could be
      // surfaced via context later.
    };

    void callService
      .openAnalyzeStream({ callSid, onEvent, signal: controller.signal })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        console.error('Call analyze stream errored:', err);
      });

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [
    callSid,
    state.mode,
    appendTranscript,
    addInfoCard,
    addComplianceFlag,
    enqueueActions,
    mergeEntities,
    appendActivity,
  ]);
}
