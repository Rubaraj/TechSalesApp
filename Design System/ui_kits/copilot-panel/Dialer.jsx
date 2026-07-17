// Dialer.jsx — softphone: number field + keypad + Call, with connecting spinner.

const KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

function Dialer({ onCollapse, initialNumber }) {
  const [num, setNum] = React.useState(initialNumber || '(415) 555-1234');
  const [status, setStatus] = React.useState('idle'); // idle | connecting | active

  React.useEffect(() => {
    if (initialNumber) { setNum(initialNumber); }
  }, [initialNumber]);

  const press = (k) => { if (status === 'idle') setNum((n) => n + k); };
  const back = () => setNum((n) => n.slice(0, -1));
  const call = () => {
    if (status === 'idle') {
      setStatus('connecting');
      setTimeout(() => setStatus('active'), 2400);
    } else {
      setStatus('idle');
    }
  };

  return (
    <div style={dlStyles.wrap} className="scroll">
      <div style={dlStyles.head}>
        <Icon name="mic" size={16} color="var(--exl-orange)" />
        <span style={dlStyles.title}>Dialer</span>
        {status === 'active' && <span style={dlStyles.live}><span style={dlStyles.liveDot} />On call · 00:14</span>}
        <div style={{ flex: 1 }} />
        <button style={dlStyles.collapse} onClick={onCollapse} title="Collapse dialer">
          <Icon name="chevron-up" size={18} />
        </button>
      </div>

      <div style={dlStyles.display}>
        <span className="mono" style={dlStyles.number}>{num || <span style={{ color: 'var(--fg-subtle)' }}>Enter a number</span>}</span>
        <button style={dlStyles.back} onClick={back} title="Backspace"><Icon name="delete" size={18} /></button>
      </div>

      <div style={dlStyles.pad}>
        {KEYS.map(([k, sub]) => (
          <button key={k} style={dlStyles.key} onClick={() => press(k)}>
            <span style={dlStyles.keyNum}>{k}</span>
            {sub && <span style={dlStyles.keySub}>{sub}</span>}
          </button>
        ))}
      </div>

      <button
        style={{ ...dlStyles.callBtn, ...(status !== 'idle' ? dlStyles.callBtnActive : {}) }}
        onClick={call}
      >
        {status === 'connecting' ? (
          <React.Fragment><span style={dlStyles.spinner} />Connecting…</React.Fragment>
        ) : status === 'active' ? (
          <React.Fragment><Icon name="phone-off" size={18} /> End call</React.Fragment>
        ) : (
          <React.Fragment><Icon name="phone" size={18} /> Call</React.Fragment>
        )}
      </button>
    </div>
  );
}

const dlStyles = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', padding: '14px 16px', overflowY: 'auto' },
  head: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--fg)' },
  live: {
    display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8, fontSize: 11.5,
    fontWeight: 600, color: 'var(--st-enrolled)',
  },
  liveDot: { width: 7, height: 7, borderRadius: '50%', background: 'var(--st-enrolled)' },
  collapse: {
    all: 'unset', cursor: 'pointer', width: 30, height: 30, display: 'grid', placeItems: 'center',
    borderRadius: 8, color: 'var(--fg-muted)',
  },
  display: {
    display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-3)',
    border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px', marginBottom: 12, flex: 'none',
  },
  number: { flex: 1, fontSize: 19, letterSpacing: '0.03em', color: 'var(--fg)' },
  back: { all: 'unset', cursor: 'pointer', color: 'var(--fg-subtle)', display: 'inline-flex' },
  pad: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: 'minmax(44px, 1fr)', gap: 8, marginBottom: 12, flex: '1 0 auto' },
  key: {
    all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 1, borderRadius: 12, background: 'var(--surface-2)', minHeight: 44, overflow: 'hidden',
    border: '1px solid var(--border)', transition: 'background 120ms var(--ease)',
  },
  keyNum: { fontSize: 20, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.1 },
  keySub: { fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--fg-subtle)' },
  callBtn: {
    all: 'unset', cursor: 'pointer', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 9, height: 46, borderRadius: 13, background: 'var(--exl-orange)', color: '#fff',
    fontSize: 15.5, fontWeight: 700, transition: 'background 160ms var(--ease)',
  },
  callBtnActive: { background: 'var(--exl-orange-press)' },
  spinner: {
    width: 19, height: 19, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,.35)',
    borderTopColor: '#fff', animation: 'atlas-spin 1.4s linear infinite',
  },
};

Object.assign(window, { Dialer });
