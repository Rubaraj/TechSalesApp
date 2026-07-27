/**
 * Phase 4 design — Atlas right-docked copilot panel.
 *
 * Visual language: EXL Medicare Hub Design System. Dark-first surfaces
 * (atlas-* tokens in index.css), Newsreader serif on the "Atlas" headline,
 * single settings gear in the header (dropdown replaces the old icon
 * cluster), inline ModeToggle, ~440px default width (drag-resizable).
 *
 * Layout invariant: when a call is active AND the call panel is open,
 * the panel splits exactly 50/50 vertically — top half is CallSection
 * (dialer / transcript), bottom half is the Atlas chat. Otherwise Atlas
 * fills the full height.
 */
import { useEffect, useRef, useState } from 'react';
import { Settings, Mic, MicOff, Compass, History, Plus, X, Bot } from 'lucide-react';
import { useAtlas } from '../../context/AtlasContext';
import { useAuth } from '../../context/AuthContext';
import { useCallContext } from '../../context/CallContext';
import { useTwilioEnabled } from '../../hooks/useTwilioEnabled';
import { ScreeningAssistantModal } from '../settings/ScreeningAssistantModal';
import { ChatPane } from './ChatPane';
import { GreetingCard } from './GreetingCard';
import { ModeToggle } from './ModeToggle';
import { ResumeBanner } from './ResumeBanner';
import { CallSection } from '../call/CallSection';
import { AudioDevicePickerRows } from '../call/AudioDeviceSelector';
import { AtlasMark } from './AtlasMark';
import { NewChatConfirm } from './NewChatConfirm';
import { useAiHealth } from '../../services/aiHealthStore';

// Mirror the clamp values in AtlasContext so the live-drag preview can
// also bound itself; the context's setter is the authoritative clamp.
const MIN_WIDTH = 360;
const MAX_WIDTH = 600;

export function AtlasPanel(): React.JSX.Element | null {
  const { user } = useAuth();
  const {
    messages,
    isStreaming,
    startNewSession,
    isPanelOpen,
    setPanelOpen,
    panelWidth,
    setPanelWidth,
  } = useAtlas();
  const { state: callState, setMute } = useCallContext();
  const callPanelVisible = callState.isCallActive && callState.isCallPanelOpen;
  // Gap 7 — amber "AI degraded" pill in the header when LLM calls fail.
  const aiHealth = useAiHealth();

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  // App-styled "Start a new chat?" confirm — replaces the native
  // window.confirm so the prompt matches the rest of the UI chrome.
  const [confirmNewChat, setConfirmNewChat] = useState(false);
  // AI screening assistant persona popup — reached via the gear menu.
  // Agents only: admins never receive inbound calls to screen.
  const twilioOn = useTwilioEnabled();
  const isAdminUser = user?.accessLevel === 'admin' || user?.isSuperAdmin;
  const canTuneAssistant = twilioOn && !isAdminUser;
  const [showAssistantSettings, setShowAssistantSettings] = useState(false);

  useEffect(() => {
    function onMove(e: MouseEvent): void {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - e.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth + delta));
      setPanelWidth(next);
    }
    function onUp(): void {
      dragRef.current = null;
      document.body.style.cursor = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setPanelWidth]);

  // Auto-open the Atlas chat once a call is *initiated* — i.e. callStatus
  // moves off 'idle' (the dialer-only state). Fires exactly once per call
  // by remembering the callId we've already opened for, so a user who
  // closes Atlas mid-call doesn't get it re-opened on every status tick.
  const autoOpenedForCallRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      callState.isCallActive &&
      callState.callStatus !== 'idle' &&
      callState.callId &&
      autoOpenedForCallRef.current !== callState.callId
    ) {
      autoOpenedForCallRef.current = callState.callId;
      setPanelOpen(true);
    }
    // Reset the latch when the call ends so the next call can auto-open.
    if (!callState.isCallActive && autoOpenedForCallRef.current) {
      autoOpenedForCallRef.current = null;
    }
  }, [callState.isCallActive, callState.callStatus, callState.callId, setPanelOpen]);

  if (!user) return null;

  // Panel renders if EITHER the dialer/call section or the Atlas chat
  // is wanted. Both closed ⇒ no panel; one open ⇒ that surface fills the
  // panel; both open ⇒ 50/50 split (CallSection on top, Atlas chat below).
  const showCallHalf = callPanelVisible;
  const showAtlasHalf = isPanelOpen;
  if (!showCallHalf && !showAtlasHalf) return null;

  return (
    <>
    <aside
      className="fixed top-16 right-0 bottom-0 z-30 flex flex-col"
      style={{
        width: panelWidth,
        background: 'var(--color-atlas-surface-1)',
        color: 'var(--color-atlas-fg)',
        borderLeft: '1px solid var(--color-atlas-border)',
        boxShadow: 'var(--shadow-atlas-panel)',
      }}
      aria-label="Atlas AI copilot"
    >
      {/* Drag handle */}
      <div
        onMouseDown={(e) => {
          dragRef.current = { startX: e.clientX, startWidth: panelWidth };
          document.body.style.cursor = 'ew-resize';
        }}
        className="absolute top-0 bottom-0 -left-1 w-2 cursor-ew-resize hover:bg-orange-300/20"
        aria-label="Resize Atlas panel"
        role="separator"
      />

      {/* Atlas chrome header — only renders when the Atlas chat half is
       *  visible. When the panel is showing the dialer alone, the CallSection
       *  carries its own "Dialer / On call" eyebrow header and the Atlas
       *  brand + ModeToggle + Settings gear would be misleading. */}
      {showAtlasHalf && (
        <div
          className="flex items-center justify-between px-3 py-2.5 border-b"
          style={{ borderColor: 'var(--color-atlas-border)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <AtlasMark size={32} animate={isStreaming} />
            <div className="min-w-0 leading-tight">
              <p
                className="text-base font-medium uppercase"
                style={{
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--color-atlas-fg)',
                  letterSpacing: '0.05em',
                }}
              >
                Atlas
              </p>
              <p
                className="text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ color: 'var(--color-atlas-fg-muted)' }}
              >
                AI Assist
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {aiHealth.degraded && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                style={{
                  background: 'rgba(245,158,11,0.16)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245,158,11,0.35)',
                }}
                title={`${aiHealth.reason ?? 'AI features are temporarily unavailable.'} Rule-based monitoring is still active.`}
              >
                AI degraded
              </span>
            )}
            <ModeToggle />
            <SettingsMenu
              isMuted={state(callState)}
              onMute={() => setMute(!callState.isMuted)}
              onStartNew={() => {
                if (messages.length === 0) return;
                setConfirmNewChat(true);
              }}
              onClose={() => setPanelOpen(false)}
              startNewDisabled={messages.length === 0}
              onAssistantSettings={
                canTuneAssistant ? () => setShowAssistantSettings(true) : undefined
              }
            />
          </div>
        </div>
      )}

      {/* Body — independent halves. One visible ⇒ full height; both ⇒ 50/50. */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {showCallHalf && (
          <div
            className="flex-1 min-h-0 flex flex-col"
            style={showAtlasHalf ? { flexBasis: '50%' } : undefined}
          >
            <CallSection />
          </div>
        )}
        {showAtlasHalf && (
          <div
            className="flex-1 min-h-0 flex flex-col"
            style={showCallHalf ? { flexBasis: '50%' } : undefined}
          >
            {messages.length === 0 ? <GreetingCard /> : <ResumeBanner />}
            <ChatPane />
          </div>
        )}
      </div>
    </aside>
    <NewChatConfirm
      isOpen={confirmNewChat}
      onClose={() => setConfirmNewChat(false)}
      onConfirm={() => {
        setConfirmNewChat(false);
        void startNewSession();
      }}
    />
    {/* Mount fresh each open — the modal's initial state is its reset. */}
    {showAssistantSettings && (
      <ScreeningAssistantModal isOpen onClose={() => setShowAssistantSettings(false)} />
    )}
    </>
  );
}

