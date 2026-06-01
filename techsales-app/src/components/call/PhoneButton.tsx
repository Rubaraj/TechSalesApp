/**
 * Phase 2.5 — Reusable click-to-dial button.
 *
 * Drops in next to any phone-number display (LeadDetail card, LeadList row,
 * AgentLeads row, etc.). On click it normalizes the phone, opens a
 * 3-second "Dialing X… [Cancel]" toast, then funnels through
 * `CallContext.dialNumber({to, leadId, leadName})`. The cancel toast is
 * the cheap UX safety net for one-click dialing — agent can abort within
 * 3s if they misclicked, with a single click.
 *
 * Visibility / disabled state:
 *   - Hidden when `!isValidPhone(phone)` (data quality safeguard).
 *   - Hidden when `!useTwilioEnabled()` OR user is admin (same gate as
 *     the header Start Call button).
 *   - Disabled (not hidden) when a call is already active — tooltip reads
 *     "Already on a call with <dialedNumber>". Prevents the agent from
 *     dialing a second lead while still on the first.
 */
import { useEffect, useRef, useState } from 'react';
import { Phone, X as XIcon } from 'lucide-react';
import { useCallContext } from '../../context/CallContext';
import { useTwilioEnabled } from '../../hooks/useTwilioEnabled';
import { useAuth } from '../../context/AuthContext';
import { useCallRuntime } from './CallRuntime';
import { isValidPhone, normalizeToE164, formatPhoneUS } from '../../utils/phoneUtils';

const CANCEL_WINDOW_MS = 3000;

// QA H2 — module-level armed flag so two PhoneButton instances on different
// leads can't each arm their own 3-second timer in parallel. First click
// arms; subsequent clicks on ANY PhoneButton are blocked until this clears
// (either via cancel or after dial fires).
let _armedGlobally = false;

interface PhoneButtonProps {
  /** Raw phone string (any format). Normalized via `normalizeToE164`. */
  phone: string | null | undefined;
  leadId?: string;
  leadName?: string;
  variant?: 'primary' | 'icon-only';
  /** Optional override label; defaults to the formatted number. */
  label?: string;
  /** Optional className passthrough for layout tweaks. */
  className?: string;
}

export function PhoneButton({
  phone,
  leadId,
  leadName,
  variant = 'primary',
  label,
  className = '',
}: PhoneButtonProps) {
  const { state, dialNumber } = useCallContext();
  const { hangup } = useCallRuntime();
  const aiOn = useTwilioEnabled();
  const { user } = useAuth();
  const isAdmin = user?.accessLevel === 'admin' || user?.isSuperAdmin;

  // Cancel toast state. When non-null, a "Dialing X — Cancel" banner is
  // visible and the dial hasn't been issued yet.
  const [pendingTo, setPendingTo] = useState<string | null>(null);
  const cancelTimerRef = useRef<number | null>(null);
  // Tracks whether the dial has fired (timer expired) so cancelDial can
  // decide between "clear the toast" vs "hangup the in-flight call".
  // MUST be declared before any early-return below per rules-of-hooks.
  const dialFiredRef = useRef<boolean>(false);

  // QA M6 — abort an armed-but-not-yet-fired dial on unmount so the call
  // doesn't go through after the agent navigated away.
  useEffect(() => {
    return () => {
      if (cancelTimerRef.current !== null) {
        window.clearTimeout(cancelTimerRef.current);
        cancelTimerRef.current = null;
        // Release the global armed flag so another button can arm.
        _armedGlobally = false;
      }
    };
  }, []);

  // Visibility gates.
  if (!aiOn) return null;
  if (isAdmin) return null;
  if (!isValidPhone(phone)) return null;

  const e164 = normalizeToE164(String(phone))!;
  const displayLabel = label ?? formatPhoneUS(phone ?? '');
  const isCallActive = state.isCallActive;
  const dialedDisplay = state.dialedNumber ? formatPhoneUS(state.dialedNumber) : null;

  const startDial = (): void => {
    // QA H2 — refuse if another PhoneButton instance is already armed.
    if (_armedGlobally) return;
    // Also refuse if a call is already happening (defense-in-depth; the
    // button itself is `disabled` in that state, but keyboard activation
    // can sometimes bypass).
    if (state.isCallActive || state.pendingDial !== null) return;

    _armedGlobally = true;
    dialFiredRef.current = false;
    setPendingTo(e164);
    cancelTimerRef.current = window.setTimeout(() => {
      cancelTimerRef.current = null;
      dialFiredRef.current = true;
      // QA M16 — do not call dispatch inside a setState updater. Clear the
      // toast first, then fire dial.
      setPendingTo(null);
      _armedGlobally = false;
      dialNumber({ to: e164, leadId, leadName });
    }, CANCEL_WINDOW_MS);
  };

  const cancelDial = (): void => {
    if (cancelTimerRef.current !== null) {
      window.clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
    }
    // QA M5 — if the dial has fired but the call hasn't picked up yet,
    // hangup() unconditionally; it no-ops when there's no Device handle.
    if (dialFiredRef.current || state.isCallActive) {
      void hangup();
    }
    _armedGlobally = false;
    dialFiredRef.current = false;
    setPendingTo(null);
  };

  // Toast rendering: shown only while we're within the 3s cancel window.
  const showToast = pendingTo !== null;

  // Styling per variant.
  const baseBtn = 'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors';
  const sizeBtn = variant === 'icon-only' ? 'p-1.5' : 'px-2.5 py-1.5 text-xs';
  const colorBtn = isCallActive
    ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
    : 'bg-primary-600 hover:bg-primary-700 text-white';
  const cancelBtn = 'bg-red-600 hover:bg-red-700 text-white';

  return (
    <>
      {!showToast ? (
        <button
          type="button"
          onClick={startDial}
          disabled={isCallActive}
          className={`${baseBtn} ${sizeBtn} ${colorBtn} ${className}`}
          aria-label={`Call ${leadName ?? displayLabel}`}
          title={
            isCallActive
              ? `Already on a call${dialedDisplay ? ` with ${dialedDisplay}` : ''}`
              : `Call ${leadName ? `${leadName} at ` : ''}${displayLabel}`
          }
        >
          <Phone className={variant === 'icon-only' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
          {variant === 'primary' && <span>Call</span>}
        </button>
      ) : (
        <span
          className={`${baseBtn} ${sizeBtn} ${cancelBtn} ${className}`}
          role="status"
          aria-live="polite"
        >
          <span className="text-[10px] uppercase tracking-wider opacity-90">Dialing…</span>
          <button
            type="button"
            onClick={cancelDial}
            className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-700/60 hover:bg-red-700 transition-colors"
            aria-label="Cancel dial"
          >
            <XIcon className="w-3 h-3" />
            <span>Cancel</span>
          </button>
        </span>
      )}
    </>
  );
}
