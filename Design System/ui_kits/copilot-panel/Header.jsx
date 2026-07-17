// Header.jsx — fixed top app bar (EXL logo, Insights/Sales, agent controls).

function Header({ theme, onToggleTheme, dialerOn, onToggleDialer, onOpenCopilot, copilotOpen }) {
  const [tab, setTab] = React.useState('sales');
  return (
    <header style={hStyles.bar}>
      {/* Brand lockup */}
      <div style={hStyles.brand}>
        <span style={hStyles.exl}>EXL</span>
        <span style={hStyles.divider} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={hStyles.product}>Medicare Hub</span>
          <span style={hStyles.tagline}>Built for agents. Trusted by seniors.</span>
        </div>
      </div>

      {/* Section tabs */}
      <div style={hStyles.tabs}>
        <button
          style={{ ...hStyles.tab, ...(tab === 'insights' ? hStyles.tabOn : {}) }}
          onClick={() => setTab('insights')}
        >
          <Icon name="layout-grid" size={15} /> Insights
        </button>
        <button
          style={{ ...hStyles.tab, ...(tab === 'sales' ? hStyles.tabOn : {}) }}
          onClick={() => setTab('sales')}
        >
          <Icon name="briefcase" size={15} /> Sales
        </button>
      </div>

      <div style={{ flex: 1 }} />

      {/* Right controls */}
      <div style={hStyles.controls}>
        <button style={hStyles.iconBtn} title="Notifications">
          <Icon name="bell" size={18} />
          <span style={hStyles.dot} />
        </button>
        <button
          style={{ ...hStyles.iconBtn, ...(dialerOn ? hStyles.iconBtnOn : {}) }}
          title="Toggle dialer"
          onClick={onToggleDialer}
        >
          <Icon name="phone" size={18} />
        </button>
        <button style={hStyles.iconBtn} title="Theme" onClick={onToggleTheme}>
          <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} />
        </button>
        <div style={hStyles.agent}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={hStyles.agentName}>Mike Wilson</span>
            <span style={hStyles.agentRole}>Sales Agent</span>
          </div>
          <span style={hStyles.avatar}><Icon name="circle-user-round" size={26} /></span>
        </div>
        <span style={hStyles.mongo}><Icon name="database" size={14} /> MongoDB</span>
        {!copilotOpen && (
          <button style={{ ...hStyles.iconBtn, ...hStyles.iconBtnOn }} title="Open Atlas" onClick={onOpenCopilot}>
            <Icon name="sparkles" size={18} />
          </button>
        )}
        <button style={hStyles.iconBtn} title="Log out"><Icon name="log-out" size={18} /></button>
      </div>
    </header>
  );
}

const hStyles = {
  bar: {
    height: 68, flex: 'none', display: 'flex', alignItems: 'center', gap: 20,
    padding: '0 22px', background: 'var(--surface-1)',
    borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 5,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 14 },
  exl: { fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--exl-orange)', lineHeight: 1 },
  divider: { width: 1, height: 34, background: 'var(--border-strong)' },
  product: { fontSize: 18, fontWeight: 800, color: 'var(--fg)', lineHeight: 1 },
  tagline: { fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1 },
  tabs: {
    display: 'flex', gap: 3, marginLeft: 8, background: 'var(--surface-3)',
    padding: 3, borderRadius: 11, border: '1px solid var(--border)',
  },
  tab: {
    all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
    fontSize: 13.5, fontWeight: 600, color: 'var(--fg-muted)', padding: '7px 14px',
    borderRadius: 8, transition: 'all 120ms var(--ease)',
  },
  tabOn: { background: 'var(--exl-orange)', color: '#fff' },
  controls: { display: 'flex', alignItems: 'center', gap: 6 },
  iconBtn: {
    all: 'unset', cursor: 'pointer', position: 'relative', width: 38, height: 38,
    display: 'grid', placeItems: 'center', borderRadius: 10, color: 'var(--fg-muted)',
    transition: 'all 120ms var(--ease)',
  },
  iconBtnOn: { color: 'var(--exl-orange)', background: 'var(--exl-orange-soft)' },
  dot: {
    position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: '50%',
    background: 'var(--danger)', border: '2px solid var(--surface-1)',
  },
  agent: { display: 'flex', alignItems: 'center', gap: 9, margin: '0 6px 0 8px' },
  agentName: { fontSize: 13.5, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.1, whiteSpace: 'nowrap' },
  agentRole: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-muted)', whiteSpace: 'nowrap' },
  avatar: { color: 'var(--fg-muted)', display: 'inline-flex' },
  mongo: {
    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
    color: 'var(--st-enrolled)', padding: '5px 10px', borderRadius: 8,
    background: 'rgba(43,189,110,.10)', border: '1px solid rgba(43,189,110,.22)',
  },
};

Object.assign(window, { Header });
