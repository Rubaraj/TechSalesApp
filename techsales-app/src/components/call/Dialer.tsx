/**
 * Phase 4 design — Keypad-style dialer on dark atlas surfaces.
 *
 *   Top: formatted input (digits-only buffer normalized per keystroke).
 *   Middle: collapsible Keypad (session-persisted toggle).
 *   Below: RecentCallsStrip — auto-dial-on-click chips.
 *   Bottom: full-width orange Call button. While dialing, the button is
 *           wrapped in a soft `atlas-pulse-ring` (calm, not frantic spin).
 *
 * Pure UI — receives `dial`, `isDialing`, `error` as props.
 */
import { useEffect, useState } from 'react';
import { Phone, AlertTriangle, ChevronDown, ChevronUp, Delete } from 'lucide-react';
import { normalizeToE164, formatPhoneUS, toDigitsOnly } from '../../utils/phoneUtils';
import { Keypad } from './Keypad';
import { RecentCallsStrip } from './RecentCallsStrip';

const KEYPAD_COLLAPSED_KEY = 'techsales:dialer-keypad-collapsed';

interface DialerProps {
  dial: (toE164: string) => Promise<void>;
  isDialing: boolean;
  error: string | null;
}

export function Dialer({ dial, isDialing, error }: DialerProps) {
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
  const iconBtnStyle = {
    color: 'var(--color-atlas-fg-muted)',
    background: 'transparent',
  } as const;

  return (
    <div className="flex flex-col">
      {/* Input row */}
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
            className="flex-1 px-3 py-2.5 text-base rounded-lg focus:outline-none disabled:opacity-50"
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              letterSpacing: '0.02em',
              background: 'var(--color-atlas-surface-2)',
              color: 'var(--color-atlas-fg)',
              border: '1px solid var(--color-atlas-border-strong)',
            }}
            aria-label="Phone number"
          />
          <button
            type="button"
            onClick={backspace}
            disabled={isDialing || buffer.length === 0}
            className="p-2 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={iconBtnStyle}
            onMouseEnter={(e) => {
              if (!isDialing && buffer.length > 0)
                e.currentTarget.style.background = 'var(--color-atlas-surface-3)';
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            aria-label="Delete last digit"
            title="Backspace"
          >
            <Delete className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setKeypadCollapsed((c) => !c)}
            className="p-2 rounded-md transition-colors"
            style={iconBtnStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-atlas-surface-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            aria-label={keypadCollapsed ? 'Show keypad' : 'Hide keypad'}
            aria-expanded={!keypadCollapsed}
            title={keypadCollapsed ? 'Show keypad' : 'Hide keypad'}
          >
            {keypadCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>

        {errMsg && (
          <div
            className="flex gap-2 p-2 rounded-md text-xs"
            style={{
              background: 'rgba(255,107,107,0.10)',
              border: '1px solid rgba(255,107,107,0.35)',
              color: '#ff6b6b',
            }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{errMsg}</p>
          </div>
        )}
      </div>

      {!keypadCollapsed && (
        <div className="px-3 pb-3">
          <Keypad onAppend={append} />
        </div>
      )}

      <RecentCallsStrip onEdit={(to) => setBuffer(normalizeBuffer(to))} />

      {/* Call button — pulsing ring while dialing */}
      <div className="p-3">
        <button
          type="button"
          onClick={() => void onDial()}
          disabled={!canDial}
          className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
            isDialing ? 'atlas-pulse-ring' : ''
          }`}
          style={{
            background: isDialing ? 'var(--color-exl-orange-press)' : 'var(--color-exl-orange)',
            color: '#fff',
          }}
          onMouseEnter={(e) => {
            if (canDial) e.currentTarget.style.background = 'var(--color-exl-orange-bright)';
          }}
          onMouseLeave={(e) => {
            if (canDial) e.currentTarget.style.background = 'var(--color-exl-orange)';
          }}
          aria-label={isDialing ? 'Dialing' : 'Call'}
        >
          <Phone className="w-4 h-4" />
          {isDialing ? 'Dialing…' : 'Call'}
        </button>
      </div>
    </div>
  );
}
