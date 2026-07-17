// AtlasChat.jsx — the Atlas copilot chat surface (header, mode toggle, messages, composer).
// Variation props: bubbleStyle ('filled'|'soft'|'outline'), approvalStyle ('inline'|'bordered'|'compact'),
//                  modeStyle ('segmented'|'pills'|'icons'), serifGreeting (bool).

const MODES = [
  { id: 'silent', label: 'Silent', icon: 'volume-x', hint: 'Atlas watches but never acts or speaks up.' },
  { id: 'assist', label: 'Assist', icon: 'hand', hint: 'Atlas suggests; you approve every action.' },
  { id: 'auto',   label: 'Auto Pilot', icon: 'rocket', hint: 'Atlas drafts and sends routine actions on its own.' },
];

const SUGGESTIONS = [
  'Find leads in Florida that need follow-up',
  'Draft a follow-up email to Dorothy Roberts',
  'Who are my dual-eligible leads?',
];

// Speaker attribution labels
const WHO = {
  ai: { fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--exl-orange)', marginBottom: 6 },
  agent: { fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--fg-subtle)', marginBottom: 6, marginRight: 2 },
};

/* ─── Mode toggle (3 variations) ─────────────────────────────── */
function ModeToggle({ mode, setMode, variant }) {
  const cur = MODES.find((m) => m.id === mode);
  if (variant === 'pills') {
    return (
      <div style={{ display: 'flex', gap: 7 }}>
        {MODES.map((m) => {
          const on = m.id === mode;
          return (
            <button key={m.id} className="hbtn" onClick={() => setMode(m.id)}
              style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 999, whiteSpace: 'nowrap',
                border: '1px solid ' + (on ? 'transparent' : 'var(--border-strong)'),
                background: on ? 'var(--exl-orange)' : 'transparent',
                color: on ? '#fff' : 'var(--fg-muted)' }}>
              <Icon name={m.icon} size={13} /> {m.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (variant === 'icons') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface-3)',
        border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
        {MODES.map((m) => {
          const on = m.id === mode;
          return (
            <button key={m.id} className="hbtn" title={m.label} onClick={() => setMode(m.id)}
              style={{ all: 'unset', cursor: 'pointer', width: 32, height: 28, display: 'grid', placeItems: 'center',
                borderRadius: 7, background: on ? 'var(--exl-orange)' : 'transparent',
                color: on ? '#fff' : 'var(--fg-muted)' }}>
              <Icon name={m.icon} size={15} />
            </button>
          );
        })}
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', padding: '0 8px 0 4px' }}>{cur.label}</span>
      </div>
    );
  }
  // segmented (default)
  return (
    <div style={{ display: 'inline-flex', background: 'var(--surface-3)', border: '1px solid var(--border)',
      borderRadius: 11, padding: 3, gap: 2 }}>
      {MODES.map((m) => {
        const on = m.id === mode;
        return (
          <button key={m.id} className="hbtn" onClick={() => setMode(m.id)}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 8, whiteSpace: 'nowrap',
              background: on ? 'var(--exl-orange)' : 'transparent', color: on ? '#fff' : 'var(--fg-muted)',
              boxShadow: on ? 'var(--shadow-sm)' : 'none' }}>
            <Icon name={m.icon} size={13} /> {m.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Greeting card (editorial serif headline) ───────────────── */
function Greeting({ serif }) {
  return (
    <div className="msg-in" style={{ display: 'flex', gap: 13, alignItems: 'flex-start', padding: '4px 2px 6px' }}>
      <AtlasMark size={42} animate={false} />
      <div>
        <div style={{ fontSize: 22, fontWeight: serif ? 500 : 700, lineHeight: 1.2, color: 'var(--fg)',
          fontFamily: serif ? 'var(--font-serif)' : 'var(--font-sans)', letterSpacing: serif ? '0' : '-0.01em' }}>
          Good afternoon, Mike.
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', marginTop: 5, lineHeight: 1.5 }}>
          6 leads need follow-up today. Ask me to line them up — or pick a starting point below.
        </div>
      </div>
    </div>
  );
}

/* ─── Continuing-conversation banner ─────────────────────────── */
function ContinuingBanner({ onDismiss, onStartNew }) {
  return (
    <div className="msg-in" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--exl-orange-soft)',
      border: '1px solid var(--exl-orange-line)', borderRadius: 11, padding: '9px 12px' }}>
      <Icon name="history" size={15} color="var(--exl-orange)" />
      <span style={{ fontSize: 12.5, color: 'var(--fg)' }}>Continuing your previous conversation · 1 turn</span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 11, fontSize: 12, fontWeight: 600 }}>
        <span className="hlink" style={{ color: 'var(--exl-orange)' }}>Resume</span>
        <span className="hlink" style={{ color: 'var(--exl-orange)' }} onClick={onStartNew}>+ Start new</span>
      </span>
      <button className="hlink" onClick={onDismiss} style={{ all: 'unset', cursor: 'pointer', marginLeft: 4, color: 'var(--fg-subtle)', display: 'inline-flex' }}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

/* ─── Messages ───────────────────────────────────────────────── */
function UserBubble({ text, variant }) {
  const base = { maxWidth: '82%', fontSize: 14, fontWeight: 600, lineHeight: 1.45,
    padding: '10px 15px', borderRadius: '14px 14px 4px 14px' };
  const styles = {
    filled:  { ...base, background: 'var(--exl-orange)', color: '#fff', boxShadow: 'var(--shadow-sm)' },
    soft:    { ...base, background: 'var(--exl-orange-soft)', color: 'var(--fg)', border: '1px solid var(--exl-orange-line)', fontWeight: 500 },
    outline: { ...base, background: 'transparent', color: 'var(--fg)', border: '1.5px solid var(--exl-orange-line)', fontWeight: 500 },
  };
  return (
    <div className="msg-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span style={WHO.agent}>Agent</span>
      <div style={styles[variant] || styles.filled}>{text}</div>
    </div>
  );
}

function AiMessage({ lines }) {
  return (
    <div className="msg-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <span style={WHO.ai}>AI Assist</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, lineHeight: 1.5 }}>
        {lines.map((l, i) => (
          <span key={i} style={{ color: l.muted ? 'var(--fg-muted)' : 'var(--fg)' }}>{l.text || l}</span>
        ))}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="msg-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <span style={WHO.ai}>AI Assist</span>
      <div style={{ display: 'inline-flex', gap: 6, background: 'var(--surface-3)', padding: '11px 15px', borderRadius: '14px 14px 14px 4px' }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--fg-muted)',
            animation: 'atlas-blink 1.4s var(--ease-soft) infinite both', animationDelay: i * 0.2 + 's' }} />
        ))}
      </div>
    </div>
  );
}

