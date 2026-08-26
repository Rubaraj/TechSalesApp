# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Medicare tele-sales POC: a React agent console (`techsales-app/`) and an Express API
(`techsales-api/`) that adds live-call AI — Twilio telephony, Deepgram transcription and
voice agents, a LangChain tool-calling copilot ("Atlas"), compliance/coaching detection,
supervisor QA, and cost attribution. There is no root `package.json`; the two packages are
installed and run independently.

## Commands

```powershell
# Backend (:4000) — start this first, the FE dev proxy targets it
cd techsales-api;  npm install;  npm run dev

# Frontend (:5173)
cd techsales-app;  npm install;  npm run dev
```

| Task | Command |
|---|---|
| Build API | `cd techsales-api; npm run build` (tsc → `dist/`), `npm start` to run it |
| Build FE | `cd techsales-app; npm run build` (`tsc -b && vite build`) |
| Lint FE | `cd techsales-app; npm run lint` |
| Seed Mongo | `npm run transform-data` then `npm run seed -- --reset` (see `techsales-api/INSTRUCTIONS.md` §4) |
| Reset JSON store | `npm run drop-runtime` |
| Doc counts on the Pi | `npm run verify-counts` |
| Rebuild the Qdrant index | `npm run index:build` (`index:reset` to drop first) |
| Rebuild synthetic formulary | `npm run formulary:build` |
| Carrier-name guard | `node scripts/check-no-real-carriers.mjs` (also `npm run check:carriers` in either package) |
| Deploy API + gateway to the Pi | `powershell -File scripts/deploy-api-to-pi.ps1` |
| Deploy the built FE to the Pi | `powershell -File scripts/deploy-app-to-pi.ps1` |
| Publish the API to the public mirror | `powershell -File scripts/publish-api-mirror.ps1` (`-DryRun` to preview) |

**There is no test framework in this repo** — no `test` script, no vitest/jest, and
`techsales-api/src/repositories/databricks/__tests__/` is empty. Don't invent test commands;
verify changes by running the app or hitting the API.

**`npm run lint` in `techsales-api` is broken** and always has been — there is no
`eslint.config.js` in that package, so ESLint 9 exits with "couldn't find eslint.config.js".
Pre-existing; don't treat it as breakage you caused.

### `techsales-api` is also published to a PUBLIC mirror

`techsales-api/` is mirrored to **github.com/Rubaraj/TechSalesAPI (public)** for sharing.
This repo is the source of truth; the mirror is one-way and is never edited directly.
`scripts/publish-api-mirror.ps1` rebuilds it from `git archive HEAD techsales-api` (tracked
files only, so `.env` cannot leak), overlays `publish/api-mirror/overlay/`, applies
`publish/api-mirror/transform.mjs`, and gates on no-secrets / no-internal-hosts / clean
build before pushing.

Two consequences when editing `techsales-api/`:

- **Anything you commit under `techsales-api/` is publishable.** No LAN IPs, no
  `rubarajan.dev`, no SSH usernames, no real keys — the gates will block the publish, but
  the value is already in this repo's history by then.
- **`transform.mjs` fails loudly if its exact-match edits stop matching.** If you rename
  something it patches (the `transform-data` script, the sample-dir error messages, the
  `INSTRUCTIONS.md` header), update the transform in the same change.

The mirror deliberately drops `check:carriers` and `transform-data` — both target paths
outside the package — so `data/sample/` must be verified with `npm run check:carriers`
*here* before publishing.

### Deployment topology (production is a Raspberry Pi)

`cloudflared` → Caddy `:8081` → `handle_path /techsales/*` strips the prefix →
Express `:4000`. So the public API is `https://api.rubarajan.dev/techsales/api/...` and
`wss://api.rubarajan.dev/techsales/ws/...`, while Express itself sees unprefixed routes.
The built frontend is served by a separate nginx vhost on `127.0.0.1:8091` at
`https://demotechsales.rubarajan.dev`, and reaches the API cross-origin (see `CORS_ORIGIN`).

`deploy-api-to-pi.ps1` ships `git archive HEAD` — **commit before deploying or your change
won't ship.** `deploy-app-to-pi.ps1` ships the working tree instead (a frontend build is
reproducible). The Pi's `/opt/techsales-api/.env` is canonical for production and is never
overwritten by either script; new env keys must be added there by hand.

