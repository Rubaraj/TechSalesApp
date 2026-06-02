import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { CallRuntime } from '../call/CallRuntime';
import { AtlasPanel } from '../atlas/AtlasPanel';
import { useCallContext } from '../../context/CallContext';

export function Layout() {
  const { state } = useCallContext();
  // Reflow main content to make room for the right-docked call panel.
  // 380px when expanded, 48px when collapsed, 0 when no call active.
  const callPaddingRight = !state.isCallActive
    ? 0
    : state.isCallPanelOpen
      ? 380
      : 48;

  // CallRuntime hosts the single useTwilioCall instance and publishes its
  // handles via CallRuntimeContext. Must wrap the entire authenticated tree
  // so that PhoneButton (rendered inside page routes) + CallPanel + Header
  // can all consume `useCallRuntime()`. Always mounted; the hook itself only
  // touches the SDK on the first `dial()` call.
  return (
    <CallRuntime>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />

        <div
          className="transition-all duration-200"
          style={{ paddingRight: callPaddingRight }}
        >
          <main className="p-4 lg:p-6">
            <Outlet />
          </main>

          {/* Footer */}
          <footer className="border-t border-gray-200 dark:border-gray-700 py-4 px-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-500 dark:text-gray-400">
              <p>© 2026 EXL Service | Medicare Hub</p>
              <p>Version 0.9.1</p>
            </div>
          </footer>
        </div>

        {/* Phase 4 (UI merge) — single right-edge panel. AtlasPanel hosts
         *  both the dialer/transcript (top half when a call is active) and
         *  the Atlas chat (bottom half / full height). The old separate
         *  CallPanel aside is gone; CallSection.tsx is embedded inside
         *  AtlasPanel instead. */}
        <AtlasPanel />
      </div>
    </CallRuntime>
  );
}
