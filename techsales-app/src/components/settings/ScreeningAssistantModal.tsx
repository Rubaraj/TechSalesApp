/**
 * AI Persona — the screening assistant's setup popup (Atlas gear menu).
 *
 * Lets the signed-in agent tune the persona the assistant uses when it
 * answers inbound calls on their behalf: voice, opening greeting
 * (`{agent}` expands to the agent's name), and extra personality/style
 * instructions. The backend layers the instructions on top of the fixed
 * triage guardrails (no selling, discloses it's automated) — those can't
 * be overridden here.
 */
import { useCallback, useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useAuth } from '../../context/AuthContext';
import {
  getScreeningPersona,
  saveScreeningPersona,
  resetScreeningPersona,
  type ScreeningPersonaFields,
  type ScreeningVoiceOption,
} from '../../services/screeningPersonaService';

interface ScreeningAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const inputClass =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 ' +
  'px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent';

const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const hintClass = 'mt-1 text-xs text-gray-500 dark:text-gray-400';

interface ToggleRowProps {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

/** Checkbox styled as a settings row — label and hint are the click target. */
function ToggleRow({ id, label, hint, checked, onChange }: ToggleRowProps) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 shrink-0 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-2 focus:ring-primary-500"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
        <span className="block mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</span>
      </span>
    </label>
  );
}

export function ScreeningAssistantModal({ isOpen, onClose }: ScreeningAssistantModalProps) {
  const { user } = useAuth();
  const userId = user?.userId ?? '';

  // Mounted fresh on every open (Header renders this conditionally), so
  // the "reset" states are simply the initial states — no effect needed.
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [voices, setVoices] = useState<ScreeningVoiceOption[]>([]);
  const [defaults, setDefaults] = useState<ScreeningPersonaFields | null>(null);
  const [isCustomized, setIsCustomized] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [instructions, setInstructions] = useState('');
  const [voice, setVoice] = useState('');
  const [offerPlans, setOfferPlans] = useState(true);
  const [createLeadLive, setCreateLeadLive] = useState(true);

  useEffect(() => {
    if (!isOpen || !userId) return;
    let stale = false;
    getScreeningPersona(userId)
      .then(({ persona, defaults: d, voices: v }) => {
        if (stale) return;
        setVoices(v);
        setDefaults(d);
        setIsCustomized(persona !== null);
        const active = persona ?? d;
        setGreeting(active.greeting);
        setInstructions(active.instructions);
        setVoice(active.voice);
        // Personas saved before these toggles existed have them undefined —
        // treat that as on, matching the backend's default.
        setOfferPlans(active.offerPlans !== false);
        setCreateLeadLive(active.createLeadLive !== false);
      })
      .catch((err: unknown) => {
        if (!stale) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!stale) setIsLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [isOpen, userId]);

  const onSave = useCallback(() => {
    if (!userId) return;
    setIsSaving(true);
    setError(null);
    saveScreeningPersona(userId, { greeting, instructions, voice, offerPlans, createLeadLive })
      .then(() => onClose())
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setIsSaving(false));
  }, [userId, greeting, instructions, voice, offerPlans, createLeadLive, onClose]);

  const onReset = useCallback(() => {
    if (!userId || !defaults) return;
    setIsSaving(true);
    setError(null);
    resetScreeningPersona(userId)
      .then(() => {
        setIsCustomized(false);
        setGreeting(defaults.greeting);
        setInstructions(defaults.instructions);
        setVoice(defaults.voice);
        setOfferPlans(defaults.offerPlans !== false);
        setCreateLeadLive(defaults.createLeadLive !== false);
        setNotice('Reset to the built-in persona. Takes effect on the next screened call.');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setIsSaving(false));
  }, [userId, defaults]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AI Persona"
      size="lg"
      footer={
        <>
          <div className="mr-auto">
            <Button
              variant="outline"
              onClick={onReset}
              disabled={isLoading || isSaving || !isCustomized}
              title="Discard your changes and go back to the built-in persona"
            >
              Reset to default
            </Button>
          </div>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSave}
            isLoading={isSaving}
            disabled={isLoading || !greeting.trim() || !voice}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
          <Bot className="w-4 h-4 mt-0.5 shrink-0 text-violet-600 dark:text-violet-400" />
          <p className="text-xs text-violet-800 dark:text-violet-300">
            This is the assistant that answers inbound calls on your behalf — when you click{' '}
            <span className="font-semibold">Screen</span>, and when a call goes unanswered. It
            always discloses that it&apos;s automated and never advises which plan to choose;
            everything else below is yours to set. Changes apply from the next screened call.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300">
            {notice}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">Loading…</p>
        ) : (
          <>
            <div>
              <label htmlFor="screening-voice" className={labelClass}>
                Voice
              </label>
              <select
                id="screening-voice"
                className={inputClass}
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="screening-greeting" className={labelClass}>
                Greeting
              </label>
              <textarea
                id="screening-greeting"
                className={inputClass}
                rows={3}
                maxLength={400}
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
              />
              <p className={hintClass}>
                The first thing the assistant says when it picks up.{' '}
                <code className="px-1 rounded bg-gray-100 dark:bg-gray-700">{'{agent}'}</code> is
                replaced with your name.
              </p>
            </div>

            <div className="space-y-2.5">
              <ToggleRow
                id="screening-create-lead"
                label="Can save the lead during the call"
                hint="Lets the assistant open the lead screen and write the record while you watch. Off means it can't — it still takes the details, but the lead is only created when the call ends."
                checked={createLeadLive}
                onChange={setCreateLeadLive}
              />
              <ToggleRow
                id="screening-offer-plans"
                label="Can look up available plans"
                hint="Lets the assistant search plans for the caller's area and state what it finds — facts only, never a recommendation. Off means it can't look them up at all, even if your playbook asks it to."
                checked={offerPlans}
                onChange={setOfferPlans}
              />
            </div>

            <div>
              <label htmlFor="screening-instructions" className={labelClass}>
                Call playbook
              </label>
              <textarea
                id="screening-instructions"
                className={`${inputClass} font-mono text-xs leading-relaxed`}
                rows={10}
                maxLength={4000}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
              <p className={hintClass}>
                The whole flow of the call — what the assistant asks, and in what order. Edit any
                step or add your own; whatever is here is exactly what it follows. Use{' '}
                <span className="font-medium">Reset to default</span> to start from the shipped
                flow again.
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
