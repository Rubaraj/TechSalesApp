/**
 * Phase 4 (M4) — Atlas autonomy mode toggle (Silent · Assist · Auto Pilot).
 * Compact segmented control in the panel header.
 */
import { VolumeX, Compass, Bot } from 'lucide-react';
import { useAtlas } from '../../context/AtlasContext';

export function ModeToggle(): React.JSX.Element {
  const { mode, setMode } = useAtlas();

  return (
    <div className="flex items-center gap-0.5 rounded-md bg-gray-100 dark:bg-gray-800 p-0.5">
      <ModeButton
        active={mode === 'silent'}
        onClick={() => setMode('silent')}
        title="Silent — chat only, no proactive suggestions"
        label="Silent"
      >
        <VolumeX className="w-3.5 h-3.5" />
      </ModeButton>
      <ModeButton
        active={mode === 'assist'}
        onClick={() => setMode('assist')}
        title="Assist — Atlas proposes; you decide"
        label="Assist"
      >
        <Compass className="w-3.5 h-3.5" />
      </ModeButton>
      <ModeButton
        active={mode === 'auto'}
        onClick={() => setMode('auto')}
        title="Auto Pilot — Atlas drives; writes still need approval"
        label="Auto"
      >
        <Bot className="w-3.5 h-3.5" />
      </ModeButton>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={label}
      className={`px-1.5 py-1 rounded transition-colors ${
        active
          ? 'bg-white dark:bg-gray-700 text-primary-700 dark:text-primary-300 shadow-sm'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  );
}