## Architecture

### Two independent "which data source?" switches — don't conflate them

**Backend**: one probe at boot decides `mongo` | `json` | `databricks` and **locks it for the
process lifetime** — no heartbeat, no per-request fallback (`src/config/mongo.ts` →
`initRegistry()` in `src/repositories/registry.ts`). If Mongo dies after boot, requests 5xx
until you restart. Resolution order is `DATA_BACKEND`, else legacy `FORCE_JSON`
(`getDataBackend()` in `config/env.ts` is the only correct way to read it).

Every entity therefore has **three** repository implementations —
`repositories/{mongo,json,databricks}/<Entity>Repository.ts` — plus a `build<Entity>Repo`
switch and a `Repos` field in `registry.ts`. Adding an entity means all five edits; the
`default: never` in each switch will tell you if you missed one.

**Frontend**: `getMode()` (`src/api/mode.ts`) returns `'api'` | `'local'`, decided once by
`AuthContext.login()` and stored in sessionStorage. Services branch on it individually —
`'local'` means the FE serves bundled JSON from `src/data/` and never calls the backend.

### Lookup data does not come from the API

`/api/plans`, `/api/drugs`, `/api/pharmacies`, `/api/providers`, `/api/zip-state-county`
**do not exist** (see `routes/index.ts`). The FE always imports those from
`src/data/lookup/*.json` regardless of mode (`planService.ts` is the pattern). Only
`medhub_app` entities — leads, users, roles, departments, enrollments, members, targets,
rules, rubric, personas, calls — go over HTTP. The API's own copies live in
`techsales-api/data/lookup/` and are what the AI tools read.

### Capability flags ride in sessionStorage — the classic bug

`/api/health` returns `{ mode, aiEnabled, aiProvider, twilioEnabled }`; login mirrors those
into sessionStorage, and `useAiEnabled()` / `useTwilioEnabled()` gate whole features on them.
Auth itself lives in **localStorage**. Consequence: **a second browser tab is logged in but
has no capability flags, so the AI copilot and dialer silently disappear.** Same silent
disappearance is the symptom of a failed cross-origin `/health` probe — `probeBackendMode()`
returns all-false on any error rather than throwing. If AI UI is "missing", check the probe
before debugging components.

### Types are duplicated on purpose

`techsales-api/src/types/` and `techsales-app/src/types/` are separate copies of `Lead`,
`User`, `Plan`, call wire types, etc. A field rename must land on both sides in the same
change. Every API response is `ServiceResponse<T> = { success, data?, error?, message? }`,
with paginated payloads nested inside `data`.

### AI subsystem (`techsales-api/src/ai/`)

- **Tools** are LangChain `tool()` instances, one per file in `ai/tools/`, exported from
  `ai/tools/index.ts`. A new tool must be appended there **and** registered in the agent that
  should be able to call it. `atlasTools` order is part of the prompt-cache prefix — reordering
  invalidates the cache for in-flight sessions, so don't shuffle it casually.
- **Atlas** is the agentic copilot: `POST /api/ai/atlas/chat` streams SSE whose event union is
  defined in `techsales-app/src/services/atlasService.ts`. The text payload field is
  `content` and the terminal event type is `final` (not `text`/`token`). Reads execute
  directly; writes come back as *proposals* the agent approves via
  `POST /api/ai/atlas/approvals/:proposalId` (executors in `services/proposalExecutors.ts`).
  Caller identity is injected server-side — tools never trust a client-supplied actor.
- **Provider switch**: `AI_LLM_PROVIDER` is `ollama` | `anthropic` | `stub`, dispatched by
  `ai/llm/chatModel.ts`. `ANTHROPIC_BASE_URL` can point the Anthropic client at a compatible
  gateway (production uses OpenRouter).
- **The Deepgram Voice Agent think model is not on that switch.** The training simulator and
  call screening personas run their LLM inside Deepgram's cloud (`SIMULATOR_THINK_MODEL`), so
  they keep working when the app's own LLM provider is down — and conversely, an off-list
  model or voice id is rejected by Deepgram at session setup, not by us.
