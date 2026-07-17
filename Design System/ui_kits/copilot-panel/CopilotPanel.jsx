// CopilotPanel.jsx — the full right-docked Atlas panel: header + (optional) dialer + chat.

function PanelHeader({ onClose, onNewChat, mute, setMute, mode, setMode, modeStyle }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const items = [
    { name: mute ? 'volume-x' : 'volume-2', label: mute ? 'Unmute Atlas' : 'Mute Atlas', onClick: () => setMute(!mute), keepOpen: true },
    { name: 'compass', label: 'Explore' },
    { name: 'history', label: 'History' },
    { name: 'square-pen', label: 'New chat', onClick: onNewChat },
    { divider: true },
    { name: 'x', label: 'Close panel', onClick: onClose },
  ];

  return (
    <div style={cpStyles.header}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>Atlas</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>AI Copilot</span>
      </div>
      <div style={{ flex: 1 }} />
      <ModeToggle mode={mode} setMode={setMode} variant={modeStyle} />
      {mute && (
        <span title="Muted" style={{ display: 'inline-flex', color: 'var(--fg-subtle)', marginRight: 2 }}>
          <Icon name="volume-x" size={16} />
        </span>
      )}
      <div ref={ref} style={{ position: 'relative' }}>
        <button className="hicon" title="Settings" onClick={() => setOpen((o) => !o)}
          style={{ all: 'unset', cursor: 'pointer', width: 34, height: 34, display: 'grid', placeItems: 'center',
            borderRadius: 9, color: open ? 'var(--fg)' : 'var(--fg-muted)',
            background: open ? 'var(--surface-3)' : 'transparent' }}>
          <Icon name="settings" size={18} />
        </button>
        {open && (
          <div style={cpStyles.menu}>
            {items.map((it, i) => it.divider ? (
              <div key={i} style={cpStyles.menuDiv} />
            ) : (
              <button key={i} className="hbtn" style={cpStyles.menuItem}
                onClick={() => { it.onClick && it.onClick(); if (!it.keepOpen) setOpen(false); }}>
                <Icon name={it.name} size={16} color="var(--fg-muted)" /> {it.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({ onSend, accentLabel }) {
  const [val, setVal] = React.useState('');
  const submit = () => { if (val.trim()) { onSend(val.trim()); setVal(''); } };
  return (
    <div style={cpStyles.composer}>
      <div style={cpStyles.inputWrap}>
        <input
          value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Ask Atlas anything…"
          style={cpStyles.input}
        />
        <button className="hprimary" onClick={submit} style={cpStyles.send} title="Send">
          <Icon name="send-horizontal" size={17} />
        </button>
      </div>
    </div>
  );
}

let MSG_ID = 0;

function AtlasConversation({ tweaks, mode }) {
  const { bubbleStyle, approvalStyle, serifGreeting } = tweaks;
  const [showBanner, setShowBanner] = React.useState(true);
  const [messages, setMessages] = React.useState([]);
  const [thinking, setThinking] = React.useState(false);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  React.useEffect(() => {
    const h = () => { setMessages([]); setThinking(false); setShowBanner(false); };
    window.addEventListener('atlas-new-chat', h);
    return () => window.removeEventListener('atlas-new-chat', h);
  }, []);

  const push = (m) => setMessages((prev) => [...prev, { id: ++MSG_ID, ...m }]);

  const respond = (text) => {
    const t = text.toLowerCase();
    setThinking(true);
    if (/email|draft|follow-up to|write/.test(t)) {
      setTimeout(() => {
        setThinking(false);
        push({ role: 'ai', kind: 'text', lines: [{ text: 'On it — pulling Dorothy’s record and drafting a follow-up.' }] });
        push({ role: 'ai', kind: 'tool', name: 'get_lead', args: 'leadId: "LD-48213"', result: '→ Dorothy Roberts · dual-eligible · last call 2d ago' });
        setTimeout(() => push({ role: 'ai', kind: 'approval' }), 500);
      }, 1400);
    } else if (/florida|follow|need|leads/.test(t)) {
      setTimeout(() => {
        setThinking(false);
        push({ role: 'ai', kind: 'tool', name: 'search_leads', args: 'state: "FL", status: "follow_up"', result: '→ 0 results' });
        push({ role: 'ai', kind: 'text', lines: [
          { text: 'Searching the lead book…', muted: true },
          { text: 'No matching leads in Florida.' },
          { text: 'Want me to widen to the Southeast, or pick another state?' },
        ] });
      }, 1400);
    } else {
      setTimeout(() => {
        setThinking(false);
        push({ role: 'ai', kind: 'text', lines: [
          { text: 'Here’s what I can do: find and triage leads, draft calls & emails, and prep enrollment notes.' },
          { text: 'Try one of the starters above, or name a lead.' },
        ] });
      }, 1200);
    }
  };

  const send = (text) => { push({ role: 'user', text }); respond(text); };
  const newChat = () => { setMessages([]); setThinking(false); setShowBanner(false); };

  const empty = messages.length === 0;

  return (
    <div style={cpStyles.chatCol}>
      <div style={cpStyles.modeBar}>
        <span style={cpStyles.modeHint}>{MODES.find((m) => m.id === mode).hint}</span>
      </div>

      <div className="scroll chat-scroll" ref={scrollRef} style={cpStyles.scroll}>
        {showBanner && <ContinuingBanner onDismiss={() => setShowBanner(false)} onStartNew={newChat} />}
        {empty && <Greeting serif={serifGreeting} />}
        {empty && (
          <div style={cpStyles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="hbtn" onClick={() => send(s)} style={cpStyles.suggestion}>
                <Icon name="arrow-up-right" size={14} color="var(--fg-subtle)" /> {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m) => {
          if (m.role === 'user') return <UserBubble key={m.id} text={m.text} variant={bubbleStyle} />;
          if (m.kind === 'tool') return <ToolTrace key={m.id} name={m.name} args={m.args} result={m.result} />;
          if (m.kind === 'approval') return <ApprovalCard key={m.id} variant={approvalStyle} />;
          return <AiMessage key={m.id} lines={m.lines} />;
        })}
        {thinking && <ThinkingDots />}
      </div>

      <Composer onSend={send} />
    </div>
  );
}

function CopilotPanel({ tweaks, dialerOn, onToggleDialer, onClose, prefillNumber }) {
  const [mute, setMute] = React.useState(false);
  const [mode, setMode] = React.useState('assist');
  return (
    <aside style={cpStyles.panel}>
      <PanelHeader onClose={onClose} onNewChat={() => window.dispatchEvent(new Event('atlas-new-chat'))}
        mute={mute} setMute={setMute} mode={mode} setMode={setMode} modeStyle={tweaks.modeStyle} />
      <div style={cpStyles.body}>
        {dialerOn && (
          <div style={cpStyles.dialerHalf}>
            <Dialer onCollapse={onToggleDialer} initialNumber={prefillNumber} />
          </div>
        )}
        <div style={{ ...cpStyles.chatHalf, ...(dialerOn ? cpStyles.chatHalfSplit : {}) }}>
          <AtlasConversation tweaks={tweaks} mode={mode} />
        </div>
      </div>
    </aside>
  );
}

const cpStyles = {
  panel: {
    width: 440, flex: 'none', height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--surface-1)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-panel)',
  },
  header: {
    flex: 'none', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px',
    borderBottom: '1px solid var(--border)',
  },
  menu: {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 184,
    background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 12,
    boxShadow: 'var(--shadow-lg)', padding: 6, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 1,
  },
  menuItem: {
    all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5,
    color: 'var(--fg)', padding: '9px 11px', borderRadius: 8,
  },
  menuDiv: { height: 1, background: 'var(--border)', margin: '4px 2px' },
  body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
  dialerHalf: { height: '50%', flex: 'none', borderBottom: '1px solid var(--border)', overflow: 'hidden' },
  chatHalf: { flex: 1, minHeight: 0, display: 'flex' },
  chatHalfSplit: { height: '50%', flex: 'none' },
  chatCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 },
  modeBar: {
    flex: 'none', display: 'flex', alignItems: 'center', padding: '9px 14px',
    borderBottom: '1px solid var(--border-faint)',
  },
  modeHint: { fontSize: 11.5, color: 'var(--fg-subtle)' },
  scroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 14px' },
  suggestions: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 },
  suggestion: {
    all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
    color: 'var(--fg)', padding: '10px 13px', borderRadius: 10, background: 'var(--surface-2)',
    border: '1px solid var(--border)',
  },
  composer: { flex: 'none', padding: '12px 14px', borderTop: '1px solid var(--border)' },
  inputWrap: {
    display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-3)',
    border: '1px solid var(--border)', borderRadius: 12, padding: '6px 6px 6px 14px',
  },
  input: {
    all: 'unset', flex: 1, fontSize: 14, color: 'var(--fg)', fontFamily: 'var(--font-sans)',
  },
  send: {
    all: 'unset', cursor: 'pointer', width: 36, height: 36, flex: 'none', display: 'grid', placeItems: 'center',
    borderRadius: 9, background: 'var(--exl-orange)', color: '#fff',
  },
};

Object.assign(window, { CopilotPanel, AtlasConversation });
