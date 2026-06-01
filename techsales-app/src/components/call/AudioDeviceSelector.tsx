/**
 * Phase 2.5 — Compact mic + speaker device picker for in-call audio routing.
 *
 * Reads `device.audio.availableInputDevices` / `availableOutputDevices`
 * (Twilio Voice SDK reactive Maps). Reacts to `deviceChange` events so a
 * Bluetooth headset reconnecting (which gets a fresh deviceId) doesn't
 * leave a dangling persisted selection.
 *
 * Persistence: localStorage. Stores both `deviceId` and `label` so we can
 * fall back to a label match when the id changes (common with hot-plug).
 * Ultimate fallback: 'default' system device.
 *
 * `setSinkId` (output device) has uneven browser support (Safari/Firefox
 * limited). Failures are caught and surfaced as a small inline warning.
 */
import { useEffect, useMemo, useState } from 'react';
import { Mic, Volume2 } from 'lucide-react';
import { useCallRuntime } from './CallRuntime';

const STORAGE_KEY = 'techsales:call-audio-devices';

interface PersistedDevices {
  inputDeviceId?: string;
  inputLabel?: string;
  outputDeviceId?: string;
  outputLabel?: string;
}

interface DeviceOption {
  id: string;
  label: string;
}

function loadPersisted(): PersistedDevices {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedDevices;
  } catch {
    return {};
  }
}

function savePersisted(p: PersistedDevices): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore quota / privacy mode
  }
}

/**
 * Walks a (possibly-stale) deviceId/label pair against the live device list
 * and returns the best-effort match: exact id > label match > 'default'.
 */
function resolveSelection(
  list: DeviceOption[],
  persistedId?: string,
  persistedLabel?: string,
): string {
  if (list.length === 0) return 'default';
  if (persistedId) {
    const byId = list.find((d) => d.id === persistedId);
    if (byId) return byId.id;
  }
  if (persistedLabel) {
    const byLabel = list.find((d) => d.label === persistedLabel);
    if (byLabel) return byLabel.id;
  }
  return 'default';
}

/**
 * Convert a Twilio-style Map<string, MediaDeviceInfo> (or similar shape)
 * to a flat array of `{id, label}` options.
 */
function devicesToOptions(devices: unknown): DeviceOption[] {
  if (!devices) return [];
  const out: DeviceOption[] = [];
  // Twilio uses a Map-like with `.forEach((info, id) => ...)`.
  try {
    (devices as Map<string, MediaDeviceInfo>).forEach((info, id) => {
      out.push({ id, label: info?.label || id });
    });
  } catch {
    // ignore
  }
  return out;
}

export function AudioDeviceSelector() {
  const runtime = useCallRuntime();
  // getDevice() returns null until the Twilio Device has been initialized
  // (first dial). After that we read `device.audio` for the input/output
  // selectors. QA H1 fix — Phase 2.5 originally tried to read `runtime.device`
  // which didn't exist; selector was dead code.
  const device = runtime.getDevice();
  const audio = (device as { audio?: unknown } | null | undefined)?.audio as
    | {
        availableInputDevices?: Map<string, MediaDeviceInfo>;
        availableOutputDevices?: Map<string, MediaDeviceInfo>;
        setInputDevice?: (id: string) => Promise<unknown>;
        speakerDevices?: { set: (ids: string[]) => Promise<unknown> };
        on?: (event: string, cb: () => void) => void;
        off?: (event: string, cb: () => void) => void;
      }
    | undefined;

  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Re-render on deviceChange events (hot-plug, Bluetooth reconnect, etc.).
  useEffect(() => {
    if (!audio?.on || !audio?.off) return;
    const handler = (): void => setTick((t) => t + 1);
    audio.on('deviceChange', handler);
    return () => audio.off?.('deviceChange', handler);
  }, [audio]);

  const inputs = useMemo(
    () => devicesToOptions(audio?.availableInputDevices),
    // Depend on tick so we re-derive after deviceChange events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audio, tick],
  );
  const outputs = useMemo(
    () => devicesToOptions(audio?.availableOutputDevices),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audio, tick],
  );

  const persisted = useMemo(() => loadPersisted(), []);
  const selectedInput = resolveSelection(inputs, persisted.inputDeviceId, persisted.inputLabel);
  const selectedOutput = resolveSelection(outputs, persisted.outputDeviceId, persisted.outputLabel);

  const onChangeInput = async (id: string): Promise<void> => {
    setError(null);
    const label = inputs.find((d) => d.id === id)?.label;
    savePersisted({ ...loadPersisted(), inputDeviceId: id, inputLabel: label });
    try {
      await audio?.setInputDevice?.(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set mic');
    }
  };

  const onChangeOutput = async (id: string): Promise<void> => {
    setError(null);
    const label = outputs.find((d) => d.id === id)?.label;
    savePersisted({ ...loadPersisted(), outputDeviceId: id, outputLabel: label });
    try {
      await audio?.speakerDevices?.set([id]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to set speaker (browser may not support)',
      );
    }
  };

  // Hide entirely when the Twilio Device hasn't been initialized yet (no
  // active call started). Avoids rendering empty selects.
  if (!audio) return null;

  const selectClass =
    'text-[11px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-1.5 py-0.5 max-w-[140px] truncate';

  return (
    <div className="flex flex-col gap-1 px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
      <div className="flex items-center gap-2">
        <Mic className="w-3 h-3 text-gray-500 dark:text-gray-400 shrink-0" />
        <select
          aria-label="Microphone"
          value={selectedInput}
          onChange={(e) => void onChangeInput(e.target.value)}
          className={selectClass}
        >
          {inputs.length === 0 && <option value="default">Default</option>}
          {inputs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Volume2 className="w-3 h-3 text-gray-500 dark:text-gray-400 shrink-0" />
        <select
          aria-label="Speaker"
          value={selectedOutput}
          onChange={(e) => void onChangeOutput(e.target.value)}
          className={selectClass}
        >
          {outputs.length === 0 && <option value="default">Default</option>}
          {outputs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="text-[10px] text-amber-700 dark:text-amber-400">{error}</p>
      )}
    </div>
  );
}
