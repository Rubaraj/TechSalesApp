import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { CallRuntime } from '../call/CallRuntime';
import { AtlasPanel } from '../atlas/AtlasPanel';
import { useAtlas } from '../../context/AtlasContext';
import { useCallContext } from '../../context/CallContext';
import { useOutboundLeadIdentification } from '../../hooks/useOutboundLeadIdentification';

export function Layout() {
  // Phase 4 outbound-dial — watches pendingDial and surfaces an
  // IdentifiedLeadCard / CreateLeadCard in Atlas chat on each new dial.
  useOutboundLeadIdentification();


  // Phase 4 (dock) — Layout pads main content by the Atlas panel width
  // whenever the right-edge panel is visible. The panel is visible if
  // EITHER the Atlas chat is open OR a call's section is on screen
  // (dialer-only mode, transcript, etc.). Both surfaces share the same
  // docked panel and the same width token.
  const { isPanelOpen, panelWidth } = useAtlas();
  const { state: callState } = useCallContext();
  const callHalfVisible = callState.isCallActive && callState.isCallPanelOpen;
  const rightPad = isPanelOpen || callHalfVisible ? panelWidth : 0;

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
          style={{ paddingRight: rightPad }}
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

        <AtlasPanel />
      </div>
    </CallRuntime>
  );
}
