// LeadBoard.jsx — the Lead Management context behind the docked copilot.

const STATUS = {
  'New Lead':          { c: 'var(--st-new)',         bg: 'rgba(79,147,247,.14)' },
  'Contacted Lead':    { c: 'var(--st-contacted)',   bg: 'rgba(155,124,246,.14)' },
  'Appointment Schedule': { c: 'var(--st-appointment)', bg: 'rgba(34,195,224,.14)' },
  'Enrollment in progress': { c: 'var(--st-enrollment)', bg: 'rgba(245,158,11,.14)' },
  'Enrolled':          { c: 'var(--st-enrolled)',    bg: 'rgba(43,189,110,.14)' },
  'Dropped / Lost lead': { c: 'var(--st-dropped)',   bg: 'rgba(244,83,107,.14)' },
};

const PIPELINE = [
  ['New Lead', 8], ['Contacted Lead', 10], ['Appointment Schedule', 10],
  ['Enrollment in progress', 11], ['Enrolled', 12], ['Dropped / Lost lead', 6],
];

const LEADS = [
  { name: 'Joshua Johnson', age: 99, mbi: 'B01-8U-MS9D', status: 'Enrollment in progress', src: 'Referral',
    phone: '(959) 248-0333', email: 'joshua.johnson14@outlook.com', loc: 'Virginia Beach, MD 74101',
    created: 'Jan 2, 2026', tags: [['Dual Eligible', 'var(--tag-dual)']] },
  { name: 'Dorothy Roberts', age: 95, mbi: '4QV-20-1TSU', status: 'Contacted Lead', src: 'Referral',
    phone: '(499) 983-1255', email: 'dorothy.roberts356@hotmail.com', loc: 'Austin, NM 89101',
    created: 'Jan 2, 2026', tags: [['Dual Eligible', 'var(--tag-dual)']] },
  { name: 'Linda Wright', age: 93, mbi: 'V90-VP-JZAH', status: 'Appointment Schedule', src: 'Referral',
    phone: '(851) 435-7103', email: 'linda.wright640@hotmail.com', loc: 'Arlington, SC 27601',
    created: 'Jan 1, 2026', tags: [['Dual Eligible', 'var(--tag-dual)']] },
  { name: 'Donna Nelson', age: 96, mbi: 'J8I-PS-GAPW', status: 'Enrolled', src: 'Referral',
    phone: '(257) 350-5750', email: 'donna.nelson800@hotmail.com', loc: 'Minneapolis, NJ 33601',
    created: 'Dec 31, 2025', tags: [['Dual Eligible', 'var(--tag-dual)']] },
  { name: 'Scott Thomas', age: 76, mbi: '2OE6-GH7-LKI2', status: 'Enrollment in progress', src: 'Web',
    phone: '(555) 788-6165', email: 'sthomas@email.com', loc: 'Louisville, KY 40216',
    created: 'Dec 30, 2025', tags: [['Dual Eligible', 'var(--tag-dual)'], ['1 Pharmacies', 'var(--tag-pharm)'], ['1 Drugs', 'var(--tag-drugs)']] },
  { name: 'Emma Johnson', age: 67, mbi: '9J93-KL5-HI2A', status: 'New Lead', src: 'Web',
    phone: '(215) 706-7722', email: 'emma61@gmail.com', loc: 'Philadelphia, PA 19104',
    created: 'Dec 29, 2025', tags: [['Dual Eligible', 'var(--tag-dual)'], ['3 Drugs', 'var(--tag-drugs)']] },
];

function MetaRow({ icon, children }) {
  return (
    <div style={lbStyles.metaRow}>
      <Icon name={icon} size={15} color="var(--fg-subtle)" /> <span>{children}</span>
    </div>
  );
}

function LeadCard({ lead, onCall }) {
  const st = STATUS[lead.status];
  return (
    <div style={lbStyles.card}>
      <div style={lbStyles.cardTop}>
        <div>
          <div style={lbStyles.name}>{lead.name}</div>
          <div style={lbStyles.sub}>
            Age: {lead.age} · <span className="mono" style={{ color: 'var(--fg-muted)' }}>MBI {lead.mbi}</span>
          </div>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: st.c }}>{lead.status}</span>
      </div>
      <span style={lbStyles.src}>{lead.src}</span>

      <div style={lbStyles.metaList}>
        <div style={lbStyles.metaRowWrap}>
          <MetaRow icon="phone">{lead.phone}</MetaRow>
          <button style={lbStyles.callBtn} onClick={() => onCall(lead)}>
            <Icon name="phone" size={13} /> Call
          </button>
        </div>
        <MetaRow icon="mail">{lead.email}</MetaRow>
        <MetaRow icon="map-pin">{lead.loc}</MetaRow>
        <MetaRow icon="calendar">Created: {lead.created}</MetaRow>
      </div>

      <div style={lbStyles.tags}>
        {lead.tags.map(([t, c]) => (
          <span key={t} style={{ fontSize: 11.5, fontWeight: 700, color: c }}>{t}</span>
        ))}
      </div>

      <div style={lbStyles.cardFoot}>
        <div style={{ display: 'flex', gap: 2 }}>
          <button style={lbStyles.act}><Icon name="eye" size={16} /></button>
          <button style={{ ...lbStyles.act, ...lbStyles.actEdit }}><Icon name="pencil" size={16} /></button>
          <button style={{ ...lbStyles.act, ...lbStyles.actDel }}><Icon name="trash-2" size={16} /></button>
        </div>
        <button style={lbStyles.viewBtn}>View Details</button>
      </div>
    </div>
  );
}

