# CALL-E Showcase — Build Instructions

Single-page, **frontend-only** demo app for the CALL-E hackathon
(https://call-e.devpost.com/, deadline Sep 14 2026). It showcases telephony +
AI integration using the CALL-E Developer API: configure a persona, place a
real AI phone call, watch the transcript and structured results come back.
**No backend of our own. Nothing is saved anywhere.**

---

## Scope

One page, four capabilities:

1. **Telephony** — place a real outbound AI call through CALL-E to a phone
   number the user owns.
2. **Persona** — pick/edit the AI caller's persona (who it is, tone,
   instructions, goal). The persona composes the CALL-E `task` text and the
   `result_schema`.
3. **Training calls** — personas where CALL-E plays a difficult customer and
   *calls the user*, who practices handling it; the structured result is a
   mini scorecard of how the trainee did.
4. **Transcript** — after the call completes, render transcript turns as
   chat bubbles plus the structured JSON result, completion confidence, and
   evidence.

Out of scope: auth, database, saving calls, inbound numbers, live audio
streaming (CALL-E has none), anything server-side.

## Hard constraints

- **Frontend only.** No Express, no functions, no storage. All state lives
  in React memory and dies on refresh.
- **Bring-your-own-key.** CALL-E API keys are server-side by policy, so the
  page asks the user to paste their key at runtime. Keep it in component
  state only — never localStorage, never logged, masked in the input.
- **CORS workaround without a backend:** Vite dev-server proxy
  `/calle-api/*` → `https://api.heycall-e.com/*`. The proxy is dev tooling,
  not a backend. Make the base path configurable in case direct calls work.
- **Demo mode** (default ON until a key is entered): a simulated call
  lifecycle with a scripted transcript that streams in, so the page is fully
  demoable with zero credits and before API access is approved. Real mode
  and demo mode must render through the same components.
- **Safety:** only call numbers you own/are authorized to call. Placeholder
  numbers in UI copy must be obviously fake (`+1 555 …`). Show a short
  consent note near the dial button. There is **no cancel API** — say so in
  the UI once a call is created.

## Stack

Vite + React 19 + TypeScript + Tailwind CSS 4 (`@tailwindcss/vite` plugin).
No other runtime dependencies. New standalone folder: `calle-showcase/`.

```
calle-showcase/
├─ package.json / vite.config.ts / tsconfig.json / index.html
└─ src/
   ├─ main.tsx, index.css        (Tailwind import)
   ├─ App.tsx                    (page layout + state)
   ├─ lib/types.ts               (CallTask subset mirrored from OpenAPI)
   ├─ lib/calle.ts               (fetch client: createCall/getCall/poll)
   ├─ lib/demo.ts                (simulated call driver, same shapes)
   └─ lib/personas.ts            (preset definitions)
```

## CALL-E API integration (from openapi 0.6.0)

- Base: `https://api.heycall-e.com` (via `/calle-api` proxy in dev).
- Auth: `Authorization: Bearer <key>`.
- `POST /v1/calls` with `Idempotency-Key` header — derive it from a stable
  string (`showcase-<personaId>-<phone>-<counter>`), not a random UUID.
  Body: `{ task, recipients: [{ phones: [e164], region: 'US', locale:
  'en-US' }], result_schema, metadata: { source: 'calle-showcase' } }`.
- `GET /v1/calls/{id}` — poll every 3–5 s until `status` is terminal
  (`completed | failed | canceled`). Statuses: `queued → in_progress →`
  terminal. Attempt statuses include `dialing` — surface it if present.
- Transcript: `recipients[0].attempts[last].transcript_turns[]` =
  `{ offset_seconds, speaker: 'bot'|'user'|'unknown', text }`. Only
  available at terminal state — the UI must message "transcript arrives
  when the call ends" during `in_progress`.
- Read from the terminal task: `structured_result`, `summary`,
  `completion_confidence {score,label}`, `evidence[]`, `failure_code/message`.
- Error envelope: `{ error: { code, message } }` — surface `code` values
  like `insufficient_balance`, `unsupported_region`, `invalid_phone`
  as friendly banners.
- Result schemas: objects with `type/properties/required/enum` and
  `additionalProperties: false` only. Prefer string enums including
  `"unknown"` over booleans.

## Persona presets (4)

Each preset = `{ id, name, emoji, category: 'outreach'|'training',
description, defaultInstructions, buildTask(phone, instructions),
resultSchema }`. Instructions textarea is editable; task preview updates
live so judges can see prompt → call linkage.

1. **Callback Concierge** (outreach) — calls the number, confirms interest
   in a callback, collects preferred time.
   Schema: `{ wants_callback: yes|no|unknown, preferred_time: string,
   notes: string }`.
2. **Lead Qualifier** (outreach) — brief product pitch, gauges interest.
   Schema mirrors CALL-E's own salesHandoff example:
   `{ interest_level: strong|moderate|low|not_interested|unknown,
   human_assistance_requested: yes|no|unknown,
   handoff_recommended: yes|no|unknown, evidence_summary: string }`.
3. **Training: Frustrated Customer "Gloria"** (training) — CALL-E plays a
   69-year-old angry about prescription costs and vents first; the person
   answering is a trainee. Task instructs: stay in character, escalate if
   interrupted, soften only after genuine empathy.
   Scorecard schema: `{ empathy_shown, acknowledged_concern,
   offered_next_step: yes|no|unknown each, trainee_feedback: string }`.
4. **Training: Skeptical Shopper** (training) — compares everything to a
   competitor, raises three objections, ends undecided.
   Scorecard: `{ objections_answered: all|some|none|unknown,
   stayed_calm: yes|no|unknown, closing_attempted: yes|no|unknown,
   trainee_feedback: string }`.

## Page layout (single route, dark theme, demo-video friendly)

- **Header:** app name + "powered by CALL-E" + demo/live mode pill.
- **Left column — setup:** API key input (password field, memory only),
  phone number input (E.164 with inline validation), persona preset cards
  (click to select), instructions editor + live task preview, dial button.
- **Right column — the call:** status timeline chips
  (queued → dialing → in progress → done) with elapsed timer; transcript as
  chat bubbles (bot left, user right, offset timestamps); below it the
  structured-result card (pretty key/value, enum values as colored chips),
  confidence badge (score+label), evidence list, summary line.
- Empty state before any call: one-line explainer of the flow.
- Errors: dismissible banner with the CALL-E error code and hint.

## Demo mode details

`lib/demo.ts` drives the same `CallTask` shape through
queued → dialing → in_progress (transcript turns pushed every ~1.5 s so the
video shows movement) → completed with a believable structured result for
whichever persona is selected. One scripted conversation per persona.

## Verification

1. `npm install && npm run build` — clean TypeScript + Vite build.
2. `npm run dev` → page loads, demo-mode call runs end to end for each of
   the 4 personas: status chips advance, transcript streams, scorecard
   renders.
3. With a real key: Callback Concierge to your own phone; confirm real
   transcript + structured result render; confirm error banner shows a
   fake-key 401 and an `invalid_phone` rejection.

## Hackathon packaging (later, separate task)

- Entry is a **PR to CALLE-AI/awesome-phone-call-agents** under `apps/`
  using their template: README with setup/usage/side-effects, masked
  numbers, tests, no secrets, `python3 scripts/validate_repository.py`
  passing.
- ~3-minute public video (YouTube/Vimeo). Demo the live persona → call →
  transcript loop on a real phone in the shot.
- CALL-E must be called at runtime in the submission — demo mode is a dev
  convenience, not the submission path.
