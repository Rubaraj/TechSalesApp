# UI Kit — Atlas Copilot Panel

A high-fidelity, interactive recreation of **EXL Medicare Hub** with the **Atlas** AI
copilot docked to the right. Open `index.html`.

This kit is the headline deliverable of the design system: the full right-docked panel,
assembled over the Lead Management context, with every state and variation the brief
called for.

## Run it
Open `index.html`. It loads React 18 + Babel (inline JSX), Lucide icons (CDN), and the
design tokens from `../../colors_and_type.css` via `kit.css`. No build step.

## What's interactive
- **Dialer toggle** — the header phone icon. ON → panel splits **50% dialer / 50% Atlas
  chat**; OFF → Atlas fills 100%. (Spec behaviour.) Clicking **Call** on any lead card
  prefills the dialer with that number and opens it.
- **Dialer** — tap the keypad to build a number; **Call** shows the calm connecting
  spinner, then an "on call" timer.
- **Atlas chat** — type in the composer or tap a suggestion. Atlas replies with a
  thinking loader, plain-text messages, a collapsible **tool-call trace**, and (for email
  requests) an inline **approval card** you can Approve or Edit.
- **Mode toggle** — Silent / Assist / Auto Pilot, with a live hint line.
- **New Lead** — opens the lead form where Atlas **auto-fills** fields, each marked with a
  yellow ring + "AI" chip.
- **Theme** — the header sun/moon toggles light ↔ dark.

## Tweaks (toolbar → Tweaks)
- **AI accent** — Orange (brand) / Blue / Violet / Teal. Remaps the action color *and* the
  Atlas radar gradient.
- **Editorial serif greeting** — toggles Newsreader on the Atlas greeting/headers.
- **Message bubbles** — filled / soft / outline.
- **Approval card** — standard / bordered / compact.
- **Mode toggle** — segmented / pills / icons.
- **Dark mode**.

## Files
| File | Component(s) |
|---|---|
| `index.html` | App shell, layout, Tweaks wiring, accent presets. |
| `kit.css` | Base reset, scrollbars, keyframes (radar ping, thinking dots, spinner, auto-fill ring, entrances), hover/press helpers. |
| `Icon.jsx` | `Icon` (Lucide wrapper) + `AtlasMark` (radar/sonar avatar). |
| `Header.jsx` | Top app bar — EXL lockup, Insights/Sales, agent controls, dialer & theme toggles. |
| `LeadBoard.jsx` | Lead Management context — pipeline stats, `LeadCard`, lead data. |
| `Dialer.jsx` | Softphone — number field, keypad, Call + connecting spinner. |
| `AtlasChat.jsx` | `ModeToggle`, `Greeting`, `ContinuingBanner`, `UserBubble`, `AiMessage`, `ThinkingDots`, `ToolTrace`, `ApprovalCard` (all variation-aware). |
| `CopilotPanel.jsx` | Panel header, `AtlasConversation` state machine, `Composer`, the dialer/chat split. |
| `NewLeadForm.jsx` | Modal lead form with the AI auto-fill ring + chip demo. |
| `tweaks-panel.jsx` | Tweaks shell (starter component). |

## Notes
- These are cosmetic recreations — the chat responses are scripted, not a real model.
- Component scope is shared via `Object.assign(window, …)` at the end of each JSX file;
  `index.html` destructures from `window`. Keep each file's style object uniquely named.
- The Atlas mark is the **radar** direction (chosen over monogram / compass / bloom).
