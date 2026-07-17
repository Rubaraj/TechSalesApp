# EXL Medicare Hub — Design System

A design system for **EXL Medicare Hub**, a web app built for Medicare insurance sales
agents, and its embedded AI copilot, **Atlas**. This system captures the brand, visual
foundations, and high-fidelity UI components so design agents can produce on-brand
screens, prototypes, and assets.

> **Tagline:** *Medicare Hub — Built for agents. Trusted by seniors.*

---

## What this product is

EXL Medicare Hub is a sales-agent workspace for managing Medicare insurance leads. The
core screen is **Lead Management**: a searchable, filterable board of lead cards grouped
by a six-stage pipeline (New Lead → Contacted → Appointment Scheduled → Enrollment in
progress → Enrolled → Dropped/Lost). Agents like "Mike Wilson — Sales Agent" work the
board all day.

Docked to the right edge is **Atlas**, the AI Copilot. Atlas is split-capable:

- **Dialer (top half)** — a softphone with a number field and keypad. The dialer is
  toggled from the header. **When the dialer is ON, the panel is 50% dialer / 50% Atlas
  chat. When OFF, Atlas chat fills 100%.**
- **Atlas chat (bottom/whole)** — message bubbles, tool-call traces, an inline approval
  card for AI-proposed actions (e.g. emails), a personalized greeting card, and a small
  "continuing previous conversation" banner.

Atlas runs in one of three **modes**: **Silent**, **Assist**, **Auto Pilot** — governing
how much it can act on its own.

### Sources given
- `uploads/ScreenShot_App.png` — Lead Management with Atlas chat open (dialer off).
- `uploads/ScreenShot_App_2.png` — same, with the Dialer open (50/50 split).
- Brand: **EXL** (ExlService). Logo referenced from
  `https://www.exlservice.com/themes/exl_service/exl_logo_rgb_orange_pos_94.png`
  (could not be downloaded into the project — see Caveats; a typographic wordmark stands
  in at `assets/exl-wordmark.html`).
- Accent color confirmed by stakeholder: **#ea580c**.
- No codebase or Figma was provided; foundations were reverse-engineered from the two
  screenshots plus stakeholder answers (humanist/friendly type, Linear/Stripe-crisp,
  comfortable density, light + dark themes).

---

## CONTENT FUNDAMENTALS

How copy is written in Medicare Hub and Atlas.

**Voice.** Plain, calm, and operational. The product addresses a professional agent at
work, not a consumer. Atlas is a competent colleague — it narrates what it's doing, then
gets out of the way.

**Person & address.** Atlas addresses the agent directly by **first name** and uses
**"you"**: *"Click any leadId to drill in, Mike."* The agent's own messages to Atlas are
imperative requests: *"Find leads in Florida that need follow-up."*

**Tone of Atlas replies.** Terse, step-by-step, status-first. Atlas thinks out loud in
short fragments rather than paragraphs:
- *"Searching the lead book…"*  (action in progress, present participle + ellipsis)
- *"No matching leads."*        (flat result statement)
- *"Click any leadId to drill in, Mike."*  (next-step nudge, names the agent)

**Casing.**
- **Titles & section heads:** Title Case — "Lead Management", "New Lead", "Appointment
  Schedule", "Dual Eligible".
- **Eyebrows / role labels:** ALL CAPS, tracked — "AI COPILOT", "SALES AGENT".
- **Body & Atlas chat:** Sentence case.
- **Buttons:** Title Case — "New Lead", "View Details", "Call", "Start new", "Resume".

**Domain vocabulary (use verbatim).** Lead, MBI (Medicare Beneficiary Identifier), Dual
Eligible, Pharmacies, Drugs, Enrollment, Referral / Web (lead source), leadId, follow-up,
lead book. Pipeline stage names are fixed strings (see Visual Foundations → status).

**Numbers & data.** Pipeline counts are bare integers under a colored stage label.
Phone numbers use US formatting `(415) 555-1234`. Dates are `Mon D, YYYY` ("Jan 2, 2026").
MBI and leadId render in monospace.

