/**
 * Phase 4 — In-call audio device picker, extracted into a hook +
 * presentation-agnostic rows so it can render inside Atlas's settings
 * dropdown (replacing the old footer inside the call panel).
 *
 * The hook (`useAudioDevices`) handles:
 *   - reading `device.audio.availableInputDevices` / `availableOutputDevices`
 *     (Twilio Voice SDK reactive Maps),
 *   - reacting to `deviceChange` events so a hot-plug / Bluetooth reconnect
 *     (fresh deviceId) doesn't leave a dangling persisted selection,
 *   - localStorage persistence with deviceId-then-label-then-default fallback
 *     so a saved choice survives across sessions even when ids rotate.
 *
 * `setSinkId` (output device) has uneven browser support (Safari/Firefox
 * limited). Failures are surfaced via the hook's `error` field.
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

export interface DeviceOption {
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

function devicesToOptions(devices: unknown): DeviceOption[] {
  if (!devices) return [];
  const out: DeviceOption[] = [];
  try {
    (devices as Map<string, MediaDeviceInfo>).forEach((info, id) => {
      out.push({ id, label: info?.label || id });
    });
  } catch {
    // ignore
  }
  return out;
}

export interface UseAudioDevicesResult {
  available: boolean;
  inputs: DeviceOption[];
  outputs: DeviceOption[];
  selectedInput: string;
  selectedOutput: string;
  onChangeInput: (id: string) => Promise<void>;
  onChangeOutput: (id: string) => Promise<void>;
  error: string | null;
}

export function useAudioDevices(): UseAudioDevicesResult {
  const runtime = useCallRuntime();
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

  useEffect(() => {
    if (!audio?.on || !audio?.off) return;
    const handler = (): void => setTick((t) => t + 1);
    audio.on('deviceChange', handler);
    return () => audio.off?.('deviceChange', handler);
  }, [audio]);

  const inputs = useMemo(
    () => devicesToOptions(audio?.availableInputDevices),
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

  return {
    available: !!audio,
    inputs,
    outputs,
    selectedInput,
    selectedOutput,
    onChangeInput,
    onChangeOutput,
    error,
  };
}

/**
 * Atlas-styled audio device picker. Renders nothing when the Twilio
 * device hasn't been initialized (no active call). Mounts inline within
 * the Atlas settings dropdown — uses atlas-* tokens so it matches the
 * surrounding menu chrome.
 */
export function AudioDevicePickerRows(): React.JSX.Element | null {
  const {
    available,
    inputs,
    outputs,
    selectedInput,
    selectedOutput,
    onChangeInput,
    onChangeOutput,
    error,
  } = useAudioDevices();

  if (!available) return null;

  const selectStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    background: 'var(--color-atlas-surface-3)',
    color: 'var(--color-atlas-fg)',
    border: '1px solid var(--color-atlas-border)',
    borderRadius: 6,
    padding: '4px 6px',
  };

  return (
    <div
      className="px-3 py-2 flex flex-col gap-1.5"
      style={{ borderTop: '1px solid var(--color-atlas-border)' }}
    >
      <p
        className="text-[9.5px] font-bold uppercase tracking-[0.08em] mb-0.5"
        style={{ color: 'var(--color-atlas-fg-subtle)' }}
      >
        Audio devices
      </p>
      <div className="flex items-center gap-2">
        <Mic className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-atlas-fg-muted)' }} />
        <select
          aria-label="Microphone"
          value={selectedInput}
          onChange={(e) => void onChangeInput(e.target.value)}
          style={selectStyle}
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
        <Volume2
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: 'var(--color-atlas-fg-muted)' }}
        />
        <select
          aria-label="Speaker"
          value={selectedOutput}
          onChange={(e) => void onChangeOutput(e.target.value)}
          style={selectStyle}
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
        <p
          className="text-[10px] mt-0.5"
          style={{ color: 'var(--color-warning, #f59e0b)' }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** Backwards-compat alias for the dead `CallPanel.tsx`, which still
 *  imports the old name. CallPanel itself is no longer mounted; this
 *  keeps the type-check clean without breaking any active surface. */
export const AudioDeviceSelector = AudioDevicePickerRows;
