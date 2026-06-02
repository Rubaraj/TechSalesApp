import { Link, useLocation } from 'react-router-dom';
import { Sun, Moon, LogOut, User, Bell, LayoutDashboard, ShoppingBag, Settings, Database, FileJson, Cpu, Sparkles, Cloud, Phone, PhoneOff } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useCallContext } from '../../context/CallContext';
import { useTwilioEnabled } from '../../hooks/useTwilioEnabled';
import { ActiveCallBadge } from '../call/ActiveCallBadge';
import { getLogoByTheme } from '../../utils/logoUtils';

// Routes that should highlight the Sales tab
const SALES_ROUTES = [
  '/sales',
  '/leads',
  '/plans',
  '/pharmacies',
  '/drugs',
  '/providers',
  '/pba',
  '/pbkit',
  '/state-assistance',
  '/plan-subsidy',
  '/recommendations',
  '/yoy',
  '/admin',
];

export function Header() {
  const location = useLocation();
  const { resolvedTheme, toggleTheme, colorTheme } = useTheme();
  const { user, logout, dataSource, aiEnabled, aiProvider } = useAuth();
  const { state: callState, startCall, setPanelOpen, endCall } = useCallContext();
  const twilioOn = useTwilioEnabled();
  const isAdminUser = user?.accessLevel === 'admin' || user?.isSuperAdmin;
  // Show call UI only when the full Twilio + Deepgram pipeline is configured
  // and the user is a sales agent. Web Speech fallback was removed —
  // there's no half-functional mode left.
  const showCallButton = twilioOn && !isAdminUser;

  // Show End Call only when a real Twilio call leg is in flight — not the
  // moment the panel opens in 'idle' (dialer-only) state. The agent shouldn't
  // see "End Call" before they've placed a call.
  const callInProgress =
    callState.callStatus === 'connecting' ||
    callState.callStatus === 'ringing' ||
    callState.callStatus === 'connected' ||
    callState.callStatus === 'ending';

  // QA H1 — End Call must actually hang up Twilio (mic off, prospect dropped,
  // billing stops), not just clear UI state. CallPanel's useTwilioCall listens
  // for this event and awaits handle.destroy() then ends the CallContext.
  // In Web Speech (browser-mic) mode there's no Twilio handle, so we fall
  // back to a direct endCall().
  // End Call dispatches the same DOM event the logout-flow uses; the single
  // useTwilioCall hook in <CallRuntime/> listens and awaits handle.destroy()
  // before ending the CallContext (so mic + WebRTC clean up first).
  const onClickEnd = (): void => {
    window.dispatchEvent(new CustomEvent('techsales:logout-end-call'));
  };

  // Dialer icon click — TOGGLE behavior:
  //   - No session active: open a fresh dialer session.
  //   - Session active + dialer in idle state: end the session (closes the panel).
  //   - Session active + actively on a call: re-expand the collapsed panel
  //     instead of ending the call (safer; agent must explicitly hang up).
  const onClickDialer = (): void => {
    if (!callState.isCallActive) {
      startCall();
      return;
    }
    // Session is active.
    if (callState.callStatus === 'idle') {
      // Just the empty dialer is showing — second click closes it.
      endCall();
      return;
    }
    // On a real call leg — restore the panel if collapsed; do NOT auto-hang-up.
    if (!callState.isCallPanelOpen) {
      setPanelOpen(true);
    }
  };


  // Check if current path matches any sales routes
  const isSalesRoute = SALES_ROUTES.some(route => 
    location.pathname === route || location.pathname.startsWith(route + '/')
  );

  const isInsightsActive = location.pathname === '/insights' || location.pathname === '/';
  const isSalesActive = isSalesRoute;
  const isAdminActive = location.pathname.startsWith('/admin');
  const isAdmin = user?.accessLevel === 'admin' || user?.isSuperAdmin;

  // Admin users see Insights and Admin tabs only
  // Non-admin users see Insights and Sales tabs
  const navItems = isAdmin
    ? [
        { path: '/insights', label: 'Insights', icon: LayoutDashboard, active: isInsightsActive && !isAdminActive },
        { path: '/admin', label: 'Admin', icon: Settings, active: isAdminActive },
      ]
    : [
        { path: '/insights', label: 'Insights', icon: LayoutDashboard, active: isInsightsActive && !isSalesActive },
        { path: '/sales', label: 'Sales', icon: ShoppingBag, active: isSalesActive },
      ];

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        {/* Left side - Logo */}
        <div className="flex items-center gap-6">
          <Link to="/insights" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img 
              src={getLogoByTheme(colorTheme)} 
              alt={colorTheme === 'carrier1' ? 'Carrier 1' : colorTheme === 'carrier2' ? 'Carrier 2' : 'EXL'}
              className="h-8 w-auto"
            />
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                Medicare Hub
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-0.5">
                Built for agents. Trusted by seniors
              </p>
            </div>
          </Link>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
                    ${item.active
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <button
            className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {/* Active-call badge — visible during a call, jumps back to panel. */}
          <ActiveCallBadge />

          {/* Dialer icon — always visible to sales agents when AI is enabled.
              End Call button is rendered SEPARATELY below, only when a real
              call leg is in flight. */}
          {showCallButton && (
            <button
              type="button"
              onClick={onClickDialer}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Dialer"
              title={
                callInProgress
                  ? 'Show the call panel'
                  : callState.isCallActive
                    ? 'Show the dialer panel'
                    : 'Open dialer'
              }
            >
              <Phone className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </button>
          )}

          {/* End Call — only visible during an actual in-flight call. */}
          {showCallButton && callInProgress && (
            <button
              type="button"
              onClick={onClickEnd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              aria-label="End call"
              title="End the current call"
            >
              <PhoneOff className="w-4 h-4" />
              <span className="hidden sm:inline">End Call</span>
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={`Switch to ${resolvedTheme === 'light' ? 'dark' : 'light'} mode`}
          >
            {resolvedTheme === 'light' ? (
              <Moon className="w-5 h-5 text-gray-600" />
            ) : (
              <Sun className="w-5 h-5 text-yellow-400" />
            )}
          </button>

          {/* User menu */}
          <div className="flex items-center gap-3 pl-3 border-l border-gray-200 dark:border-gray-700">
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {user?.accessLevel === 'admin' ? 'Administrator' : 'Sales Agent'}
              </p>
            </div>
            
            <div className="w-9 h-9 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>

            {/* Data source badge — what's actually backing the data behind this session.
                MongoDB = green, JSON = amber, Databricks = indigo. */}
            {dataSource && (() => {
              const cfg = {
                mongo:      { cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',     Icon: Database, label: 'MongoDB',    title: 'Data is being served from MongoDB' },
                json:       { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',     Icon: FileJson, label: 'JSON',       title: 'Data is being served from JSON file store (backend or bundled fallback)' },
                databricks: { cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300', Icon: Cloud,    label: 'Databricks', title: 'Data is being served from Databricks Delta tables' },
              }[dataSource];
              const { cls, Icon, label, title } = cfg;
              return (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cls}`}
                  title={title}
                  aria-label={`Data source: ${label}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </span>
              );
            })()}

            {/* AI provider badge — Ollama (green, local & free) vs Claude
                (purple, cloud). Hidden when AI is disabled or the provider
                hasn't been probed (e.g. local-mode session). */}
            {aiEnabled && aiProvider && (
              <span
                className={
                  aiProvider === 'ollama'
                    ? 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                }
                title={
                  aiProvider === 'ollama'
                    ? 'AI responses are generated by Ollama (qwen2.5) running locally — free, no API key.'
                    : 'AI responses are generated by Anthropic Claude (cloud).'
                }
                aria-label={`AI provider: ${aiProvider === 'ollama' ? 'Ollama' : 'Claude'}`}
              >
                {aiProvider === 'ollama' ? (
                  <Cpu className="w-3.5 h-3.5" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {aiProvider === 'ollama' ? 'AI: Ollama' : 'AI: Claude'}
              </span>
            )}

            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
