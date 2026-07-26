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
import { lookupLeadsByPhone, type LeadPhoneLookup } from '../../services/leadService';

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
  const navigate = useNavigate();
  const location = useLocation();

  const [popup, setPopup] = useState<{ number: string; matches: LeadPhoneLookup[] } | null>(null);
  // One routing decision per call.
  const routedCallIdRef = useRef<string | null>(null);
  const locationRef = useRef(location.pathname);
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  const { callId, callStatus, leadId, incomingCaller, dialedNumber } = {
    callId: state.callId,
    callStatus: state.callStatus,
    leadId: state.leadId,
    incomingCaller: state.incomingCaller,
    dialedNumber: state.dialedNumber,
  };

  useEffect(() => {
    if (callStatus !== 'connected' || !callId) return;
    if (routedCallIdRef.current === callId) return;
    routedCallIdRef.current = callId;

    // Already bound (PhoneButton / Atlas dial with leadId): just make sure
    // the agent is looking at the lead.
    if (leadId) {
      const target = `/leads/${leadId}`;
      if (locationRef.current !== target) navigate(target);
      return;
    }

    const number = incomingCaller?.number ?? dialedNumber;
    if (!number) return;

    void lookupLeadsByPhone(number).then((matches) => {
      // Call may have ended while we looked up — don't yank the UI then.
      if (matches.length === 1) {
        bindCurrentCallToLead(matches[0].leadId);
        const target = `/leads/${matches[0].leadId}`;
        if (locationRef.current !== target) navigate(target);
        return;
      }
      setPopup({ number, matches });
    });
  }, [callStatus, callId, leadId, incomingCaller, dialedNumber, bindCurrentCallToLead, navigate]);

  if (!popup) return null;

  const closePopup = (): void => setPopup(null);
  const selectLead = (lead: LeadPhoneLookup): void => {
    bindCurrentCallToLead(lead.leadId);
    closePopup();
    navigate(`/leads/${lead.leadId}`);
  };
  const newLead = (): void => {
    const phone = popup.number;
    closePopup();
    navigate(`/leads/new?phone=${encodeURIComponent(phone)}`);
  };

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
