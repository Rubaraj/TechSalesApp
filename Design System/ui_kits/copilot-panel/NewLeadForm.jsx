// NewLeadForm.jsx — modal lead form; demonstrates the AI auto-fill ring + "AI" chip.

function Field({ label, value, placeholder, filled, delay }) {
  const [shown, setShown] = React.useState(!filled);
  React.useEffect(() => {
    if (filled) {
      const t = setTimeout(() => setShown(true), delay);
      return () => clearTimeout(t);
    }
  }, [filled, delay]);
  const isAI = filled && shown;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)' }}>{label}</span>
      <div
        className={isAI ? 'ai-filled' : ''}
        style={{
          position: 'relative', background: 'var(--surface-3)',
          border: '1px solid ' + (isAI ? '#eab308' : 'var(--border)'),
          borderRadius: 10, padding: '11px 13px', fontSize: 14,
          color: shown && value ? 'var(--fg)' : 'var(--fg-subtle)',
          fontFamily: label === 'MBI' ? 'var(--font-mono)' : 'var(--font-sans)',
          transition: 'border-color 240ms var(--ease)',
        }}
      >
        {isAI && (
          <span style={{ position: 'absolute', top: -9, right: 10, display: 'flex', alignItems: 'center', gap: 4,
            background: '#eab308', color: '#1a1205', fontSize: 10, fontWeight: 800, letterSpacing: '.03em',
            padding: '2px 7px', borderRadius: 999, boxShadow: 'var(--shadow-sm)' }}>
            <Icon name="sparkles" size={11} /> AI
          </span>
        )}
        {shown && value ? value : placeholder}
      </div>
    </div>
  );
}

function NewLeadForm({ onClose }) {
  const [filling, setFilling] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setFilling(true), 650);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={nlStyles.scrim} onClick={onClose}>
      <div style={nlStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={nlStyles.head}>
          <div>
            <h2 style={nlStyles.title}>New Lead</h2>
            <p style={nlStyles.sub}>Capture a lead — Atlas pre-fills what it heard on the call.</p>
          </div>
          <button className="hicon" onClick={onClose} style={nlStyles.close}><Icon name="x" size={18} /></button>
        </div>

        {filling && (
          <div className="msg-in" style={nlStyles.aiNote}>
            <AtlasMark size={22} animate={false} />
            <span>Atlas filled <b style={{ color: 'var(--fg)' }}>3 fields</b> from your call with Dorothy. Review the highlighted ones.</span>
          </div>
        )}

        <div style={nlStyles.grid}>
          <Field label="Full name" value="Dorothy Roberts" placeholder="Jane Doe" />
          <Field label="MBI" value="4QV-20-1TSU" placeholder="0000-000-0000" filled delay={0} />
          <Field label="Date of birth" value="Mar 4, 1931" placeholder="MM / DD / YYYY" filled delay={260} />
          <Field label="Phone" value="(499) 983-1255" placeholder="(000) 000-0000" />
          <Field label="State" value="New Mexico" placeholder="Select state" filled delay={520} />
          <Field label="Lead source" value="Referral" placeholder="Select source" />
        </div>

        <div style={nlStyles.foot}>
          <button className="hbtn" onClick={onClose} style={nlStyles.cancel}>Cancel</button>
          <button className="hprimary" onClick={onClose} style={nlStyles.save}>
            <Icon name="check" size={16} /> Save lead
          </button>
        </div>
      </div>
    </div>
  );
}

const nlStyles = {
  scrim: {
    position: 'absolute', inset: 0, background: 'rgba(3,6,12,.62)', backdropFilter: 'blur(2px)',
    display: 'grid', placeItems: 'center', zIndex: 50, padding: 24,
  },
  modal: {
    width: 560, maxWidth: '100%', background: 'var(--surface-1)', border: '1px solid var(--border-strong)',
    borderRadius: 18, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
    animation: 'modal-pop .3s var(--ease)',
  },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 22px 0' },
  title: { fontSize: 21, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--fg)', margin: 0 },
  sub: { fontSize: 13, color: 'var(--fg-muted)', margin: '5px 0 0' },
  close: { all: 'unset', cursor: 'pointer', width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 9, color: 'var(--fg-muted)' },
  aiNote: {
    display: 'flex', alignItems: 'center', gap: 10, margin: '16px 22px 0', padding: '10px 13px',
    background: 'rgba(234,179,8,.08)', border: '1px solid rgba(234,179,8,.25)', borderRadius: 11,
    fontSize: 12.5, color: 'var(--fg-muted)',
  },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 18px', padding: '22px' },
  foot: { display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '0 22px 22px' },
  cancel: { all: 'unset', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--fg-muted)', padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border-strong)' },
  save: { all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600, color: '#fff', background: 'var(--exl-orange)', padding: '10px 18px', borderRadius: 10 },
};

Object.assign(window, { NewLeadForm });
