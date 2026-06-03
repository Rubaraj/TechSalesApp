/**
 * Phase 4 — App-styled confirmation modal that replaces the native
 * `window.confirm` for "Start a new session". Single source of truth for
 * the title / message / button copy, used by both the Atlas settings
 * dropdown ("New chat") and the ResumeBanner's "+ Start new" button.
 */
import { ConfirmModal } from '../common/Modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function NewChatConfirm({ isOpen, onClose, onConfirm }: Props): React.JSX.Element {
  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Start a new chat?"
      message="Your current conversation with Atlas will be cleared. This can't be undone."
      confirmText="Start new chat"
      cancelText="Keep current"
      variant="danger"
    />
  );
}