function ToolTrace({ name, args, result }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="msg-in" style={{ marginLeft: 0, flexShrink: 0, border: '1px solid var(--border)', borderRadius: 11, background: 'var(--surface-1)', overflow: 'hidden' }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer' }}>
        <Icon name="wrench" size={14} color="var(--fg-muted)" />
        <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg)' }}>{name}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--success)' }}>
          <Icon name="check" size={13} /> 0.4s
        </span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color="var(--fg-subtle)" />
      </div>
      {open && (
        <div className="mono" style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', background: 'var(--bg)', fontSize: 11.5, lineHeight: 1.7, color: 'var(--fg-muted)' }}>
          <div>{args}</div>
          <div style={{ color: 'var(--fg-subtle)' }}>{result}</div>
        </div>
      )}
    </div>
  );
}

/* ─── Approval card (3 variations) ───────────────────────────── */
function ApprovalCard({ variant, onResolve }) {
  const [state, setState] = React.useState('pending'); // pending | approved | edited
  const compact = variant === 'compact';
  const accentBorder = variant === 'bordered';
  if (state !== 'pending') {
    return (
      <div className="msg-in" style={{ marginLeft: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
        color: state === 'approved' ? 'var(--success)' : 'var(--fg-muted)' }}>
        <Icon name={state === 'approved' ? 'check-circle-2' : 'pencil'} size={15} />
        {state === 'approved' ? 'Email approved & sent to Dorothy.' : 'Opened draft for editing.'}
      </div>
    );
  }
  return (
    <div className="msg-in" style={{ marginLeft: 0, flexShrink: 0, maxWidth: '92%', background: 'var(--surface-2)',
      border: accentBorder ? '1px solid var(--exl-orange-line)' : '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', borderBottom: '1px solid var(--border)' }}>
        <Icon name="mail" size={15} color="var(--exl-orange)" />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg)' }}>Atlas drafted an email</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
          color: 'var(--exl-orange)', background: 'var(--exl-orange-soft)', padding: '3px 8px', borderRadius: 999 }}>Needs approval</span>
      </div>
      <div style={{ padding: compact ? '10px 13px' : '12px 13px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>To <b style={{ color: 'var(--fg)', fontWeight: 600 }}>dorothy.roberts356@hotmail.com</b></div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Subject <b style={{ color: 'var(--fg)', fontWeight: 600 }}>Your Medicare enrollment — next steps</b></div>
        {!compact && (
          <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.55, background: 'var(--surface-3)', borderRadius: 9, padding: '10px 12px' }}>
            Hi Dorothy, following up on our call. I've attached the dual-eligible plan options we discussed and a few times to enroll this week…
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 9, padding: '0 13px 13px' }}>
        <button className="hbtn" onClick={() => { setState('edited'); onResolve && onResolve(); }}
          style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600,
            padding: '9px', borderRadius: 9, background: 'var(--surface-3)', color: 'var(--fg-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Icon name="pencil" size={14} /> Edit
        </button>
        <button className="hprimary" onClick={() => { setState('approved'); onResolve && onResolve(); }}
          style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600,
            padding: '9px', borderRadius: 9, background: 'var(--exl-orange)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Icon name="check" size={14} /> Approve &amp; send
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { MODES, SUGGESTIONS, ModeToggle, Greeting, ContinuingBanner, UserBubble, AiMessage, ThinkingDots, ToolTrace, ApprovalCard });