**Punctuation & ornament.** Mid-dots `·` separate inline meta ("Continuing your previous
conversation · 1 turn"; "Resume · + Start new"). Ellipsis `…` signals an in-flight action.
**No emoji** anywhere. No exclamation marks in system copy.

**Microcopy examples.**
- Banner: *"Continuing your previous conversation · 1 turn"* with actions *Resume* /
  *+ Start new*.
- Input placeholder: *"Ask Atlas anything…"*
- Search placeholder: *"Search by name, email, phone…"*
- Greeting (personalized card): *"Good afternoon, Mike."* / context line beneath.

---

## VISUAL FOUNDATIONS

**Overall.** Crisp, confident, dark-first SaaS in the Linear/Stripe register, warmed by a
single decisive orange. Comfortable density — generous padding, lots of breathing room,
nothing cramped. The interface is calm; color is used *sparingly and meaningfully*, never
decoratively.

**Color.**
- **Canvas** is a near-black slate-navy (`--bg #090d16`). Panels and the header sit one
  step up (`--surface-1`), cards another (`--surface-2`), inputs/hover another
  (`--surface-3`). Elevation is communicated by these flat surface steps plus hairline
  borders — *not* by heavy shadows.
- **#ea580c orange is the only action color.** It marks the single primary action in any
  context: New Lead, Call, the active "Sales" tab, the send button, user chat bubbles,
  the Atlas mark. Everything else is neutral. Orange is never used for large fills or
  backgrounds — only buttons, the user bubble, and thin accents.
- **Status spectrum** (pipeline + badges) is a fixed 6-hue ramp: blue (New) → violet
  (Contacted) → cyan (Appointment) → amber (Enrollment) → green (Enrolled) → rose
  (Dropped). These appear as colored *text labels* and badge text, not filled chips.
- **Data tags** carry their own fixed colors: Dual Eligible = yellow, Pharmacies = green,
  Drugs = amber, all as outlined/soft pills. Source tags (Referral, Web) are neutral grey.

**Type.** **Inter** (300–800) for all UI — this matches the live codebase, where Inter is
the single global font. The system adds two things on top: a **system monospace** stack
for codes (MBI, leadId, dialer digits, call timers — as shipped, no custom mono webfont),
and **Newsreader**, an editorial serif reserved for the **Atlas AI surface** (greetings /
AI headers) so the copilot reads as a distinct surface, not generic CRM chrome. Page titles
are heavy Inter (800) and tight-tracked. Eyebrows ("AI COPILOT") are 11px uppercase,
wide-tracked, muted. Body
is 15px. Comfortable line-height (~1.55) for chat.

**Spacing & layout.** 4px base scale. Cards use ~20–24px internal padding. The lead board
is a responsive multi-column grid of cards; the copilot is a **fixed right-docked column**
(~440px) that overlays the board. The header is a fixed top bar. When the dialer opens the
copilot column splits exactly 50/50 vertically.

**Cards.** Dark surface (`--surface-2`), hairline border (`rgba(255,255,255,.07)`),
`--r-lg` (14px) corners, soft `--shadow-md`. Header row = name (bold) + status badge
(colored text, top-right). Body = meta rows with leading line icons. Footer = ghost icon
actions (view/edit/delete) on the left, a bordered "View Details" on the right. **No
colored left-border accents** — borders are uniform and neutral.

**Buttons.**
- *Primary:* solid orange, white text, `--r-sm`/`--r-md`, weight 600. Hover → brighter
  orange (`--exl-orange-bright`); press → darker (`--exl-orange-press`) + slight scale
  down (0.98).
- *Secondary/ghost:* transparent with hairline border or none; hover raises to
  `--surface-3`. "Call" on lead cards is a small bordered ghost button that becomes solid
  orange when emphasized.
- *Icon buttons:* 32–36px, neutral by default, tint to their semantic color on hover
  (edit = blue, delete = red).

**Inputs.** Filled `--surface-3`, hairline border, `--r-md`, leading icon, muted
placeholder. Focus → orange ring (`--ring-accent`) or info-blue ring for form fields.

**Badges & pills.** Fully rounded (`--r-pill`). Status badges are colored text on a barely-
tinted background. The "AI" autofill chip is a tiny solid pill.

**Backgrounds.** Flat color only — **no gradients on surfaces, no imagery, no textures.**
The single permitted gradient is the small Atlas radar mark (orange→amber) and the user
chat bubble. Optionally a very faint radial orange glow behind the Atlas header.

**Animation.** Restrained and physical. Primary easing `cubic-bezier(0.32,0.72,0,1)`.
Panel/dialer slide + fade (200–360ms). Buttons: 120ms color, scale-down on press. The
"AI thinking" loader is three dots with a staggered fade/bounce. The connecting spinner is
a slow, calm ring (no frantic spin). Auto-filled fields get a soft yellow ring that pulses
once then settles. Respect `prefers-reduced-motion`.

**Hover / press.**
- Hover: lift surface one step (`--surface-2`→`--surface-3`), or brighten accent.
- Press: darken + scale 0.98.
- Focus-visible: 3px soft ring in accent (actions) or info-blue (fields).

**Borders & shadows.** Hairline borders everywhere (`rgba(255,255,255,.07)` dark /
`#e4e9f0` light). Shadows are soft and low in dark mode (depth comes from surface steps);
slightly more present in light mode. The docked panel casts a leftward shadow
(`--shadow-panel`).

**Radii.** xs 6 · sm 8 · md 10 · lg 14 (cards) · xl 18 · pill 999.

**Transparency & blur.** Used lightly: the "continuing conversation" banner is a tinted
translucent surface; overlays/scrims use low-alpha black. Optional backdrop-blur on the
docked panel's header. Not a glassmorphism-heavy system.

---

## ICONOGRAPHY

**System:** line icons, ~1.75–2px stroke, rounded caps/joins, 20–24px — i.e. the
**Lucide** family (open-source, the de-facto Linear/Stripe-era line set). The screenshots
show exactly this style (phone, mail, map-pin, calendar, bell, eye, pencil, trash,
filter, search, mic, sun, send, plus-square, compass, speaker, x). Medicare Hub uses these
as **inline functional icons** — every lead meta row is led by one (phone/mail/pin/
calendar), card actions are icon buttons, the header is a row of icon controls.

**Approach in this system:** load **Lucide via CDN** (`lucide@latest`) rather than
hand-drawing SVGs. Components reference icons by name. Stroke and size are normalized to
the tokens above. See `assets/ICONS.md` for the exact name mapping.

- **No icon font** (no Font Awesome / Material Icons glyphs).
- **No emoji** as icons, ever.
- **No unicode-symbol icons**, except the mid-dot `·` as a textual separator.
- The **Atlas mark** is the one bespoke graphic — a **radar / sonar-ping** avatar (pulsing
  core emitting concentric pings) on a rounded-square orange→amber tile, gently animated
  (`assets/atlas-mark.html`; `AtlasMark` in the kit). It signals Atlas scanning the lead
  book. Treat it as the AI's avatar.
- The **EXL logo** is a wordmark (`assets/exl-wordmark.html`) — drop the official PNG in
  when available.
- The **MongoDB** chip in the header is a third-party brand lockup shown as a status
  badge; reproduce only if the real asset is supplied.

---

## INDEX — what's in this system

| Path | What it is |
|---|---|
| `README.md` | This file — context, content + visual foundations, iconography, index. |
| `SKILL.md` | Agent-Skill manifest so this folder works as a downloadable skill. |
| `colors_and_type.css` | All design tokens (dark + light) and semantic type styles. |
| `assets/` | Atlas mark, EXL wordmark, icon mapping (`ICONS.md`). |
| `preview/` | Small specimen cards that populate the Design System tab. |
| `ui_kits/copilot-panel/` | The headline kit: the full right-docked Atlas + Dialer panel, assembled and interactive, plus all required states and variations. |

See `ui_kits/copilot-panel/README.md` for the component-level breakdown of the panel kit.

---

## CAVEATS
- The official **EXL logo PNG** could not be fetched into the project; a typographic
  wordmark stands in. Please drop the real asset into `assets/`.
- Foundations were derived from **two screenshots + your answers**, not a codebase/Figma,
  so exact pixel values (paddings, the precise neutral ramp) are close approximations.
- **Inter** is the confirmed product font (matches the live `src/index.css`). **Newsreader**
  (editorial serif for the Atlas surface) and the **system monospace** stack are my
  additions — Newsreader is the "Claude-style refresh" differentiation; swap it for Fraunces
  via the single `--font-serif` token if you prefer.
- Light theme is inferred (production shown is dark); please pressure-test it.
