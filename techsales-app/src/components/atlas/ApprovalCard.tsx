/**
 * Phase 4 design — Atlas write-action approval card.
 *
 * Matches the Claude Design reference (Reference Screenshot/Prefered method.png):
 *  - Neutral 1px border (no orange accent on the frame itself).
 *  - Header: orange kind-icon + "Atlas drafted an email" eyebrow +
 *    "NEEDS APPROVAL" orange pill on the right.
 *  - Body: compact key/value rows ("To dorothy@…", "Subject …") in
 *    regular sans with bold inline values. NO body preview block — keeps
 *    the card scannable; full body editing belongs in a dedicated drawer.
 *  - Actions: full-width Edit (subtle) + Approve & send (orange filled).
 *
 * Status variants:
 *  - approved  → green checkmark + one-line success ("Email sent to …")
 *  - rejected  → muted strikethrough line ("Declined · email")
 *  - error     → red soft tile ("Couldn't apply — try again")
 *  - pending   → full card (above)
 */
import { Check, X, Mail, Pencil, AlertTriangle, Pill, ListTodo, PenLine, StickyNote } from 'lucide-react';
import { useAtlas, type AtlasProposal } from '../../context/AtlasContext';

interface Props {
  proposal: AtlasProposal;
}

export function ApprovalCard({ proposal }: Props): React.JSX.Element {
  const { approve, reject } = useAtlas();

  if (proposal.status === 'approved') {
    return (
      <div
        className="msg-in flex items-center gap-2 px-2 py-1.5 text-[13px]"
        style={{ color: 'var(--color-atlas-success, #6ad48f)' }}
      >
        <Check className="w-4 h-4" />
        <span>{successMessageFor(proposal)}</span>
      </div>
    );
  }
  if (proposal.status === 'rejected') {
    return (
      <div
        className="msg-in flex items-center gap-2 px-2 py-1.5 text-[12.5px] line-through"
        style={{ color: 'var(--color-atlas-fg-subtle)' }}
      >
        Declined · {labelFor(proposal.kind)}
      </div>
    );
  }
  if (proposal.status === 'error') {
    return (
      <div
        className="msg-in px-3 py-2 rounded-md text-[12.5px]"
        style={{
          background: 'rgba(255,107,107,0.10)',
          border: '1px solid rgba(255,107,107,0.35)',
          color: '#ff6b6b',
        }}
      >
        Couldn't apply — try again
      </div>
    );
  }

  const Icon = iconFor(proposal.kind);

  return (
    <div
      className="msg-in flex-shrink-0 overflow-hidden"
      style={{
        background: 'var(--color-atlas-surface-2)',
        border: '1px solid var(--color-atlas-border)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-atlas-card)',
      }}
    >
      {/* Header — kind icon + drafted label + NEEDS APPROVAL pill */}
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <Icon className="w-4 h-4" style={{ color: 'var(--color-exl-orange-bright)' }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-atlas-fg)' }}>
          Atlas drafted {articleFor(proposal.kind)} {labelFor(proposal.kind)}
        </span>
        <span
          className="ml-auto"
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-exl-orange-bright)',
            background: 'var(--color-exl-orange-soft)',
            padding: '4px 9px',
            borderRadius: 999,
          }}
        >
          Needs approval
        </span>
      </div>

      {/* Body — compact KV rows; no preview block */}
      <div
        className="px-3.5 py-2.5 flex flex-col gap-1.5"
        style={{ borderTop: '1px solid var(--color-atlas-border)' }}
      >
        {renderKvRows(proposal)}
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-3.5 pb-3.5 pt-1">
        <button
          onClick={() => void reject(proposal.proposalId)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors"
          style={{
            fontSize: 13,
            fontWeight: 600,
            background: 'var(--color-atlas-surface-3)',
            color: 'var(--color-atlas-fg-muted)',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-atlas-surface-4)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-atlas-surface-3)')}
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          onClick={() => void approve(proposal.proposalId)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors"
          style={{
            fontSize: 13,
            fontWeight: 600,
            background: 'var(--color-exl-orange)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-exl-orange-bright)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-exl-orange)')}
        >
          <Check className="w-3.5 h-3.5" />
          {primaryActionFor(proposal.kind)}
        </button>
      </div>
    </div>
  );
}

