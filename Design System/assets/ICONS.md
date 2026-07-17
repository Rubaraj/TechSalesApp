# Iconography — EXL Medicare Hub

**Set:** [Lucide](https://lucide.dev) (open-source line icons). Stroke ~1.75px, rounded
caps/joins, 20–24px. Load via CDN; render by name. Do **not** hand-draw SVGs or use emoji.

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
<i data-lucide="phone"></i>
<script>lucide.createIcons();</script>
```

In React (this kit), a tiny `<Icon name="phone" size={18} />` wrapper injects the SVG.

## Name mapping (UI → Lucide)

| Where | Lucide name |
|---|---|
| Lead phone row / Call | `phone` |
| Lead email row | `mail` |
| Lead location row | `map-pin` |
| Lead created date | `calendar` |
| Search field | `search` |
| Filters | `filter` |
| Clear | `x` |
| New Lead / Start new | `plus` / `plus-square` |
| View (eye) action | `eye` |
| Edit action | `pencil` |
| Delete action | `trash-2` |
| Header notifications | `bell` |
| Header phone toggle (dialer) | `phone` |
| Theme toggle | `sun` / `moon` |
| User avatar | `circle-user-round` |
| Logout | `log-out` |
| Insights tab | `layout-grid` |
| Sales tab | `briefcase` |
| Atlas — mute | `volume-x` |
| Atlas — navigate/explore | `compass` |
| Atlas — history | `history` |
| Atlas — new chat | `square-pen` / `plus-square` |
| Atlas — close panel | `x` |
| Dialer — mic | `mic` |
| Dialer — backspace | `delete` |
| Dialer — collapse | `chevron-up` |
| Chat send | `send` / `send-horizontal` |
| Continuing-conversation banner | `history` / `rotate-ccw` |
| Approval card — approve | `check` |
| Approval card — reject | `x` |
| Approval card — email subject | `mail` |
| Tool-call trace | `wrench` / `terminal` |
| Auto-fill chip | `sparkles` (or text "AI") |
| Atlas mark / AI greeting | `sparkles` (orange gradient) |

## The Atlas mark
The AI's avatar — a `sparkles` glyph in white on a rounded-square tile filled with the
orange→amber gradient (`--atlas-from` → `--atlas-to`). See `atlas-mark.html`.
