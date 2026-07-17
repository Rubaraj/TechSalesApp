/**
 * Rich-chat upgrade — lightweight markdown renderer for Atlas messages.
 *
 * Hand-rolled on purpose (no runtime dependency; the repo is deliberately
 * dependency-light). Line-based block parsing, so it is tolerant of partial
 * markdown mid-token-stream: an incomplete table or list simply renders as a
 * paragraph until the next tokens arrive. Never throws — any parse failure
 * falls back to pre-wrap plain text.
 *
 * Supported blocks: # / ## / ### headings, unordered (- or *) and ordered
 * (1.) lists, GFM pipe tables (header + |---| separator), paragraphs.
 * Supported inline: **bold**, `code`, [text](url).
 *
 * Link policy: internal hrefs (starting with "/") navigate via React Router
 * (no page reload, app state preserved); http(s) links open in a new tab
 * with rel="noopener noreferrer"; any other scheme (javascript:, data:,
 * etc.) renders as plain text.
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

const FG = 'var(--color-atlas-fg)';
const MUTED = 'var(--color-atlas-fg-muted)';
const SUBTLE = 'var(--color-atlas-fg-subtle)';
const BORDER = 'var(--color-atlas-border)';

// ---------------------------------------------------------------------------
// Inline rendering: **bold**, `code`, [text](url)
// ---------------------------------------------------------------------------

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function InlineLink({ label, href }: { label: string; href: string }): React.JSX.Element {
  const navigate = useNavigate();
  const style: React.CSSProperties = {
    color: 'var(--color-exl-orange-bright)',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
    cursor: 'pointer',
  };
  if (href.startsWith('/')) {
    return (
      <a
        href={href}
        style={style}
        onClick={(e) => {
          e.preventDefault();
          navigate(href);
        }}
      >
        {label}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
      {label}
    </a>
  );
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE_RE);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={key} style={{ fontWeight: 700, color: FG }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={key}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.88em',
            background: 'var(--color-atlas-surface-3)',
            padding: '1px 5px',
            borderRadius: 5,
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      const isInternal = href.startsWith('/');
      const isHttp = /^https?:\/\//i.test(href);
      if (isInternal || isHttp) {
        return <InlineLink key={key} label={label} href={href} />;
      }
      // Unsafe scheme (javascript:, data:, …) — render the label as text.
      return <span key={key}>{label}</span>;
    }
    return part === '' ? null : <span key={key}>{part}</span>;
  });
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'para'; text: string };

const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function parseBlocks(md: string): Block[] {
  const lines = md.split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];

  const flushPara = (): void => {
    if (para.length > 0) {
      blocks.push({ type: 'para', text: para.join('\n') });
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      flushPara();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      continue;
    }

    // Table: a pipe-bearing line whose NEXT line is a |---| separator.
    if (trimmed.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      flushPara();
      const header = splitTableRow(trimmed);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().includes('|') && lines[j].trim() !== '') {
        rows.push(splitTableRow(lines[j]));
        j++;
      }
      blocks.push({ type: 'table', header, rows });
      i = j - 1;
      continue;
    }

    const ul = /^[-*]\s+(.*)$/.exec(trimmed);
    if (ul) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last?.type === 'ul') last.items.push(ul[1]);
      else blocks.push({ type: 'ul', items: [ul[1]] });
      continue;
    }

    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ol) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last?.type === 'ol') last.items.push(ol[1]);
      else blocks.push({ type: 'ol', items: [ol[1]] });
      continue;
    }

    para.push(line);
  }
  flushPara();
  return blocks;
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

function BlockView({ block, idx }: { block: Block; idx: number }): React.JSX.Element {
  const k = `b${idx}`;
  switch (block.type) {
    case 'heading': {
      const size = block.level === 1 ? 15.5 : block.level === 2 ? 14.5 : 14;
      return (
        <div style={{ fontSize: size, fontWeight: 700, color: FG, margin: '10px 0 4px' }}>
          {renderInline(block.text, k)}
        </div>
      );
    }
    case 'ul':
      return (
        <ul style={{ margin: '4px 0', paddingLeft: 18, listStyleType: 'disc' }}>
          {block.items.map((item, i) => (
            <li key={i} style={{ margin: '2px 0' }}>
              {renderInline(item, `${k}-${i}`)}
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol style={{ margin: '4px 0', paddingLeft: 20, listStyleType: 'decimal' }}>
          {block.items.map((item, i) => (
            <li key={i} style={{ margin: '2px 0' }}>
              {renderInline(item, `${k}-${i}`)}
            </li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <div style={{ overflowX: 'auto', margin: '6px 0' }}>
          <table
            style={{
              borderCollapse: 'collapse',
              fontSize: 12.5,
              minWidth: '100%',
            }}
          >
            <thead>
              <tr>
                {block.header.map((h, i) => (
                  <th
                    key={i}
                    style={{
                      textAlign: 'left',
                      padding: '5px 10px',
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: SUBTLE,
                      borderBottom: `1px solid ${BORDER}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {renderInline(h, `${k}-h${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      style={{
                        padding: '5px 10px',
                        borderBottom: `1px solid var(--color-atlas-border-faint, ${BORDER})`,
                        color: c === 0 ? FG : MUTED,
                        verticalAlign: 'top',
                      }}
                    >
                      {renderInline(cell, `${k}-${r}-${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'para':
    default:
      return (
        <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>
          {renderInline(block.text, k)}
        </p>
      );
  }
}

export function AtlasMarkdown({ text }: { text: string }): React.JSX.Element {
  // Parse (not render) inside try/catch — render errors need an error
  // boundary, but the only throw-prone step here is the parser, and a parse
  // failure must never take the message down.
  let blocks: Block[] | null;
  try {
    blocks = parseBlocks(text);
  } catch {
    blocks = null;
  }
  if (!blocks) {
    return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>;
  }
  return (
    <div style={{ wordBreak: 'break-word' }}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} idx={i} />
      ))}
    </div>
  );
}
