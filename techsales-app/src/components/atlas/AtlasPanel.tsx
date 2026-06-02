/**
 * Phase 4 (M4) — Atlas right-docked copilot panel. Vertical-slice scope:
 * idle mode only (chat + approval cards + nav suggestions). Resize hook and
 * call-active layout split land in a follow-up.
 *
 * The panel is always mounted (when an agent is signed in) so Atlas is
 * available on every screen.
 */
import { useEffect, useRef, useState } from 'react';
import { Bot, Sparkles, X, MessageSquarePlus } from 'lucide-react';
import { useAtlas } from '../../context/AtlasContext';
import { useAuth } from '../../context/AuthContext';
import { useCallContext } from '../../context/CallContext';
import { ChatPane } from './ChatPane';
import { GreetingCard } from './GreetingCard';
import { ApprovalCard } from './ApprovalCard';
import { NavigationCard } from './NavigationCard';
import { ModeToggle } from './ModeToggle';
import { ResumeBanner } from './ResumeBanner';
import { CallSection } from '../call/CallSection';

const PANEL_WIDTH_KEY = 'techsales:atlas-panel-width';
const MIN_WIDTH = 320;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 400;

export function AtlasPanel(): React.JSX.Element | null {
  const { user } = useAuth();
  const { messages, startNewSession } = useAtlas();
  const { state: callState } = useCallContext();
  const [isOpen, setIsOpen] = useState(true);
  // When a call is active AND the call panel is showing, Atlas drops to the
  // bottom half of the right edge instead of taking the full height. This
  // gives the dialer / transcript / compliance alerts the top half (per the
  // user's "50/50 share" instruction).
  const callPanelVisible = callState.isCallActive && callState.isCallPanelOpen;
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH;
    const stored = window.localStorage.getItem(PANEL_WIDTH_KEY);
    const n = stored ? Number.parseInt(stored, 10) : NaN;
    return Number.isFinite(n) ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n)) : DEFAULT_WIDTH;
  });
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_WIDTH_KEY, String(width));
    } catch {
      // ignore
    }
  }, [width]);

  useEffect(() => {
    function onMove(e: MouseEvent): void {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - e.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth + delta));
      setWidth(next);
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
  }, []);

  if (!user) return null;

  if (!isOpen) {
    // Collapsed bubble in the BOTTOM-right corner (Intercom-style). Was
    // top-right; moved per UX feedback to avoid overlap with the header
    // dialer button and follow the chat-bubble pattern agents already
    // recognize from other tools.
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 p-3.5 rounded-full bg-primary-600 hover:bg-primary-700 text-white shadow-xl transition-colors"
        aria-label="Open Atlas copilot"
        title="Open Atlas"
      >
        <Bot className="w-5 h-5" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-400 ring-2 ring-white" />
        )}
      </button>
    );
  }

  // Single unified panel. When a call is active, the panel splits 50/50:
  // top = CallSection (dialer / transcript / mute / end), bottom = Atlas
  // chat. When no call, Atlas chat fills the full height. The previous
  // separate `<CallPanel/>` aside is gone — there's exactly one right-edge
  // panel and it owns both surfaces.
  return (
    <aside
      className="fixed top-16 right-0 bottom-0 z-30 flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl"
      style={{ width }}
      aria-label="Atlas AI copilot"
    >
      {/* Drag handle on the left edge */}
      <div
        onMouseDown={(e) => {
          dragRef.current = { startX: e.clientX, startWidth: width };
          document.body.style.cursor = 'ew-resize';
        }}
        className="absolute top-0 bottom-0 -left-1 w-2 cursor-ew-resize hover:bg-primary-200/50 dark:hover:bg-primary-700/30"
        aria-label="Resize Atlas panel"
        role="separator"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Atlas</p>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              AI copilot
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ModeToggle />
          <button
            onClick={() => {
              if (messages.length === 0) return;
              if (
                window.confirm(
                  'Start a new session? Your current conversation will be cleared.',
                )
              ) {
                void startNewSession();
              }
            }}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="New session"
            title={messages.length === 0 ? 'Already a fresh session' : 'Start a new session'}
            disabled={messages.length === 0}
          >
            <MessageSquarePlus className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Collapse panel"
            title="Collapse"
          >
            <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      {/* Body — single panel, split 50/50 when call active. */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {callPanelVisible && (
          <div className="flex-1 min-h-0 flex flex-col" style={{ flexBasis: '50%' }}>
            <CallSection />
          </div>
        )}
        <div
          className="flex-1 min-h-0 flex flex-col"
          style={callPanelVisible ? { flexBasis: '50%' } : undefined}
        >
          {messages.length === 0 ? <GreetingCard /> : <ResumeBanner />}
          <ChatPane />
          <ApprovalDeck />
          <NavigationDeck />
        </div>
      </div>
    </aside>
  );
}

// Renders the stacked approval cards Atlas has emitted this session.
function ApprovalDeck(): React.JSX.Element | null {
  const { proposals } = useAtlas();
  const visible = proposals.filter((p) => p.status !== 'rejected');
  if (visible.length === 0) return null;
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 space-y-2 max-h-64 overflow-y-auto">
      {visible.map((p) => (
        <ApprovalCard key={p.proposalId} proposal={p} />
      ))}
    </div>
  );
}

function NavigationDeck(): React.JSX.Element | null {
  const { navigationSuggestions, mode } = useAtlas();
  // In Auto Pilot the suggestions are consumed elsewhere (auto-navigate);
  // in Silent they're suppressed; in Assist they show here as cards.
  if (mode !== 'assist' || navigationSuggestions.length === 0) return null;
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 space-y-1.5 max-h-40 overflow-y-auto">
      {navigationSuggestions.map((s) => (
        <NavigationCard key={s.id} suggestion={s} />
      ))}
    </div>
  );
}