// Helper — pull `isMuted` from CallContext.state without TypeScript narrow drama.
function state(s: { isMuted: boolean }): boolean {
  return s.isMuted;
}

interface SettingsMenuProps {
  isMuted: boolean;
  onMute: () => void;
  onStartNew: () => void;
  onClose: () => void;
  startNewDisabled: boolean;
  /** Opens the AI screening-assistant persona popup; omitted for admins
   *  (they never receive inbound calls to screen). */
  onAssistantSettings?: () => void;
}

function SettingsMenu({
  isMuted,
  onMute,
  onStartNew,
  onClose,
  startNewDisabled,
  onAssistantSettings,
}: SettingsMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-md transition-colors"
        style={{
          color: 'var(--color-atlas-fg-muted)',
          background: open ? 'var(--color-atlas-surface-3)' : 'transparent',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-atlas-surface-3)')}
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = open ? 'var(--color-atlas-surface-3)' : 'transparent')
        }
        aria-label="Settings"
        title="Settings"
      >
        <Settings className="w-4 h-4" />
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 w-44 rounded-lg shadow-lg overflow-hidden z-50"
          style={{
            background: 'var(--color-atlas-surface-2)',
            border: '1px solid var(--color-atlas-border-strong)',
            boxShadow: 'var(--shadow-atlas-menu)',
          }}
        >
          <MenuItem
            icon={isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            label={isMuted ? 'Unmute mic' : 'Mute mic'}
            onClick={() => {
              onMute();
              setOpen(false);
            }}
          />
          <MenuItem
            icon={<Compass className="w-4 h-4" />}
            label="Explore"
            onClick={() => setOpen(false)}
          />
          <MenuItem
            icon={<History className="w-4 h-4" />}
            label="History"
            onClick={() => setOpen(false)}
          />
          <MenuItem
            icon={<Plus className="w-4 h-4" />}
            label="New chat"
            onClick={() => {
              if (!startNewDisabled) onStartNew();
              setOpen(false);
            }}
            disabled={startNewDisabled}
          />
          {onAssistantSettings && (
            <MenuItem
              icon={<Bot className="w-4 h-4" />}
              label="AI assistant"
              onClick={() => {
                onAssistantSettings();
                setOpen(false);
              }}
            />
          )}
          {/* Mic + speaker pickers — renders only when a Twilio device is
           *  initialized (i.e. during/after an active call). Replaces the
           *  old in-panel footer dropdowns. */}
          <AudioDevicePickerRows />
          <div style={{ borderTop: '1px solid var(--color-atlas-border)' }} />
          <MenuItem
            icon={<X className="w-4 h-4" />}
            label="Close panel"
            onClick={() => {
              onClose();
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ color: 'var(--color-atlas-fg)' }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--color-atlas-surface-3)';
      }}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ color: 'var(--color-atlas-fg-muted)' }}>{icon}</span>
      {label}
    </button>
  );
}

