/**
 * Phase 2.5 — Keypad-style dialer.
 *
 *   Top: formatted input (display = `formatPhoneUS(buffer)`, internal state
 *        is the digits-only buffer; normalized per keystroke so paste of
 *        `(415) 555-1234` works correctly).
 *   Middle: collapsible Keypad (chevron toggle; state per session in
 *           sessionStorage; defaults to expanded).
 *   Below: RecentCallsStrip — auto-dial-on-click chips.
 *   Bottom: full-width themed Call button.
 *
 * Pure UI — receives `dial`, `isDialing`, `error` as props (from CallPanel
 * → useCallRuntime). NEVER calls useTwilioCall itself; Phase 2 had that
 * bug, the Phase 2.5 plan-review fix moved hook ownership to CallRuntime.
 */
import { useEffect, useState } from 'react';
import { Phone, AlertTriangle, ChevronDown, ChevronUp, Delete } from 'lucide-react';
import {
  normalizeToE164,
  formatPhoneUS,
  toDigitsOnly,
} from '../../utils/phoneUtils';
import { Keypad } from './Keypad';
import { RecentCallsStrip } from './RecentCallsStrip';

const KEYPAD_COLLAPSED_KEY = 'techsales:dialer-keypad-collapsed';

interface DialerProps {
  dial: (toE164: string) => Promise<void>;
  isDialing: boolean;
  error: string | null;
}

export function Dialer({ dial, isDialing, error }: DialerProps) {
  // Single source of truth: a "digits" buffer that may also contain a
  // leading `+` for international. Display + E.164 both derive from this.
  const [buffer, setBuffer] = useState<string>('');
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [keypadCollapsed, setKeypadCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(KEYPAD_COLLAPSED_KEY) === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(KEYPAD_COLLAPSED_KEY, keypadCollapsed ? '1' : '0');
  }, [keypadCollapsed]);

  /** Normalize whatever the user typed/pasted into a digits-only buffer
   *  (preserving a leading `+`). Garbage chars are stripped. */
  const normalizeBuffer = (raw: string): string => {
    const hasPlus = raw.trim().startsWith('+');
    const digits = toDigitsOnly(raw);
    return hasPlus ? `+${digits}` : digits;
  };

  const display = buffer.startsWith('+') ? buffer : formatPhoneUS(buffer);
  const e164 = normalizeToE164(buffer);
  const canDial = !isDialing && e164 !== null;

  const append = (token: string): void => {
    setLocalErr(null);
    setBuffer((prev) => {
      // Special: `+` is only allowed as first character.
      if (token === '+') {
        if (prev.startsWith('+') || prev.length > 0) return prev;
        return '+';
      }
      return prev + token;
    });
  };

  const backspace = (): void => {
    setLocalErr(null);
    setBuffer((prev) => prev.slice(0, -1));
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setLocalErr(null);
    setBuffer(normalizeBuffer(e.target.value));
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void onDial();
    }
  };

  const onDial = async (): Promise<void> => {
    setLocalErr(null);
    if (!e164) {
      setLocalErr('Enter a valid US 10-digit number or full E.164 (e.g. +14155551234).');
      return;
    }
    try {
      await dial(e164);
    } catch (err) {
      setLocalErr(err instanceof Error ? err.message : String(err));
    }
  };

  const errMsg = localErr ?? error;

  return (
    <div className="flex flex-col">
      {/* --- Input row --- */}
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="tel"
            value={display}
            onChange={onInputChange}
            onKeyDown={onInputKey}
            placeholder="(415) 555-1234"
            disabled={isDialing}
            inputMode="tel"
            className="flex-1 px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 font-mono"
            aria-label="Phone number"
          />
          <button
            type="button"
            onClick={backspace}
            disabled={isDialing || buffer.length === 0}
            className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Delete last digit"
            title="Backspace"
          >
            <Delete className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setKeypadCollapsed((c) => !c)}
            className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={keypadCollapsed ? 'Show keypad' : 'Hide keypad'}
            aria-expanded={!keypadCollapsed}
            title={keypadCollapsed ? 'Show keypad' : 'Hide keypad'}
          >
            {keypadCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {errMsg && (
          <div className="flex gap-2 p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{errMsg}</p>
          </div>
        )}
      </div>

      {/* --- Keypad (collapsible) --- */}
      {!keypadCollapsed && (
        <div className="px-3 pb-3">
          <Keypad onAppend={append} />
        </div>
      )}

      {/* --- Recents --- */}
      <RecentCallsStrip onEdit={(to) => setBuffer(normalizeBuffer(to))} />

      {/* --- Call button --- */}
      <div className="p-3">
        <button
          type="button"
          onClick={() => void onDial()}
          disabled={!canDial}
          className="
            w-full inline-flex items-center justify-center gap-2
            px-4 py-2.5 rounded-md
            bg-primary-600 hover:bg-primary-700
            disabled:opacity-40 disabled:cursor-not-allowed
            text-white text-sm font-semibold
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-primary-500
          "
          aria-label={isDialing ? 'Dialing' : 'Call'}
        >
          <Phone className="w-4 h-4" />
          {isDialing ? 'Dialing…' : 'Call'}
        </button>
      </div>
    </div>
  );
}
