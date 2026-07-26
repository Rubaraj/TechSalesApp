/**
 * Gap 3 — auto-open the matching lead when a call connects.
 *
 * On the callStatus → 'connected' transition (once per call):
 *   - call already bound to a lead (dialed from a lead page / Atlas dial):
 *     navigate to it if not already there — no popup;
 *   - exactly ONE lead matches the number: bind + auto-navigate;
 *   - MULTIPLE leads share the number: selection popup — pick one (bind +
 *     navigate), start a New lead (/leads/new?phone=…), or Skip;
 *   - NO match: same popup in its "no lead found" variant (New lead / Skip)
 *     — creating a record stays one deliberate click.
 *
 * Mounted once in Layout. Uses the existing lookupLeadsByPhone last-10
 * matching; bindCurrentCallToLead ties the call for downstream surfaces.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PhoneIncoming, UserPlus, X, ChevronRight } from 'lucide-react';
import { Modal, Button, Badge } from '../common';
import { useCallContext } from '../../context/CallContext';
import { useAtlas } from '../../context/AtlasContext';
import { lookupLeadsByPhone, type LeadPhoneLookup } from '../../services/leadService';

/** Module-level so the react-hooks purity analyzer doesn't flag the
 *  impure id/timestamp generation inside an event handler. */
function makeIdentifiedSuggestion(lead: LeadPhoneLookup, phone: string) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'identified' as const,
    lead,
    phone,
    ts: Date.now(),
  };
}

const STATUS_BADGE: Record<string, 'info' | 'primary' | 'warning' | 'success' | 'danger' | 'default'> = {
  'New Lead': 'info',
  'Contacted Lead': 'primary',
  'Appointment Schedule': 'warning',
  'Enrollment in progress': 'warning',
  Enrolled: 'success',
  'Dropped / Lost lead': 'danger',
};

export function CallLeadRoutingHost(): React.JSX.Element | null {
  const { state, bindCurrentCallToLead } = useCallContext();
  const { addLeadSuggestion } = useAtlas();
  const navigate = useNavigate();
  const location = useLocation();

  const [popup, setPopup] = useState<{
    number: string;
    matches: LeadPhoneLookup[];
    /** Outbound = selection binds only (the Atlas card opens the lead);
     *  inbound = selection binds AND navigates (the original gap). */
    direction: 'inbound' | 'outbound';
  } | null>(null);
  // One routing decision per call.
  const routedCallIdRef = useRef<string | null>(null);
  const locationRef = useRef(location.pathname);
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  const { callId, callStatus, leadId, incomingCaller, dialedNumber, direction } = {
    callId: state.callId,
    callStatus: state.callStatus,
    leadId: state.leadId,
    incomingCaller: state.incomingCaller,
    dialedNumber: state.dialedNumber,
    direction: state.direction,
  };

  useEffect(() => {
    if (callStatus !== 'connected' || !callId) return;
    if (routedCallIdRef.current === callId) return;
    routedCallIdRef.current = callId;

    const isInbound = direction === 'inbound';

    // Already bound (PhoneButton / Atlas dial with leadId, or single-match
    // ring identification): inbound auto-opens the lead; outbound leaves
    // navigation to the Atlas "Open lead" card (agent chose whom to call).
    if (leadId) {
      if (isInbound) {
        const target = `/leads/${leadId}`;
        if (locationRef.current !== target) navigate(target);
      }
      return;
    }

    const number = incomingCaller?.number ?? dialedNumber;
    if (!number) return;

    void lookupLeadsByPhone(number).then((matches) => {
      if (matches.length === 1) {
        bindCurrentCallToLead(matches[0].leadId);
        if (isInbound) {
          const target = `/leads/${matches[0].leadId}`;
          if (locationRef.current !== target) navigate(target);
        }
        return;
      }
      // Outbound zero-match: the Atlas CreateLeadCard already covers it —
      // no popup noise. Inbound zero-match keeps the popup (create/skip).
      if (matches.length === 0 && !isInbound) return;
      setPopup({ number, matches, direction: isInbound ? 'inbound' : 'outbound' });
    });
  }, [callStatus, callId, leadId, incomingCaller, dialedNumber, direction, bindCurrentCallToLead, navigate]);

  if (!popup) return null;

  // Gaps 3+4 handoff (Option A) — Atlas may have STAGED new-lead values
  // (fill_lead_form) before this popup appeared. Declining the listed
  // matches then clearly means "continue with the staged new lead", so
  // Skip routes to the form too (the amber hint below announces it), and
  // the ?phone= prefill is dropped whenever a staged phone exists so the
  // dialed number never overwrites the dictated one.
  const stagedFills = state.pendingActions.filter((a) => a.type === 'fill_field');
  const hasStagedPhone = stagedFills.some(
    (a) => a.type === 'fill_field' && a.field === 'phone' && typeof a.value === 'string' && a.value,
  );
  const hasStagedData = stagedFills.length > 0;

  const openNewLeadForm = (): void => {
    setPopup(null);
    navigate(
      hasStagedPhone ? '/leads/new' : `/leads/new?phone=${encodeURIComponent(popup.number)}`,
    );
  };
  const closePopup = (): void => {
    if (hasStagedData) {
      openNewLeadForm();
      return;
    }
    setPopup(null);
  };
  const selectLead = (lead: LeadPhoneLookup): void => {
    bindCurrentCallToLead(lead.leadId);
    const isInbound = popup.direction === 'inbound';
    setPopup(null);
    if (isInbound) {
      navigate(`/leads/${lead.leadId}`);
    } else {
      // Outbound: selection only BINDS. Push the identified card for the
      // CHOSEN lead so "Open lead" in Atlas points at the right person.
      addLeadSuggestion(makeIdentifiedSuggestion(lead, popup.number));
    }
  };
  const newLead = (): void => openNewLeadForm();

  return (
    <Modal
      isOpen
      onClose={closePopup}
      title={popup.matches.length > 0 ? 'Who are you talking to?' : 'No matching lead'}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={closePopup}>
            <X className="w-4 h-4" />
            Skip
          </Button>
          <Button onClick={newLead}>
            <UserPlus className="w-4 h-4" />
            New lead
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-2 mb-3 text-sm text-gray-500 dark:text-gray-400">
        <PhoneIncoming className="w-4 h-4" />
        {popup.matches.length > 0
          ? `${popup.matches.length} leads share the number ${popup.number} — pick the one on the line, or start fresh.`
          : `No lead found for ${popup.number}. Create one now, or skip and keep the call unlinked.`}
      </div>
      {hasStagedData && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-800 dark:text-amber-300">
          <UserPlus className="w-3.5 h-3.5 shrink-0" />
          Atlas staged new-lead details ({stagedFills.length} field
          {stagedFills.length > 1 ? 's' : ''}) — “New lead” or “Skip” both continue to the form
          with them applied.
        </div>
      )}
      {popup.matches.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {popup.matches.map((lead) => (
            <button
              key={lead.leadId}
              onClick={() => selectLead(lead)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors group"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {lead.firstName} {lead.lastName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {lead.leadId}
                  {lead.state ? ` · ${lead.state}` : ''}
                </p>
              </div>
              {lead.leadStatus && (
                <Badge variant={STATUS_BADGE[lead.leadStatus] ?? 'default'}>
                  {lead.leadStatus}
                </Badge>
              )}
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