function iconFor(kind: AtlasProposal['kind']): typeof Mail {
  if (kind === 'email') return Mail;
  if (kind === 'status') return ListTodo;
  if (kind === 'drug') return Pill;
  if (kind === 'lead_update') return PenLine;
  if (kind === 'note') return StickyNote;
  return AlertTriangle;
}

function labelFor(kind: AtlasProposal['kind']): string {
  if (kind === 'email') return 'email';
  if (kind === 'status') return 'lead status update';
  if (kind === 'drug') return 'drug tag';
  if (kind === 'lead_update') return 'contact info update';
  if (kind === 'note') return 'lead note';
  return 'action';
}

function articleFor(kind: AtlasProposal['kind']): string {
  return kind === 'email' || kind === 'status' ? 'an' : 'a';
}

function primaryActionFor(kind: AtlasProposal['kind']): string {
  if (kind === 'email') return 'Approve & send';
  if (kind === 'status') return 'Approve & update';
  if (kind === 'drug') return 'Approve & add';
  if (kind === 'lead_update') return 'Approve & update';
  if (kind === 'note') return 'Approve & add note';
  return 'Approve';
}

function successMessageFor(proposal: AtlasProposal): string {
  if (proposal.kind === 'email') {
    const to = (proposal.preview as { to?: string } | null)?.to;
    return to ? `Email approved & sent to ${to}.` : 'Email approved & sent.';
  }
  if (proposal.kind === 'status') return 'Lead status updated.';
  if (proposal.kind === 'drug') return 'Drug added to lead.';
  if (proposal.kind === 'lead_update') return 'Contact info updated.';
  if (proposal.kind === 'note') return 'Note added to lead.';
  return 'Approved.';
}

const FIELD_LABELS: Record<string, string> = {
  phone: 'Phone',
  email: 'Email',
  address1: 'Address',
  address2: 'Address 2',
  city: 'City',
  state: 'State',
  zipCode: 'Zip',
};

function renderKvRows(proposal: AtlasProposal): React.JSX.Element {
  const p = (proposal.preview ?? {}) as Record<string, unknown>;

  if (proposal.kind === 'email') {
    const { to, subject } = p as { to?: string; subject?: string };
    return (
      <>
        {to && <KvRow label="To" value={to} />}
        {subject && <KvRow label="Subject" value={subject} />}
      </>
    );
  }

  if (proposal.kind === 'status') {
    const { leadName, from, to } = p as { leadName?: string; from?: string; to?: string };
    return (
      <>
        {leadName && <KvRow label="Lead" value={leadName} />}
        {(from || to) && <KvRow label="Status" value={`${from ?? '—'} → ${to ?? '—'}`} />}
      </>
    );
  }

  if (proposal.kind === 'drug') {
    const { leadName, drugName, dosage } = p as {
      leadName?: string;
      drugName?: string;
      dosage?: string;
    };
    return (
      <>
        {leadName && <KvRow label="Lead" value={leadName} />}
        {drugName && <KvRow label="Drug" value={dosage ? `${drugName} · ${dosage}` : drugName} />}
      </>
    );
  }

  if (proposal.kind === 'lead_update') {
    const { leadName, changes } = p as {
      leadName?: string;
      changes?: Record<string, { from?: unknown; to?: unknown }>;
    };
    return (
      <>
        {leadName && <KvRow label="Lead" value={leadName} />}
        {changes &&
          Object.entries(changes).map(([field, c]) => (
            <KvRow
              key={field}
              label={FIELD_LABELS[field] ?? field}
              value={`${String(c.from ?? '—')} → ${String(c.to ?? '—')}`}
            />
          ))}
      </>
    );
  }

  if (proposal.kind === 'note') {
    const { leadName, note } = p as { leadName?: string; note?: string };
    return (
      <>
        {leadName && <KvRow label="Lead" value={leadName} />}
        {note && <KvRow label="Note" value={note} />}
      </>
    );
  }

  return <span style={{ fontSize: 12.5, color: 'var(--color-atlas-fg-muted)' }}>—</span>;
}

function KvRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div
      style={{
        fontSize: 13,
        lineHeight: 1.45,
        color: 'var(--color-atlas-fg-muted)',
      }}
    >
      {label}{' '}
      <b style={{ color: 'var(--color-atlas-fg)', fontWeight: 600 }}>{value}</b>
    </div>
  );
}
