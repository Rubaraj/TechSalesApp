# Handoff: Atlas Copilot Panel → EXL Medicare Hub repo

This bundle is the **EXL Medicare Hub design system**. It is also a self-contained
**Claude Code / Agent Skill** (see `SKILL.md`). Use it to bring the redesigned **Atlas
copilot panel** (and the brand foundations) into your real repo.

> The HTML/JSX files here are **design references** — high-fidelity prototypes of the
> intended look and behavior. They are **not** meant to be copied into the app verbatim.
> Recreate them in your existing stack (React + Tailwind + Inter) using your own
> components and patterns. Fidelity: **hi-fi** — match colors, type, spacing, and motion.

---

## A. Add it to your repo as a skill (recommended)

1. Unzip this bundle into your repo, e.g.:
   ```
   <your-repo>/.claude/skills/exl-medicare-hub-design/
   ```
   (Anywhere works; `.claude/skills/` is where Claude Code auto-discovers skills.)
2. Open the repo in **Claude Code** and prompt, e.g.:
   > "Using the exl-medicare-hub-design skill, update the Atlas copilot panel: move the
   > mode toggle into the header, replace the message avatars with AI Assist / Agent
   > labels, collapse the header icons into a settings menu, and add the AI auto-fill
   > border trace to the lead form."
3. Claude Code reads `SKILL.md` → `README.md` → the files below and implements against
   your codebase. Keep the folder in the repo so future sessions can reference it.

**What to point Claude Code at:**
| Need | File |
|---|---|
| Brand voice, visual rules, iconography | `README.md` |
| All design tokens (light + dark) | `colors_and_type.css` |
| The assembled panel + every component | `ui_kits/copilot-panel/` (start at its `README.md`) |
| Icon name mapping (Lucide) | `assets/ICONS.md` |
| Atlas radar mark | `assets/atlas-mark.html` |

---

## B. Design tokens → your `src/index.css` / Tailwind

`colors_and_type.css` is the source of truth. Mirror these into your Tailwind theme /
CSS variables. Dark is primary; light is `[data-theme="light"]`.

- **Accent (only action color):** `#ea580c` (hover `#f97316`, press `#c2410c`,
  soft `rgba(234,88,12,.12)`, line `rgba(234,88,12,.32)`).
- **Atlas gradient:** `#fb923c → #ea580c` (radar mark, user bubble).
- **Surfaces (dark):** bg `#090d16` · panel `#0e1320` · card `#141b2b` · input `#1b2335`.
- **Text (dark):** `#f1f5f9` / muted `#98a4b8` / subtle `#5d6b85`.
- **Status spectrum:** new `#4f93f7` · contacted `#9b7cf6` · appointment `#22c3e0` ·
  enrollment `#f59e0b` · enrolled `#2bbd6e` · dropped `#f4536b`.
- **Type:** `Inter` everything (you already have this) · **Newsreader** serif *only* on
  the Atlas greeting/AI headers · **system monospace** for MBI / leadId / dialer.
- **Radii:** card 14 · button 8–10 · pill 999. **Spacing:** 4px base.
- **Motion:** ease `cubic-bezier(0.32,0.72,0,1)`, 120–360ms.

---

## C. The Atlas panel — what changed (recreate these)

Map to your components: `Header`, `CallSection` (dialer), the Atlas chat, `ApprovalCard`,
`LeadForm`. Reference implementations in `ui_kits/copilot-panel/`.

1. **Dock + split.** Right-docked column (~440px). Dialer toggled from the app header;
   ON → 50% dialer / 50% chat, OFF → chat 100%. `CopilotPanel.jsx`, `Dialer.jsx`.
2. **Panel header (one row):** "Atlas / AI COPILOT" · the **mode toggle**
   (Silent / Assist / Auto Pilot) · a single **settings gear**. The gear opens a dropdown
   (Mute / Explore / History / New chat / Close) — the old icon cluster is gone.
   `CopilotPanel.jsx → PanelHeader` + `AtlasChat.jsx → ModeToggle`.
3. **Message attribution by label, not avatar:** agent messages tagged **AGENT** (muted),
   AI replies tagged **AI ASSIST** (accent). `AtlasChat.jsx → UserBubble / AiMessage`.
4. **Atlas mark = radar/sonar** (pulsing core + concentric pings), orange gradient tile.
   **Animates only while thinking**; static elsewhere. `Icon.jsx → AtlasMark`,
   `assets/atlas-mark.html`.
5. **Tool-call trace** (collapsible function call), **approval card** (AI-drafted email →
   Edit / Approve & send), **thinking dots**, **continuing-conversation banner**,
   **greeting** (serif). `AtlasChat.jsx`.
6. **Composer:** filled input + orange send. `CopilotPanel.jsx → Composer`.
7. **Layout note:** render the message list in **block flow** (margins), not a flex
   column — a flex column compresses tall cards (tool trace) and clips them.

## D. Lead form auto-fill (recreate in `LeadForm`)
Fields Atlas filled get: a **1px amber border** (`#eab308`) + a soft amber glow
(`box-shadow: 0 0 0 3px rgba(234,179,8,.16)`) + a bright **"AI" chip** (`#eab308` bg,
`#1a1205` text, sparkles icon). On fill, a **light traces around the border** in the
accent — a conic-gradient `::after` masked to the border, `@property --ai-angle`
animated 0→360 for two laps, then fades to the resting glow. See `kit.css` (`.ai-filled`)
and `NewLeadForm.jsx`. Respect `prefers-reduced-motion`.

## E. Interactions / state
- `dialerOn` (bool) → split; `copilotOpen` (bool); chat `messages[]`, `thinking` (bool),
  `mode` ('silent'|'assist'|'auto'), `mute` (bool). Auto-scroll chat to bottom on new
  messages (`el.scrollTop = el.scrollHeight` — never `scrollIntoView`).
- Dialer **Call** → calm connecting spinner (slow ring) → "on call" timer.
- "New chat" clears `messages` and dismisses the banner.

## F. Icons & fonts
- **Lucide** for all icons (CDN or `lucide-react` in your repo). Names in `assets/ICONS.md`.
- **Newsreader** is my editorial-serif choice for the AI surface; swap to your preferred
  serif via the single `--font-serif` token if desired. The official **EXL logo PNG**
  should replace the typographic wordmark in `assets/exl-wordmark.html`.

## G. Files in this bundle
Root: `README.md`, `SKILL.md`, `colors_and_type.css`, `assets/`, `preview/` (token specimen
cards), `ui_kits/copilot-panel/` (the assembled, interactive panel + all components).
