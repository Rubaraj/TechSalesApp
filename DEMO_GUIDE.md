# TechSalesApp POC — Demo Guide

Three showcase pillars:

1. **Autonomous Call QA Agent** — every call auto-recorded, tagged, and
   flagged; on-demand LLM scorecard.
2. **Ambient Supervisor CoPilot** — live supervision feed + editable
   compliance rules.
3. **Co-Pilot for Agent on Call** — live transcript, compliance alerts,
   emotion, coaching, entity autofill, Medicare info cards, and Atlas with
   live-call awareness.

---

## 0. Pre-demo checklist (10 minutes before)

| Check | How |
|---|---|
| OpenRouter VM is ON | `curl https://openrouter.ai/api/v1/key -H "Authorization: Bearer <key from techsales-api/.env>"` → must return `data`, not 401. **Without it**: no Atlas chat, no QA review, no emotion, only canned coaching. |
| API healthy | `https://api.rubarajan.dev/techsales/api/health` → `success: true` |
| FE points at the Pi | `techsales-app/.env.local` has `VITE_API_BASE_URL=https://api.rubarajan.dev/techsales/api` **uncommented**. Wrong/local backend = no live transcript (amber banner will say so). |
| Two browser sessions | Window A: agent login (**johndoe11** / USER-002). Window B (incognito or another browser): admin login (USER-001) on **Admin → Supervision**. |
| Demo data present | Supervision call log shows `DEMO-JD-1…4` for John Doe. |
| Phone ready | The verified number **+1 959-248-0333** (trial account can only dial verified numbers). Inbound demo: call **+1 888-668-1840** from it. |

Login credentials: see `LOGIN_CREDENTIALS.md`.

---

## 1. Pillar 3 — Agent Co-Pilot (live call, ~4 min)

Setup: agent window on **/leads/new** (so autofill is visible), Atlas panel
open, admin window on Supervision. Dial the verified number; speak agent
lines into the laptop mic, prospect lines into the phone. Pause 2–3s
between lines.

### Beat-by-beat script (what to say → what appears)

| Say | Surface that reacts |
|---|---|
| PROSPECT: "I live in Miami, my zip code is 33101." | LeadForm zip fills with yellow flash + "AI" chip; entity chip in EntitySummary |
| PROSPECT: "I take Eliquis five milligrams twice a day." | Drug added to the lead's tagged drugs + activity row in Atlas |
| AGENT: "You might qualify for a **CSNP** — a chronic special needs plan." | Blue **Medicare info card** in the call panel explaining CSNP, with a "View CSNP plans in 33101" link |
| PROSPECT: "Wait, I don't understand any of this. This is really confusing." (2 lines) | **Emotion badge** → amber `confused` (agent header + admin live card); coaching tip |
| AGENT: "This plan is **completely free** and **guaranteed** to cover everything." | Two **critical** (red) compliance alerts + instant rule tip, then richer AI coach tip ~2s later. Admin's alert feed fires live. |
| AGENT: "It's a **special deal**, **act now**." | **warn** (amber) alert — the phrase "special deal" was added via the rules editor (proves live rule editing) |
| Ask **Atlas**: "What did the prospect just say?" or "Draft one sentence to calm her down." | Atlas answers **quoting the live transcript** (live-call context) |
| AGENT recovery: "I apologize — precisely: $0 premium, but there are copays I'll itemize in writing. Thursday at 2 PM?" | Good QA material |
| Hang up | Post-call **note summary** appears in the Atlas activity trail (survives call end) |

### Extra trigger vocabulary (info cards — say the term, card appears once per call)
CSNP, DSNP, ISNP, PDP, HMO, PPO, Medigap / "medicare supplement",
"annual enrollment period" (AEP), "special enrollment period" (SEP),
"extra help" / "low income subsidy" (LIS), IRMAA, Part A, Part B, Part D,
MBI, "scope of appointment" (SOA), "star rating".

### Seeded compliance phrases (severity)
- **critical**: "guaranteed", "it's/this is/completely free", health-status
  questions ("do you have diabetes")
- **warn**: "the best plan", "you must enroll", "better than Medicare",
  "everyone chooses this", "act now" / "hurry" / "special deal"

Atlas quick hits (any time): "show my pipeline", "compare plans for zip
33101", "is <lead> dual eligible?", "mark <lead> as contacted" (→ approval
card — human-in-the-loop story).

## 2. Pillar 2 — Ambient Supervisor CoPilot (~2 min)

In the admin window during the pillar-3 call:
1. **Live section**: active-call card (agent name, direction, ticking
   duration, emotion chip changing live) + compliance alerts streaming in.
2. Click an alert → jumps to the call detail (after hangup) with the full
   transcript and inline tag markers (compliance/emotion/coaching).
3. **Rules editor** (Admin → Compliance Rules): edit a rule live — add a
   phrase, flip severity, disable a rule — next call obeys it. This is the
   "supervisors control the AI" moment.
4. QA stat strip above the call log: totals, flagged %, reviewed, avg score.

## 3. Pillar 1 — Autonomous Call QA (~2 min)

1. Supervision call log: every call auto-recorded + tagged; flagged ones
   badged (auto-queue). Open **DEMO-JD-2** (the bad call: 4 violations,
   frustrated prospect) → **Run QA review** → scorecard: overall + four
   dimensions with evidence + coaching points + disclosure checklist.
2. Contrast with **DEMO-JD-1** (clean discovery call) → high score.
3. Same engine from Atlas (admin): *"show John Doe's flagged calls"*,
   *"run a QA review on the worst one"* → scorecard card in chat.
4. Point out `/api/ai/stats`-backed audit: every LLM call logged with
   token counts (kinds: atlas, call_qa, call_emotion, call_coaching).

## 4. If things go wrong mid-demo

| Symptom | Cause | Recovery |
|---|---|---|
| Atlas/QA/emotion return errors ("401 User not found") | OpenRouter VM off | Start the VM. Meanwhile: transcript, compliance alerts, instant coaching tips, autofill, info cards ALL still work (rule-based) — continue pillar-3, defer QA. |
| No transcript + amber banner | FE pointed at wrong backend | Fix `.env.local` → `api.rubarajan.dev`, reload, re-dial. |
| Inbound says "not available" | Agent presence lapsed | Make sure the agent window is open/logged in; wait ~30s or reload it. |
| Call log missing the just-ended call | (fixed) refresh icon | Click refresh on the call log. |

Ops: `journalctl -u techsales-api -f` on the Pi tails everything;
`scripts/deploy-api-to-pi.ps1` redeploys committed backend code.

## 5. Reset for a clean run
- Demo call records persist (good — history tells the story). To re-seed
  more John Doe data, replay via the laptop dev API (`NODE_ENV` dev only):
  `POST /api/_debug/inject-transcript` + `/stop-call`.
- New chat: Atlas panel → new-chat button (session per user persists
  otherwise).