function LeadBoard({ onCall, onNewLead }) {
  return (
    <div style={lbStyles.wrap}>
      <div style={lbStyles.headRow}>
        <div>
          <h1 style={lbStyles.title}>Lead Management</h1>
          <p style={lbStyles.subtitle}>Manage and track your insurance leads</p>
        </div>
        <button style={lbStyles.newBtn} onClick={onNewLead}>
          <Icon name="plus" size={17} /> New Lead
        </button>
      </div>

      <div style={lbStyles.toolbar}>
        <div style={lbStyles.search}>
          <Icon name="search" size={17} color="var(--fg-subtle)" />
          <span style={{ color: 'var(--fg-subtle)' }}>Search by name, email, phone…</span>
        </div>
        <button style={lbStyles.filterBtn}><Icon name="filter" size={15} /> Filters</button>
        <button style={lbStyles.clearBtn}><Icon name="x" size={15} /> Clear</button>
      </div>

      <div style={lbStyles.pipeline}>
        {PIPELINE.map(([label, n]) => (
          <div key={label} style={lbStyles.statCard}>
            <span style={{ fontSize: 12, fontWeight: 700, color: STATUS[label].c }}>{label}</span>
            <span style={lbStyles.statNum}>{n}</span>
          </div>
        ))}
      </div>

      <div style={lbStyles.grid}>
        {LEADS.map((l) => <LeadCard key={l.name} lead={l} onCall={onCall} />)}
      </div>
    </div>
  );
}

const lbStyles = {
  wrap: { padding: '28px 32px 60px', minHeight: '100%' },
  headRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--fg)', margin: 0 },
  subtitle: { fontSize: 14.5, color: 'var(--fg-muted)', margin: '6px 0 0' },
  newBtn: {
    all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
    background: 'var(--exl-orange)', color: '#fff', fontWeight: 600, fontSize: 14.5,
    padding: '10px 18px', borderRadius: 10,
  },
  toolbar: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 22 },
  search: {
    flex: 1, maxWidth: 420, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14,
    background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 11, padding: '11px 14px',
  },
  filterBtn: {
    all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14,
    fontWeight: 600, color: 'var(--fg)', padding: '10px 15px', borderRadius: 10,
    border: '1px solid var(--border-strong)',
  },
  clearBtn: {
    all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14,
    fontWeight: 600, color: 'var(--fg-muted)', padding: '10px 12px',
  },
  pipeline: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 24 },
  statCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 14px',
    background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14,
  },
  statNum: { fontSize: 30, fontWeight: 800, color: 'var(--fg)', lineHeight: 1 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 18 },
  card: {
    background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14,
    padding: 18, boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  name: { fontSize: 17, fontWeight: 700, color: 'var(--fg)' },
  sub: { fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 3 },
  src: {
    alignSelf: 'flex-start', marginTop: 9, fontSize: 11, fontWeight: 600,
    background: 'var(--tag-neutral-bg)', color: 'var(--tag-neutral-fg)', padding: '3px 9px', borderRadius: 999,
  },
  metaList: { display: 'flex', flexDirection: 'column', gap: 9, margin: '14px 0 12px' },
  metaRow: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--fg-muted)' },
  metaRowWrap: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  callBtn: {
    all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
    fontWeight: 600, color: 'var(--fg-muted)', padding: '5px 12px', borderRadius: 8,
    border: '1px solid var(--border-strong)',
  },
  tags: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  cardFoot: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12,
  },
  act: {
    all: 'unset', cursor: 'pointer', width: 32, height: 32, display: 'grid', placeItems: 'center',
    borderRadius: 8, color: 'var(--fg-subtle)', transition: 'all 120ms var(--ease)',
  },
  actEdit: {}, actDel: {},
  viewBtn: {
    all: 'unset', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--fg)',
    padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border-strong)',
  },
};

Object.assign(window, { LeadBoard, LeadCard, STATUS, LEADS });