- **Qdrant does not run on the Pi.** Production's `QDRANT_URL` points back at the dev laptop
  (`192.168.0.113:6333`, the `medhub-qdrant` Docker container); embeddings come from Ollama on
  the Pi's own localhost. Worse, the BM25 corpus is itself built by scrolling payloads *out of*
  Qdrant (`hybridRetriever.ts` → `loadCorpus`), so an unreachable Qdrant kills **both** halves
  of hybrid search — `search_plans` returns nothing and the only signal is a pair of `warn`
  logs ("Qdrant vector search failed; using BM25 only" / "BM25 search failed; using vector
  only"). If plan search goes quiet, check the laptop's Docker before reading any other code.
- Voice ids are validated against `CURATED_VOICES` in `ai/simulator/personas.ts`
  (`isCuratedVoice()`); anything else is refused at save time. Do not add ids without probing
  them against Deepgram's TTS API first — fabricated `aura-2-*` names look plausible and fail
  only at call time.

### Real-time paths

`ws/attachWs.ts` installs **exactly one** `upgrade` listener and routes by pathname to
`/ws/twilio-media`, `/ws/simulator`, `/ws/screening`. Per-module upgrade listeners destroy
each other's sockets — never add a second one. Each socket server is created only when its
feature switch is on (`simulatorEnabled()`, `screeningEnabled()` in `config/env.ts`; these
combine a flag with the presence of the required key, so read the helper, not the raw var).

The FE derives the WebSocket URL from `API_BASE` (`services/simulatorService.ts`), not from
`window.location` — so an absolute `VITE_API_BASE_URL` is what makes the simulator work on a
static host. `vite.config.ts` proxies both `/api` and `/ws` in dev (`ws: true` is required).

`callBus.ts` is the in-process pub/sub that joins the Twilio media stream, the analysis agent,
and the SSE bridge for one call; `ARCHITECTURE.md` §"Live call data-flow" traces it end to end
and §"Key invariants & contracts" lists the non-obvious rules (direction-aware speaker
mapping, empty-only AI form fills, append-don't-replace notes, agent stop() ordering).

## Constraints

- **Never commit or echo `SSHDetails.md` or `TechSales.config`.** Both are gitignored and hold
  live credentials (Pi SSH password; Twilio SID + auth token, API key secret, Deepgram key).
  The deploy scripts read them; nothing else should print them.
- **No real carrier names** in `techsales-app/src`, `techsales-app/public`,
  `techsales-api/data/sample`, or `techsales-api/src/ai/{prompts,agents}`. The guard regex
  covers aetna, humana, cigna, unitedhealthcare/uhc, bcbs, blue cross, anthem, wellcare, aarp.
  Seed data uses `Carrier1`/`Carrier2`; run `check:carriers` after touching sample data or prompts.
- **This POC has no real auth**: `POST /api/auth/login` ignores the password entirely and
  `/api/users` enumerates users unauthenticated. `/api/_debug/*` is mounted whenever
  `NODE_ENV !== 'production'` — the Pi sets `NODE_ENV=production`, so the debug routes are off
  there and on in local dev. Treat any public exposure as a decision to be raised, not assumed.
- Mongo URIs need `?directConnection=true` — the Pi's `rs.conf()` advertises an unresolvable
  hostname and SDAM discovery will fail without it.

## Reference docs

Prefer these over re-deriving; several were written per-phase and can lag the code, so verify
specifics against source before relying on them.

| File | Covers |
|---|---|
| `ARCHITECTURE.md` | System diagram, live-call pipeline, invariants table, phase history |
| `techsales-api/INSTRUCTIONS.md` | Run/seed/reset procedures, endpoint reference, troubleshooting |
| `techsales-app/DEVELOPER_GUIDE.md`, `APPLICATION_GUIDE.md` | FE component/service patterns, theming, RBAC, routing map |
| `SALES_IQ_COPILOT.md`, `CALL_COPILOT_IMPLEMENTATION.md`, `QA_SUPERVISOR_PLAN.md` | Design intent for Atlas, the call copilot, and supervisor QA |
| `DemoScript.md`, `DEMO_GUIDE.md` | Verified demo walkthroughs with real record ids |
| `BACKEND_VM_SETUP.md`, `FRONTEND_VM_SETUP.md`, `gateway/README.md` | Hosting and gateway setup |
