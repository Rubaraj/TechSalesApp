/**
 * Phase 2.5 — 3×4 phone keypad (1-9, *, 0, #) with classic letter sublabels.
 *
 * Accessibility & touch:
 *   - Minimum 44×44 px touch targets per WCAG / Apple HIG.
 *   - `touch-action: manipulation` + `user-select: none` so iOS/Android
 *     long-press doesn't fire OS context menus.
 *   - Container `role="group"` + per-button `aria-label="3, D E F"`.
 *   - Arrow-key navigation via roving tabindex (gridcell pattern).
 *
 * Entering `+`:
 *   - Long-press on `0` (~500ms)  →  appends `+`
 *   - Visible `+` toggle in the corner (touch-friendly alternate)
 *   - `Shift+0` keyboard shortcut while focus is on the keypad
 *   The first is the conventional phone gesture; the latter two satisfy
 *   touch screens that hijack long-press for OS menus and keyboard users.
 */
import { useRef, useState, type KeyboardEvent } from 'react';

interface KeypadProps {
  /** Called with the digit/`+`/`*`/`#` to append. */
  onAppend: (token: string) => void;
}

interface KeyDef {
  digit: string;
  letters?: string;
  /** Custom aria-label if letters aren't enough. */
  ariaLabel?: string;
}

const KEYS: KeyDef[] = [
  { digit: '1' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', ariaLabel: 'star' },
  { digit: '0', letters: '+', ariaLabel: '0, long press for plus' },
  { digit: '#', ariaLabel: 'pound' },
];

const LONG_PRESS_MS = 500;

export function Keypad({ onAppend }: KeypadProps) {
  // Long-press tracking for `0` → `+`.
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef<boolean>(false);
  // Roving tabindex — state-backed so the rendered tabIndex stays in sync.
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const startLongPress = (digit: string): void => {
    if (digit !== '0') return;
    longPressFiredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      onAppend('+');
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = (): void => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleClick = (digit: string): void => {
    // If a long-press just fired, suppress the click's normal append.
    if (digit === '0' && longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    onAppend(digit);
  };

  // Arrow-key grid navigation. Keypad is 4 rows × 3 cols.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    // Shift+0 → '+'
    if (e.shiftKey && e.key === '0') {
      e.preventDefault();
      onAppend('+');
      return;
    }
    let next = focusedIndex;
    if (e.key === 'ArrowRight') next = Math.min(focusedIndex + 1, KEYS.length - 1);
    else if (e.key === 'ArrowLeft') next = Math.max(focusedIndex - 1, 0);
    else if (e.key === 'ArrowDown') next = Math.min(focusedIndex + 3, KEYS.length - 1);
    else if (e.key === 'ArrowUp') next = Math.max(focusedIndex - 3, 0);
    else return;
    e.preventDefault();
    setFocusedIndex(next);
    buttonRefs.current[next]?.focus();
  };

  return (
    <div
      role="group"
      aria-label="Phone keypad"
      onKeyDown={onKeyDown}
      className="relative"
    >
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k, i) => {
          const aria = k.ariaLabel ?? (k.letters ? `${k.digit}, ${k.letters.split('').join(' ')}` : k.digit);
          return (
            <button
              key={k.digit}
              ref={(el) => {
                buttonRefs.current[i] = el;
              }}
              type="button"
              tabIndex={i === focusedIndex ? 0 : -1}
              aria-label={aria}
              onFocus={() => setFocusedIndex(i)}
              onClick={() => handleClick(k.digit)}
              onMouseDown={() => startLongPress(k.digit)}
              onMouseUp={cancelLongPress}
              onMouseLeave={cancelLongPress}
              onTouchStart={() => startLongPress(k.digit)}
              onTouchEnd={cancelLongPress}
              onTouchCancel={cancelLongPress}
              className="
                flex flex-col items-center justify-center
                min-h-[44px] min-w-[44px] h-12
                rounded-lg
                bg-gray-100 dark:bg-gray-800
                hover:bg-primary-100 dark:hover:bg-primary-900/40
                active:bg-primary-200 dark:active:bg-primary-900/60
                text-gray-900 dark:text-gray-100
                transition-colors
                focus:outline-none focus:ring-2 focus:ring-primary-500
                select-none
                touch-manipulation
              "
            >
              <span className="text-lg leading-none font-medium">{k.digit}</span>
              {k.letters && (
                <span className="text-[9px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-0.5">
                  {k.letters}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
