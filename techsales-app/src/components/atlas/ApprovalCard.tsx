/**
 * Phase 4 (M4) — Approval card for Atlas-proposed write actions. Renders the
 * preview + Approve/Reject buttons. Click Approve → calls atlasService →
 * card updates with success indicator. THE biggest agentic-AI signal.
 */
import { Check, X, Mail } from 'lucide-react';
import { useAtlas, type AtlasProposal } from '../../context/AtlasContext';

interface Props {
  proposal: AtlasProposal;
}

export function ApprovalCard({ proposal }: Props): React.JSX.Element {
  const { approve, reject } = useAtlas();

  if (proposal.status === 'approved') {
    return (
      <div className="px-3 py-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-xs text-green-800 dark:text-green-200 flex items-center gap-2">
        <Check className="w-4 h-4" />
        <span>Approved · {labelFor(proposal.kind)}</span>
      </div>
    );
  }
  if (proposal.status === 'rejected') {
    return (
      <div className="px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs text-gray-500 line-through">
        Declined · {labelFor(proposal.kind)}
      </div>
    );
  }
  if (proposal.status === 'error') {
    return (
      <div className="px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200">
        Couldn't apply — try again
      </div>
    );
  }

  return (
    <div className="px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs space-y-2">
      <div className="flex items-start gap-2">
        <Mail className="w-4 h-4 shrink-0 mt-0.5 text-blue-700 dark:text-blue-300" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-blue-900 dark:text-blue-100">
            Atlas drafted a {labelFor(proposal.kind)}
          </p>
          {renderPreview(proposal)}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={() => void reject(proposal.proposalId)}
          className="px-2.5 py-1 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 inline-flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          Reject
        </button>
        <button
          onClick={() => void approve(proposal.proposalId)}
          className="px-3 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center gap-1"
        >
          <Check className="w-3 h-3" />
          Approve & Send
        </button>
      </div>
    </div>
  );
}

function labelFor(kind: AtlasProposal['kind']): string {
  if (kind === 'email') return 'follow-up email';
  if (kind === 'status') return 'lead status update';
  if (kind === 'drug') return 'drug tag';
  return 'action';
}

function renderPreview(proposal: AtlasProposal): React.JSX.Element | null {
  const p = proposal.preview as { to?: string; subject?: string; body?: string } | null;
  if (!p) return null;
  if (proposal.kind === 'email') {
    return (
      <div className="mt-1 space-y-0.5 text-[11px] text-blue-800 dark:text-blue-200">
        {p.to && (
          <p>
            <span className="font-medium">To:</span> {p.to}
          </p>
        )}
        {p.subject && (
          <p>
            <span className="font-medium">Subject:</span> {p.subject}
          </p>
        )}
        {p.body && (
          <pre className="mt-1 text-[11px] whitespace-pre-wrap font-sans bg-white/40 dark:bg-black/20 p-2 rounded max-h-32 overflow-y-auto">
            {p.body}
          </pre>
        )}
      </div>
    );
  }
  return null;
}
