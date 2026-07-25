/**
 * Gap 2 — "AI captured N items" nudge.
 *
 * During a call the analysis pipeline queues fill_field/add_drug/… actions;
 * only the lead form consumes them. When captures are waiting and the agent
 * is NOT on a form page, this floating chip (bottom-left, clear of the
 * right-docked Atlas/call panels) offers one click to the right form —
 * the bound lead's edit page, or /leads/new with the dialed number
 * prefilled. Captures survive hangup (CallContext END_CALL), so the nudge
 * keeps working after the call until applied or a new call starts.
 */
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useCallContext } from '../../context/CallContext';

/** Action types the lead form can actually apply. */
const FORM_ACTION_TYPES = new Set([
  'fill_field',
  'add_drug',
  'add_pharmacy',
  'add_provider',
  'add_note',
]);

export function PendingCaptureNudge(): React.JSX.Element | null {
  const { state } = useCallContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [dismissedAtCount, setDismissedAtCount] = useState(0);

  const count = state.pendingActions.filter((a) => FORM_ACTION_TYPES.has(a.type)).length;

  // Hidden when: nothing captured, already on the consumer form, or the
  // agent dismissed at this count (new captures re-surface it).
  const onLeadForm =
    location.pathname === '/leads/new' || /^\/leads\/[^/]+\/edit$/.test(location.pathname);
  if (count === 0 || onLeadForm || count <= dismissedAtCount) return null;

  const openForm = (): void => {
    if (state.leadId) {
      navigate(`/leads/${state.leadId}/edit`);
      return;
    }
    const phone = state.incomingCaller?.number ?? state.dialedNumber;
    navigate(phone ? `/leads/new?phone=${encodeURIComponent(phone)}` : '/leads/new');
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 pl-3 pr-2 py-2 rounded-full shadow-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/90 backdrop-blur">
      <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <button
        onClick={openForm}
        className="text-sm font-medium text-amber-900 dark:text-amber-100 hover:underline"
      >
        AI captured {count} item{count > 1 ? 's' : ''} — open lead form
      </button>
      <button
        onClick={() => setDismissedAtCount(count)}
        className="p-1 rounded-full hover:bg-amber-100 dark:hover:bg-amber-800/60 text-amber-500"
        aria-label="Dismiss capture nudge"
        title="Dismiss (reappears on new captures)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
