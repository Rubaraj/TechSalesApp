/**
 * Phase 4 outbound-dial — watches CallContext.pendingDial; when a new
 * outbound dial fires, looks the number up against the lead book and
 * pushes either an IdentifiedLeadCard (match) or CreateLeadCard (miss)
 * into Atlas's leadSuggestions slice, which ChatPane renders inline.
 *
 * Cleared automatically when the call ends so chat stays tidy.
 *
 * Mounted once at Layout level so it runs in every authenticated session.
 */
import { useEffect, useRef } from 'react';
import { useCallContext } from '../context/CallContext';
import { useAtlas } from '../context/AtlasContext';
import { useAuth } from '../context/AuthContext';
import { lookupLeadByPhone } from '../services/leadService';

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useOutboundLeadIdentification(): void {
  const { user } = useAuth();
  const { state: callState } = useCallContext();
  const { addLeadSuggestion, clearLeadSuggestions, setPanelOpen } = useAtlas();

  // Remember the last phone we already kicked a lookup for, so React
  // re-renders / multiple effect runs don't fire 5 lookups for one dial.
  const lookedUpForRef = useRef<string | null>(null);

  // Lookup on new outbound dial.
  useEffect(() => {
    if (!user) return;
    const phone = callState.pendingDial;
    if (!phone) return;
    if (lookedUpForRef.current === phone) return;
    lookedUpForRef.current = phone;

    // Open Atlas so the suggestion is visible — matches the auto-open
    // behavior we already do when callStatus moves off 'idle' (AtlasPanel),
    // but Atlas usually isn't open during the dialer-only phase. The
    // suggestion is the whole point of this hook, so make sure the agent
    // can see it.
    setPanelOpen(true);

    void lookupLeadByPhone(phone).then((res) => {
      if (res.success) {
        addLeadSuggestion({
          id: newId(),
          kind: 'identified',
          lead: res.data,
          phone,
          ts: Date.now(),
        });
      } else {
        addLeadSuggestion({
          id: newId(),
          kind: 'create',
          phone,
          ts: Date.now(),
        });
      }
    });
  }, [callState.pendingDial, user, addLeadSuggestion, setPanelOpen]);

  // Clear suggestions when the call session ends — keeps chat from
  // accumulating stale "Calling…" cards across calls.
  useEffect(() => {
    if (!callState.isCallActive) {
      lookedUpForRef.current = null;
      clearLeadSuggestions();
    }
  }, [callState.isCallActive, clearLeadSuggestions]);
}
