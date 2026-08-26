# TechSales API

Backend for a **Medicare tele-sales agent console** — a proof of concept that puts AI
directly into a live sales call.

It is a Node.js + Express + Mongoose API that handles the ordinary CRUD a sales floor needs
(leads, members, enrollments, users, targets), and then layers live-call AI on top of it:
Twilio telephony, Deepgram transcription and voice agents, a LangChain tool-calling copilot,
real-time compliance and coaching detection, supervisor QA scoring, and per-call cost
attribution.

> **Status: proof of concept.** This is demo software. It has **no real authentication** —
> see [Security posture](#security-posture) before exposing it anywhere.

The React frontend that consumes this API lives in a separate repository. The two are
coupled only over HTTP and WebSockets — there are no shared build artifacts, and the
TypeScript types are deliberately duplicated on both sides.

---

## What's in here

| Area | What it does |
|---|---|
| **CRUD API** | Leads, members, enrollments, users, roles, departments, targets, compliance/coaching rules, QA rubric |
| **Atlas copilot** | An agentic assistant over the sales data. Reads execute directly; **writes come back as proposals** a human approves before they run |
| **Live call pipeline** | Twilio media stream → Deepgram transcription → analysis agent → SSE to the console, joined in-process by a pub/sub bus |
| **Training simulator** | A Deepgram Voice Agent plays a prospect so agents can rehearse against a synthetic customer |
| **Call screening** | A voice agent answers inbound calls on the rep's behalf until they take over |
| **Supervisor QA** | Rubric-scored review of completed calls |
| **Cost attribution** | Per-user and per-day token/minute budgets across the LLM, Twilio, and Deepgram spend |

### Three interchangeable data backends

One probe at boot picks `mongo`, `json`, or `databricks` and **locks it for the process
lifetime** — there is no per-request fallback. Every entity has three repository
implementations behind a common interface (`src/repositories/{mongo,json,databricks}/`).

`DATA_BACKEND=json` serves the bundled JSON store and needs **no external services at all**,
which is the fastest way to see the API working.

---

## Quickstart

Requires **Node.js 20+**.

```bash
npm install
cp .env.example .env
```

Then edit `.env`. To run with no external dependencies:

```
DATA_BACKEND=json
MONGO_URI=mongodb://<MONGO_HOST>:27017/?directConnection=true
AI_ENABLED=false
TWILIO_ENABLED=false
```

`MONGO_URI` is required by the config schema even in `json` mode — the placeholder above is
fine, it is never dialled.

```bash
npm run dev          # tsx watch on :4000
curl http://localhost:4000/api/health
```

On first boot the app copies `data/sample/*` into `data/runtime/` and `data/lookup/`, so the
JSON store arrives pre-seeded with synthetic leads, members, and plans.

### With MongoDB

Set `DATA_BACKEND=mongo` and a reachable `MONGO_URI`, then:

```bash
npm run seed -- --reset    # drop both DBs, insert data/sample/*, create indexes
```

Mongo URIs need `?directConnection=true` when the replica set advertises a hostname the
client can't resolve — see the note in `.env.example`.

### With Docker

```bash
docker build -t techsales-api .
docker run --rm -p 4000:4000 --env-file .env techsales-api
```

---

## Configuration

All configuration is environment variables, validated by a zod schema at boot
(`src/config/env.ts`) — an invalid or incomplete config **exits the process with a readable
message** rather than failing later at request time.

[`.env.example`](.env.example) documents every variable. Nothing is hardcoded and no
credentials ship in this repo.

The feature switches worth knowing:

| Variable | Effect |
|---|---|
| `DATA_BACKEND` | `mongo` \| `json` \| `databricks` — decided once at boot |
| `AI_ENABLED` | Off → `/api/ai/*` returns 501 |
| `ATLAS_ENABLED` | Off → `/api/ai/atlas/*` returns 501 (independent of `AI_ENABLED`) |
| `AI_LLM_PROVIDER` | `ollama` (local, free) \| `anthropic` \| `stub` |
| `TWILIO_ENABLED` | Off → telephony routes refuse to serve TwiML. On → asserts all Twilio + Deepgram keys are present at boot |
| `SIMULATOR_ENABLED` / `SCREENING_ENABLED` | Voice-agent features; each also requires its key to be set |

Note that the simulator and screening personas run their LLM **inside Deepgram's cloud**
(`SIMULATOR_THINK_MODEL`), not through `AI_LLM_PROVIDER` — so they keep working when the
app's own LLM provider is down, and an unsupported model id is rejected by Deepgram at
session setup rather than by this code.

---

## API surface

Everything is mounted under `/api`. Responses are uniformly
`ServiceResponse<T> = { success, data?, error?, message? }`, with paginated payloads nested
inside `data`.

```
/api/health          /api/auth            /api/leads         /api/users
/api/roles           /api/departments     /api/enrollments   /api/members
/api/targets         /api/compliance-rules  /api/coaching-rules  /api/qa-rubric
/api/simulator       /api/screening       /api/ai            /api/twilio
/api/presence
```

WebSocket endpoints — a **single** `upgrade` listener routes by pathname
(`src/ws/attachWs.ts`):

```
/ws/twilio-media     /ws/simulator      /ws/screening
```

Lookup reference data (plans, drugs, pharmacies, providers, ZIP/county) is **not** served
over HTTP — it is read from `data/lookup/` by the AI tools directly.

See [`INSTRUCTIONS.md`](INSTRUCTIONS.md) for the full endpoint reference, seeding and reset
procedures, and troubleshooting.

---

## Repository layout

```
src/
├── ai/              LangChain agents, tools, prompts, QA, simulator, screening, vector store
├── config/          env.ts (zod schema — the config source of truth), mongo.ts, logger.ts
├── controllers/     Express handlers; wrap repositories into ServiceResponse<T>
├── middleware/      error handling, request logging, rate limiting, token and
│                    call-minute caps, Twilio signature verification
├── models/          Mongoose schemas
├── repositories/    mongo/ | json/ | databricks/ — one implementation each per entity
├── routes/          one file per resource, mounted in routes/index.ts
├── scripts/         seed, drop, build-vector-index, build-formulary
├── services/        cross-cutting logic incl. Atlas proposal executors
├── types/           wire types (duplicated in the frontend by design)
├── utils/           bootstrap (sample → runtime copy), search, phone helpers
└── ws/              attachWs.ts + the three socket servers

data/
├── sample/          committed synthetic seed data — the bootstrap source
├── formulary-synthetic.json
└── runtime/, lookup/   generated at boot, gitignored

docs/                design and migration documents (see below)
scripts/databricks/  schema init + Mongo → Databricks migration
scripts-debug/       standalone verification scripts
```

---

## Data

All bundled data is **synthetic**. Carriers are named `Carrier1` / `Carrier2`, phone numbers
are in the reserved `555` range, and names, addresses, and member identifiers are fabricated.
No real carrier names and no real customer data appear anywhere in this repository.

---

## Security posture

This is a proof of concept, and its auth model reflects that:

- **`POST /api/auth/login` ignores the password entirely.**
- **`GET /api/users` enumerates users unauthenticated.**
- `/api/_debug/*` is mounted whenever `NODE_ENV !== 'production'`.

Twilio webhooks *are* signature-verified (`X-Twilio-Signature`), and the dev bypass for that
is asserted off when `NODE_ENV=production`.

Treat any public deployment as a decision to be made deliberately, not a default. Put real
authentication in front of this before it holds anything that matters.

No credentials are committed to this repository. `.env` is gitignored; supply secrets through
the environment.

---

## Documentation

| File | Covers |
|---|---|
| [`INSTRUCTIONS.md`](INSTRUCTIONS.md) | Run/seed/reset procedures, endpoint reference, troubleshooting |
| [`docs/MONGODB_BACKEND_PLAN.md`](docs/MONGODB_BACKEND_PLAN.md) | Backend architecture, rationale, risks |
| [`docs/AI_BACKEND_PLAN.md`](docs/AI_BACKEND_PLAN.md) | LangChain / Qdrant / LLM pipeline design |
| [`docs/BACKEND_VM_SETUP.md`](docs/BACKEND_VM_SETUP.md) | Running the API and MongoDB on a VM |
| [`docs/DATABRICKS_MIGRATION_PLAN.md`](docs/DATABRICKS_MIGRATION_PLAN.md), [`docs/DATABRICKS_DEPLOYMENT_GUIDE.md`](docs/DATABRICKS_DEPLOYMENT_GUIDE.md) | Delta-table data layer |
| [`docs/architecture-option-a-databricks-vector-search.md`](docs/architecture-option-a-databricks-vector-search.md), [`docs/architecture-option-b-qdrant-vector-db.md`](docs/architecture-option-b-qdrant-vector-db.md) | Vector-store trade-off analysis |

These were written per-phase during development and can lag the code — verify specifics
against source before relying on them.

---

## Known gaps

- **No test framework.** There is no `test` script and no vitest/jest configuration. Verify
  changes by running the app or hitting the API.
- **`npm run lint` does not work** — the package has no `eslint.config.js`, so ESLint 9
  exits with a config-not-found error. Pre-existing.
- Plan search needs a reachable Qdrant. Because the BM25 corpus is itself built by scrolling
  payloads out of Qdrant, an unreachable Qdrant disables **both** halves of hybrid search,
  and the only signal is a pair of warning logs.
