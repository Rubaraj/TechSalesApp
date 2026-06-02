/**
 * Phase 2.6 — Inbound-call ring UI.
 *
 * Replaces the `<Dialer>` slot in `<CallPanel>` when the panel is showing
 * an inbound ringing call. Renders caller info (name if known, else just
 * the number) and Accept (green) / Decline (red) buttons.
 *
 * `acceptIncoming()` / `rejectIncoming()` come from `<CallRuntime>` (the
 * always-mounted host of `useTwilioCall`). The Twilio Call object the
 * buttons operate on is held in `useTwilioCall`'s internal ref.
 */
import { Phone, PhoneOff } from 'lucide-react';
import { useCallContext } from '../../context/CallContext';
import { useCallRuntime } from './CallRuntime';
import { formatPhoneUS } from '../../utils/phoneUtils';

export function IncomingCallView(): React.JSX.Element {
  const { state } = useCallContext();
  const { acceptIncoming, rejectIncoming } = useCallRuntime();
  const caller = state.incomingCaller;

  const displayName = caller?.leadName ?? null;
  const displayNumber = caller?.number ? formatPhoneUS(caller.number) : 'Unknown caller';

  return (
    <div className="flex flex-col items-center justify-center px-6 py-8 gap-4">
      <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center animate-pulse">
        <Phone className="w-8 h-8 text-primary-600 dark:text-primary-400" />
      </div>
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
          Incoming call
        </p>
        {displayName ? (
          <>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {displayName}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
              {displayNumber}
            </p>
          </>
        ) : (
          <p className="text-lg font-semibold text-gray-900 dark:text-white font-mono">
            {displayNumber}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={rejectIncoming}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors shadow"
          aria-label="Decline call"
        >
          <PhoneOff className="w-4 h-4" />
          Decline
        </button>
        <button
          onClick={() => {
            void acceptIncoming();
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors shadow"
          aria-label="Accept call"
        >
          <Phone className="w-4 h-4" />
          Accept
        </button>
      </div>
    </div>
  );
}
