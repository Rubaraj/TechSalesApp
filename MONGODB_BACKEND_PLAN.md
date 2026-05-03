# Medicare Hub — Node + MongoDB Backend with Dual-Mode Resilience

> **Purpose:** Implementation instructions for adding a Node.js + MongoDB backend (hosted on a Raspberry Pi) to the existing React frontend, with transparent JSON fallback, two logically separated databases (lookup vs. app), and a sanitized sample dataset (no real carrier names).
> **Status:** Plan — not yet executed.
> **Owner:** Rubarajan
> **Last Updated:** 2026-05-01

---

## Context

The Medicare Hub frontend (`techsales-app/`) currently uses bundled JSON files as its database. All 12 services in `src/services/` import JSON directly and mutate module-level arrays — every change made during a session is lost on refresh. This blocks the v1+ roadmap: persistent data, multi-user concurrency, audit trails, and (later) an AI layer.

This plan adds a Node.js + MongoDB backend that the frontend talks to over HTTP. Three goals shape the design:

1. **Dual-mode resilience, decided once.** At backend startup, ONE connection attempt to MongoDB decides the mode for the backend's lifetime — Mongo if connected, JSON file store otherwise. At login, ONE check decides the frontend's session mode — API if reachable, bundled JSON otherwise. No per-request retries, no heartbeat, no mid-flight mode switching. Every page works in three modes — (Mongo + backend) / (no Mongo, backend up) / (no backend) — without component changes.
2. **Two physically separate databases.** `medhub_lookup` (read-only reference data) and `medhub_app` (user-generated runtime state) live on the same Mongo cluster but are independently dumpable/restorable. This makes "move the application to a new environment" a single `mongodump --db=medhub_app` away.
3. **Sanitized sample data.** No real insurance brand names anywhere — Aetna/Humana/UHC/Cigna/BCBS are remapped to `Carrier 1`–`Carrier 5` before any data leaves the JSON files.

AI features (RAG, "Explain My Plan", note summarization, next-best-action) are **deferred to a future phase**. The schema leaves room (`embedding?: number[]`, `aiInteractions` collection reserved) but no AI code lands in this scope.

Per the user requirement, **all DB connections go through the Node app** — the frontend never talks to MongoDB directly.

### Target deployment

| Concern | Value |
|---|---|
| Mongo host | Raspberry Pi at `192.168.0.175:27017` |
| Connection URI | `mongodb://192.168.0.175:27017/?directConnection=true` |
| Replica set | `rs0` (exists but bypassed via `directConnection=true` — see Phase 0 finding below) |
| **Phase 0 finding (2026-05-02)** | **The Pi's `rs.conf()` advertises hostname `mongodb` (not the LAN IP). Mongoose's SDAM cannot resolve it from the dev laptop, so the original `?replicaSet=rs0` URI failed with `getaddrinfo ENOTFOUND mongodb`. Resolved by switching to `?directConnection=true`, which talks to the URI host literally and skips topology discovery. Trade-off: no transactions, no change streams. Neither is used in current scope. To recover them later, fix `rs.conf()` on the Pi (`cfg.members[0].host = '192.168.0.175:27017'; rs.reconfig(cfg, {force:true})`).** |
| Auth | **None** (LAN-only, trusted network). Documented as dev-only; production must enable auth. |
| TLS | None |
| App DB | `medhub_app` |
| Lookup DB | `medhub_lookup` |
| **Backend host** | **Dev laptop (Windows), `localhost:4000`. Pi runs Mongo only. Vite proxies `/api` from `:5173` → `:4000` so no CORS in dev.** |

---

## 1. Repository Structure

**Decision: sibling `techsales-api/` at repo root.**

```
TechSalesApp/
  techsales-app/   # existing Vite frontend (unchanged structure)
  techsales-api/   # NEW Node backend (types live in techsales-api/src/types)
```

Rationale: cleanest separation, independent `node_modules` and tsconfigs, no Vite/Node ESM/CJS friction. (An earlier revision of the plan included a third sibling `shared/` package for `@medhub/shared` types meant to be consumed by both sides; the FE never wired up to it, so the types were consolidated into `techsales-api/src/types/` to remove the unused abstraction.)

### Backend layout (`techsales-api/`)

```
techsales-api/
  src/
    index.ts                      # bootstrap: connect both DBs → wire repos → start express
    config/
      env.ts                      # zod-validated process.env
      mongo.ts                    # two connections (app + lookup) + isMongoConnected()
    middleware/
      errorHandler.ts
      requestLogger.ts            # pino-http
      asyncHandler.ts
      validate.ts                 # zod request validator (Phase 6)
    routes/
      index.ts                    # mounts /api/* sub-routers
      health.routes.ts            # GET /api/health -> { mode, mongoUp, dbs: { app, lookup } }
      auth.routes.ts              # /login, /member-login
      lead.routes.ts              # app DB
      user.routes.ts              # app DB
      role.routes.ts              # app DB
      department.routes.ts        # app DB
      member.routes.ts            # app DB
      memberAppointment.routes.ts # app DB
      enrollment.routes.ts        # app DB
      target.routes.ts            # app DB
      plan.routes.ts              # lookup DB (plans + benefits + premiums + ratings)
      drug.routes.ts              # lookup DB
      pharmacy.routes.ts          # lookup DB
      provider.routes.ts          # lookup DB
      zip.routes.ts               # lookup DB
    controllers/                  # one per resource
    repositories/
      types.ts                    # IRepository<T>, IReadOnlyRepository<T>
      registry.ts                 # factory: picks Mongo vs JSON impl per resource
      mongo/                      # Mongo<Resource>Repository.ts (each binds to correct connection)
      json/
        Json<Resource>Repository.ts
        JsonStore.ts              # debounced atomic write helper
    models/                       # mongoose schemas, registered on appConn or lookupConn
    scripts/
      transform-sample-data.ts    # JSON in → JSON out, with carrier renaming
      seed.ts                     # JSON → Mongo (writes to both DBs), idempotent
      drop.ts                     # drop both databases
      createIndexes.ts            # idempotent index creation per collection
    data/
      sample/                     # carrier-sanitized output of transform script
        runtime/                  # → seeded into medhub_app
        lookup/                   # → seeded into medhub_lookup
      runtime/                    # JSON fallback (writes go here, not src/data)
      lookup/                     # JSON fallback (read-only)
    utils/
      ids.ts, paginate.ts, search.ts
  package.json
  tsconfig.json
  .env.example
  Dockerfile
  README.md                       # setup notes incl. Pi network requirements

```

---

## 2. Backend Tech Stack

| Concern | Choice | One-liner |
|---|---|---|
| Runtime | Node 20 LTS | Native fetch, stable ESM |
| Language | TypeScript 5.9 | Type parity with frontend |
| HTTP | **Express 5** | Lowest ceremony, vast ecosystem |
| DB driver | **Mongoose 8** | Schema validation; multi-connection support is first-class |
| Validation | zod | Reuse on both sides |
| Auth | **None (out of scope)** | LAN-only; "any password works" preserved |
| Security | helmet, cors, express-rate-limit | Basic hardening even without auth |
| Logging | pino + pino-http | JSON logs, low overhead |
| Env | dotenv + zod parse | Fail-fast on bad config |

**Hosting:** Raspberry Pi single-node MongoDB Community replica set (`rs0`). The replica set wrapper means transactions and change streams are available. No Atlas-specific features (Vector Search, $lookup-across-db on Community, change-stream charts) are used.

### `.env.example`

```
NODE_ENV=development
PORT=4000

# Mongo: same cluster URI for both DBs; separate dbName per logical database.
MONGO_URI=mongodb://192.168.0.175:27017/?directConnection=true
MONGO_APP_DB=medhub_app
MONGO_LOOKUP_DB=medhub_lookup
MONGO_CONNECT_TIMEOUT_MS=3000

# Toggles
FORCE_JSON=false       # if true, skips Mongo entirely and serves from JSON store
JSON_PERSIST=true      # if false, JSON repo is in-memory only

# CORS — comma-separated origins (e.g., http://localhost:5173)
CORS_ORIGIN=http://localhost:5173
```

### Mongo connection wiring (`techsales-api/src/config/mongo.ts`)

```ts
import mongoose, { Connection } from 'mongoose';
import { env } from './env';

export let appConn: Connection;
export let lookupConn: Connection;

export async function connectMongo(): Promise<{ ok: boolean; mode: 'mongo' | 'json' }> {
  try {
    appConn = await mongoose.createConnection(env.MONGO_URI, {
      dbName: env.MONGO_APP_DB,
      serverSelectionTimeoutMS: env.MONGO_CONNECT_TIMEOUT_MS,
      appName: 'medhub-techsales-api-app',
    }).asPromise();

    lookupConn = await mongoose.createConnection(env.MONGO_URI, {
      dbName: env.MONGO_LOOKUP_DB,
      serverSelectionTimeoutMS: env.MONGO_CONNECT_TIMEOUT_MS,
      appName: 'medhub-techsales-api-lookup',
    }).asPromise();

    return { ok: true, mode: 'mongo' };
  } catch (err) {
    logger.warn({ err }, 'Mongo unavailable; falling back to JSON repositories');
    return { ok: false, mode: 'json' };
  }
}

export const isMongoConnected = () =>
  appConn?.readyState === 1 && lookupConn?.readyState === 1;
```

---

## 3. Two-Database Architecture

The user requirement: portability across environments. Lookup data is large, mostly static, and shared across deployments; user-generated data is environment-specific. Putting them in separate databases means `mongodump --db=medhub_app` is sufficient to migrate state.

### Database split

| Database | Collections | Mutability | Migration cadence |
|---|---|---|---|
| **`medhub_lookup`** | `plans`, `benefits`, `premiums`, `starRatings`, `drugs`, `pharmacies`, `providers`, `zipStateCounty` | Read-only via API | Re-seed when reference data changes (annually for plans, on demand for others) |
| **`medhub_app`** | `leads`, `users`, `roles`, `departments`, `enrollments`, `members`, `memberAppointments`, `targets`, *(reserved: `aiInteractions`, `aiSuggestions`)* | Full CRUD via API | Migrated with the application |

### Mongoose multi-connection pattern

Models are bound to a specific connection. The repository registry knows which connection each repo uses.

```ts
// techsales-api/src/models/lead.model.ts
import { appConn } from '../config/mongo';
export const LeadModel = appConn.model<LeadDoc>('Lead', leadSchema);

// techsales-api/src/models/plan.model.ts
import { lookupConn } from '../config/mongo';
export const PlanModel = lookupConn.model<PlanDoc>('Plan', planSchema);
```

### Cross-DB queries

MongoDB Community does **not** support `$lookup` across databases. Today's service layer doesn't need it — composition happens in JavaScript (e.g., `getPlanWithDetails` calls four sub-services and assembles the result). Keep that pattern: the controllers compose, the repos do single-DB queries.

### Health endpoint

`GET /api/health` returns:
```json
{
  "mode": "mongo",
  "mongoUp": true,
  "dbs": {
    "app":    { "name": "medhub_app",    "readyState": 1 },
    "lookup": { "name": "medhub_lookup", "readyState": 1 }
  },
  "uptimeSec": 1234
}
```

The mode is fixed at backend startup; this endpoint reports what the backend booted into, not Mongo's current liveness.

---

## 4. Dual-Mode Data Layer

### Interface

```ts
// techsales-api/src/repositories/types.ts
export interface IRepository<T, ID = string> {
  findAll(): Promise<T[]>;
  findById(id: ID): Promise<T | null>;
  search(params: SearchParams<T>): Promise<Paginated<T>>;
  create(input: Omit<T, 'id'>): Promise<T>;
  update(id: ID, patch: Partial<T>): Promise<T | null>;
  delete(id: ID): Promise<boolean>;
}
export interface IReadOnlyRepository<T> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  search(params: SearchParams<T>): Promise<Paginated<T>>;
}
```

### Mode decided once at startup

`repositories/registry.ts` runs ONE connection attempt at backend startup. The result is locked for the lifetime of the process:

- **Mongo connects within `MONGO_CONNECT_TIMEOUT_MS`** → all repos are Mongo impls; `mode='mongo'`.
- **Mongo fails or times out, or `FORCE_JSON=true`** → all repos are JSON impls; `mode='json'`.

There is **no heartbeat, no per-request retry, no mid-flight mode switching**. If Mongo dies after the backend has booted in `'mongo'` mode, requests will return 5xx until the backend is restarted (at which point it will re-probe and likely boot into `'json'` mode). This is the deliberate trade-off for a simpler system: no split-brain, no reconciliation, easy to reason about.

`/api/health` reports the mode the backend booted into.

### JSON repository persistence

- **Source of truth in JSON mode: `techsales-api/data/{runtime,lookup}/`**, NOT `techsales-app/src/data/`.
- **Bootstrap-copy algorithm** (runs ONCE per backend startup, before mounting routes):
  - For each filename in `techsales-api/data/sample/runtime/`: if `techsales-api/data/runtime/<file>` does **not** exist, copy from sample; otherwise skip (operator owns the runtime dir; no clobber).
  - Same for lookup. To force re-seed, run `npm run drop-runtime` (deletes `techsales-api/data/runtime/*.json`) then restart.
  - If `techsales-api/data/sample/` is itself missing, the JSON mode panics at boot with a clear error pointing to `npm run transform-data`.
- **`JsonStore` write semantics** (concurrency-safe):
  - One in-flight write per collection, gated by a `currentWrite: Promise<void> | null` field. New writes await the previous one.
  - Dirty-flag pattern: any mutation flips `dirty=true`; the writer drains the flag *inside* the in-flight write before resolving — no update can be lost in a debounce window.
  - Atomic-on-disk: write to `<file>.tmp` → `fs.rename(<file>.tmp, <file>)`. Rename is atomic on ext4 / NTFS / APFS.
  - 100 ms debounce (the serialization above makes longer windows pointless).
- `JSON_PERSIST=false` → in-memory only; useful for CI and "reset on restart" demos.

### Read-only lookup data

`techsales-api/data/lookup/` is the JSON-mode mirror of `medhub_lookup`. The seed script populates Mongo from this directory; the JSON read-only repos read from it. Never written via API.

---

## 5. Sample Data — Sanitization & Transform

### Carrier renaming map

| Real (in current JSON) | Sanitized | Theme |
|---|---|---|
| Aetna | Carrier 1 | purple (kept; renamed `theme-carrier1`) |
| Humana | Carrier 2 | green (kept; renamed `theme-carrier2`) |
| UnitedHealthcare | Carrier 3 | (no theme — uses default) |
| Cigna | Carrier 4 | (no theme — uses default) |
| Blue Cross Blue Shield | Carrier 5 | (no theme — uses default) |
| WellCare *(Phase 2a addendum — found in dataset)* | Carrier 6 | (no theme — uses default) |
| AARP MedicareRx *(Phase 1+2a code-review addendum)* | Carrier 7 | (no theme — uses default) |

Common abbreviations also rewritten: `BCBS → C5`, `UHC → C3`, `BlueCross → Carrier 5`, `AARP → C7`.

### Case-preservation algorithm

Brand replacements are applied via a regex with a function callback that preserves the casing of each match individually. Word-boundary anchors prevent false positives in URLs and identifiers.

```ts
const CARRIER_MAP: Record<string, string> = {
  'Aetna': 'Carrier 1',
  'Humana': 'Carrier 2',
  'UnitedHealthcare': 'Carrier 3',
  'Cigna': 'Carrier 4',
  'Blue Cross Blue Shield': 'Carrier 5',
};
const ABBREV_MAP: Record<string, string> = {
  'UHC': 'C3', 'BCBS': 'C5', 'BlueCross': 'Carrier 5',
};

const matchCase = (orig: string, repl: string): string =>
  orig === orig.toUpperCase() ? repl.toUpperCase()
  : orig === orig.toLowerCase() ? repl.toLowerCase()
  : repl;                                          // PascalCase / mixed → use map value as-is

function transformText(s: string): string {
  let out = s;
  for (const [from, to] of Object.entries(CARRIER_MAP)) {
    out = out.replace(new RegExp(`\\b${from}\\b`, 'gi'), m => matchCase(m, to));
  }
  for (const [from, to] of Object.entries(ABBREV_MAP)) {
    out = out.replace(new RegExp(`\\b${from}\\b`, 'g'), to);   // case-sensitive: only literal `UHC`/`BCBS`
  }
  return out;
}
```

URLs are handled separately — `documents[].url` and any field matching `/^https?:\/\//` is run through `transformUrl()` which normalizes any host containing a real carrier substring to `https://example.com/<carrier-slug>/<path>`. Avoids the "space-in-URL" failure mode of naive text replace.

Edge cases verified by unit tests in the transform script:
- `AETNA` → `CARRIER 1`; `Aetna` → `Carrier 1`; `aetna` → `carrier 1`.
- `AetnaSilverPlan` → no match (no word boundary) → flagged in a "review unchanged matches" report so the operator can decide.
- `UHC` (caps, word-bounded) → `C3`; `uhc` → unchanged (URLs / lowercase identifiers); `Cuhc` → unchanged.
- `aetna.com` → URL transform: `https://example.com/carrier1/...`.

### Transform script (`techsales-api/src/scripts/transform-sample-data.ts`)

Inputs: `techsales-app/src/data/runtime/*.json` and `techsales-app/src/data/lookup/*.json`
Output: `techsales-api/data/sample/runtime/*.json` and `techsales-api/data/sample/lookup/*.json`

Fields rewritten (string-replace with case-preservation):
- Plans: `carrier`, `planName`, `marketingName`, `legalEntity`, `documents[].name`, `documents[].url`
- Members: `carrier`
- Enrollments: any embedded plan-name strings
- Leads: `existingAetnaMember` field — rename to `existingCarrier1Member` (frontend type follows)

Run order:
```
npm run transform-data    # techsales-app/src/data/* → techsales-api/data/sample/*
npm run seed              # techsales-api/data/sample/* → MongoDB (both DBs)
```

The transform is **idempotent and sourced from the original JSON**, so re-running with updated source data is safe.

### Things deliberately NOT changed

- Lead human names (`John Doe`, `Jane Smith`, `Mary Johnson`) — already fictitious.
- Pharmacy/provider names — generic enough (e.g., "CVS Pharmacy"... wait, those ARE real chains). **Open follow-up:** if pharmacy chain names should also be sanitized, extend the transform script to map `CVS / Walgreens / Walmart` → `Pharmacy Chain 1/2/3`. Flag during execution if needed.

---

## 6. API Design

**Vite proxy (dev only)** — added to `techsales-app/vite.config.ts`:

```ts
server: {
  proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } }
}
```

### Endpoint table (DB column shows which database backs each)

| Method | Path | DB | Maps to |
|---|---|---|---|
| GET | `/api/leads` | app | `getAllLeads` |
| GET | `/api/leads/search?...` | app | `searchLeads` |
| GET | `/api/leads/autocomplete?q=` | app | `autocompleteLeads` |
| GET | `/api/leads/:id` | app | `getLeadById` |
| POST | `/api/leads` | app | `createLead` |
| PATCH | `/api/leads/:id` | app | `updateLead` |
| DELETE | `/api/leads/:id` | app | `deleteLead` |
| POST/DELETE | `/api/leads/:id/pharmacies[/:pharmacyId]` | app | `tagPharmacy` / `untagPharmacy` |
| POST/DELETE | `/api/leads/:id/drugs[/:drugId]` | app | `tagDrug` / `untagDrug` |
| POST/DELETE | `/api/leads/:id/providers[/:providerId]` | app | `tagProvider` / `untagProvider` |
| GET | `/api/plans`, `/api/plans/:id`, `/api/plans/search` | lookup | planService |
| GET | `/api/plans/:id/benefits` | lookup | benefit lookup |
| GET | `/api/plans/:id/premium`, `/api/plans/:id/rating` | lookup | premium / rating |
| POST | `/api/auth/login` | app | username + password (demo) |
| POST | `/api/auth/member-login` | app | policyNumber + DOB |
| GET/POST/PATCH/DELETE | `/api/users`, `/api/roles`, `/api/departments` | app | as today |
| GET/POST/PATCH | `/api/members`, `/api/member-appointments`, `/api/enrollments`, `/api/targets` | app | per service |
| GET | `/api/drugs`, `/api/pharmacies`, `/api/providers`, `/api/zip-state-county` | lookup | lookups |
| GET | `/api/health` | — | `{ mode, mongoUp, dbs }` |

### Pagination & response shapes

The HTTP response shape must mirror `ServiceResponse<T>` from the existing service layer **exactly**, including the wrapped pagination shape that several `searchX` services already return:

```ts
// List endpoints with pagination (searchLeads, searchPlans, searchDrugs, searchPharmacies,
// searchProviders, searchUsers): the *inner* data is itself a paginated wrapper.
ServiceResponse<{
  data: T[]; total: number; page: number; pageSize: number; totalPages: number;
}>

// Single-resource endpoints (getXById)
ServiceResponse<T>

// Small unpaginated list endpoints (getDrugClasses, autocomplete, etc.)
ServiceResponse<T[]>
```

The shape is **fixed by the existing service signature** for each function. TypeScript will not catch a mismatch (`ServiceResponse<T>` is generic), so each route's contract must be JSDoc'd in `techsales-api/src/routes/<resource>.routes.ts` and verified against the consuming page during the slice that adds it.

All responses preserve `ServiceResponse<T> = { success, data?, error?, message? }`. HTTP status mirrors `success` (200/201/400/404/500).

### Auth — deliberately minimal (out of scope)

Authentication and authorization are **not implemented** in this work. Users are hardcoded in `techsales-app/src/data/runtime/users.json` today; the Phase 2b seeder copies them as-is into `medhub_app.users`. Login preserves the existing "any password works" demo behavior. There is **no token, no JWT, no auth middleware** — every `/api/*` endpoint is open on the LAN.

**`POST /api/auth/login`** (agent/admin)
1. Body: `{ username: string, password: string }`.
2. Look up user by `username` in `medhub_app.users`.
3. If missing or `!user.isActive` → 401 `{ success: false, error: 'Invalid credentials' }`.
4. Otherwise: **ignore `password`** (matches today's demo).
5. Return `{ success: true, data: { user } }`.

**`POST /api/auth/member-login`** (member portal)
- Body: `{ policyNumber: string, dateOfBirth: string }`.
- Match against `medhub_app.members` (case-insensitive policy, exact DOB).
- Return `{ success: true, data: { member } }`.

**`createdBy` / `updatedBy` audit fields**
- The existing FE service signatures already pass these (`createLead(data, createdBy)`, etc.). The HTTP routes accept them in the request body and persist them as-is. No backend lookup, no middleware injection.

**Frontend session storage** (sessionStorage, cleared on logout/tab-close)
| Key | Value |
|---|---|
| `medhub-mode` | `'api'` \| `'local'` — set by `AuthContext.login()` based on whether the API call succeeded |
| `medsales-auth` | the full user object (existing key, unchanged behavior) |

There is **no `medhub-token`**. `authHeader()` does not exist. The `Authorization` header is never sent.

**Local fallback login** (when backend unreachable at login time)
- `_loginLocal(username, password)` reads bundled `users.json`, matches by `username`, ignores `password`. Returns the user.
- Mode locks to `'local'`; subsequent service calls skip the API path entirely.

**Production posture (out of scope for this plan)**
This setup is appropriate for the current LAN-only deployment with a single trusted dev laptop. Before any non-LAN exposure, real auth must be added — see §13 production checklist.

---

## 7. Frontend Changes

### `src/api/apiClient.ts` (new)

```ts
const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export async function api<T>(path: string, init?: RequestInit): Promise<ServiceResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  // Under "decide at login, lock for session": no special handling for network errors
  // or 5xx here. The mode is already locked. Errors propagate to consumers as
  // ServiceResponse with success=false (from the backend) or as raw fetch exceptions
  // (network drop) — services in 'api' mode let those bubble up to the page's error UI.
  return res.json();
}
```

No `Authorization` header, no `authHeader()` helper — auth is out of scope. `ApiUnavailable` and `InvalidCredentials` are **scoped to AuthContext only** — they exist to drive the one-time login decision. After login, services route by `getMode()` and don't catch them.

### Service rewrites — decide mode at login, lock for the session

Every existing service function checks the session mode (set once at login) and routes accordingly:

```ts
export const getAllLeads = async () => {
  if (getMode() === 'local') return _getAllLeadsLocal();
  return await api<Lead[]>('/leads');
};
```

Original logic preserved as `_xxxLocal` helpers. The mode is determined **once during login** (see "Login flow" below) and stored in `sessionStorage` under `medhub-mode`. There is **no per-request fallback** — if the backend becomes unreachable mid-session, calls fail with the underlying network error. The user must log out and log back in to re-decide the mode.

**Two layers of resilience** remain, just both decided once:
- Backend layer: at startup, decides Mongo vs JSON file store (locked for backend lifetime).
- Frontend layer: at login, decides API vs bundled JSON (locked for session).

### Login flow (decides FE session mode)

```ts
// AuthContext.login()
async function login(username: string, password: string) {
  try {
    // 1. Try the backend.
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      const { data: { user } } = await res.json();
      sessionStorage.setItem('medhub-mode', 'api');
      return user;
    }
    if (res.status >= 400 && res.status < 500) throw new InvalidCredentials();
    // 5xx falls through to local mode (treat as "backend broken")
    throw new ApiUnavailable();
  } catch (e) {
    if (e instanceof InvalidCredentials) throw e;
    // 2. Network error or 5xx → fall back to bundled users.json.
    const user = await _loginLocal(username, password);
    if (!user) throw new InvalidCredentials();
    sessionStorage.setItem('medhub-mode', 'local');
    return user;
  }
}
```

Every service then reads `sessionStorage.getItem('medhub-mode')` once via a tiny `getMode()` helper. Logout clears the key so the next login re-decides.

Important: a **4xx from the backend is NOT a fallback trigger** — bad credentials must not silently succeed against a stale local copy. Only network errors or 5xx flip to local mode.

### Env vars (new `.env` files in `techsales-app/`)

| Var | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Override for non-proxy deployments |

To force local mode for an offline demo: disconnect from the network before login. The fetch fails, `AuthContext.login()` falls back to bundled `users.json`, and the session locks to `'local'` mode.

### Local-mode coverage by phase

| Phase | Resources usable in `'local'` mode |
|---|---|
| 3 (leads) | leads (read+write to in-memory + bundled JSON), users (read for login only) |
| 4 (mutable resources) | leads, users, roles, departments, enrollments, members, memberAppointments, targets — all from bundled JSON |
| 5 (lookup resources) | **No local fallback for plans/benefits/drugs/pharmacies/providers/zip.** Lookup pages will show errors in `'local'` mode. The auth bootstrap and runtime data still work offline. |

Rationale: lookup data is large (~1 MB JSON in the FE bundle). Dropping the lookup-side fallback shrinks the production bundle materially. "Truly offline plan browsing" is not a real use case — the local fallback is for "backend down, finish the lead I'm working on."

### AuthContext

`login()` calls `/api/auth/login`; on `ApiUnavailable` falls back to `users.json` lookup. Token stored alongside `medsales-auth`. `memberLogin` already delegates to `memberService` — gets the same wrapper, so AuthContext only changes its `login` path.

### Carrier rebrand (frontend follow-on)

| File | Change |
|---|---|
| `techsales-app/src/index.css` | Rename `.theme-aetna` → `.theme-carrier1`, `.theme-humana` → `.theme-carrier2`. Color values unchanged. |
| `techsales-app/src/context/ThemeContext.tsx` | Theme keys `'aetna'` → `'carrier1'`, `'humana'` → `'carrier2'`; UI labels updated to `"Carrier 1"` / `"Carrier 2"`. |
| `techsales-app/src/utils/logoUtils.ts` | Replace Aetna/Humana logo paths with neutral marks (or single default). |
| `techsales-app/public/` | Remove Aetna/Humana brand logo files; add `carrier1-logo.svg`, `carrier2-logo.svg` placeholders. |
| `techsales-app/src/types/lead.ts` | `existingAetnaMember` → `existingCarrier1Member` (everywhere it's referenced). |
| `techsales-app/src/types/member.ts` | `carrier: 'Aetna' \| 'Humana'` → `carrier: 'Carrier 1' \| 'Carrier 2' \| 'Carrier 3' \| 'Carrier 4' \| 'Carrier 5'`. |
| Member portal auto-theming | Only `Carrier 1` and `Carrier 2` switch themes. Carriers 3–5 use default theme (preserves today's behavior of only two themed carriers). |

---

## 8. Data Migration / Seeding

`techsales-api/src/scripts/seed.ts` — invoked via `npm run seed`.

Reads from `techsales-api/data/sample/` (after `transform-sample-data.ts` has run) and writes to MongoDB.

### Collection map (with target DB and indexes)

| Sample JSON file | DB | Collection | Indexes |
|---|---|---|---|
| sample/runtime/leads.json | app | `leads` | `{leadId:1}` unique, `{leadStatus:1}`, `{state:1,county:1}`, `{createdBy:1}`, text on `firstName lastName email phone medicareNumber` |
| sample/runtime/users.json | app | `users` | `{username:1}` unique, `{roleId:1}` |
| sample/runtime/roles.json | app | `roles` | `{roleId:1}` unique |
| sample/runtime/departments.json | app | `departments` | `{departmentId:1}` unique |
| sample/runtime/enrollments.json | app | `enrollments` | `{enrollmentId:1}` unique, `{leadId:1}`, `{planId:1}`, `{status:1}` |
| sample/runtime/members.json | app | `members` | `{memberId:1}` unique, `{policyNumber:1,dateOfBirth:1}`, `{isActive:1}` |
| sample/runtime/memberAppointments.json | app | `memberAppointments` | `{memberId:1,status:1}` |
| sample/runtime/targets.json | app | `targets` | `{userId:1,period:1}` |
| sample/lookup/planInformation.json | lookup | `plans` | `{planId:1}` unique, `{carrier:1,contractYear:1}`, `{category:1,planType:1}`, *(reserved: vector index on `embedding` for future AI)* |
| sample/lookup/benefitData.json | lookup | `benefits` | `{planId:1}` |
| sample/lookup/premiumInformation.json | lookup | `premiums` | `{planId:1}` unique |
| sample/lookup/starRatings.json | lookup | `starRatings` | `{planId:1}` unique |
| sample/lookup/drugData.json | lookup | `drugs` | `{drugId:1}` unique, text on `drugName` |
| sample/lookup/pharmacyData.json | lookup | `pharmacies` | `{pharmacyId:1}` unique, geo on coordinates if present |
| sample/lookup/providerData.json | lookup | `providers` | `{providerId:1}` unique, text on `providerName` |
| sample/lookup/zipStateCounty.json | lookup | `zipStateCounty` | `{zipCode:1}` unique, `{state:1,county:1}` |

**ID strategy:** Mongo manages `_id` (ObjectId); business keys (`leadId`, `planId`, etc.) remain string fields with unique indexes. Mongoose `toJSON` transform strips `_id`/`__v`, returning the object identical to current JSON shape — **zero FE type changes** required for read paths.

### Seed CLI flags

```
npm run seed                     # upsert by business key (safe, idempotent)
npm run seed -- --reset          # drop both DBs first, then insert
npm run seed -- --reset --app    # reset only medhub_app (preserves lookup)
npm run seed -- --reset --lookup # reset only medhub_lookup (preserves user data)
npm run seed -- --only=leads,users
```

The `--reset --app` flag is exactly the "move to a new env" workflow: keep the lookup DB intact, wipe and re-seed the app DB.

### Migration playbook (move `medhub_app` to a different host)

```powershell
# On source host
mongodump --uri="mongodb://192.168.0.175:27017/?directConnection=true" `
          --db=medhub_app --out=./backup

# Transfer ./backup to destination host

# On destination host
mongorestore --uri="<new-host-uri>" --db=medhub_app ./backup/medhub_app

# Update techsales-api/.env on the new host: MONGO_URI=<new-host-uri>
# Lookup DB stays where it is (or restore separately if needed).
```

---

## 9. Phased Rollout

### Phase 0 — URI / replica-set spike (~30 min, BEFORE Phase 1)

- **Goal:** Confirm the dev laptop can connect to the Pi's replica set with the new URI (no `directConnection=true`).
- **Steps:**
  ```powershell
  mongosh "mongodb://192.168.0.175:27017/?directConnection=true"
  > rs.conf().members.forEach(m => print(m.host))
  # Must print 192.168.0.175:27017 (or another LAN-reachable host).
  # If it prints 'localhost:27017' or a Pi-only hostname, fix on the Pi:
  #   mongosh (on Pi) → cfg = rs.conf(); cfg.members[0].host = '192.168.0.175:27017'; rs.reconfig(cfg, {force: true})
  > db.runCommand({ ping: 1 })
  > use medhub_app; db.test.insertOne({ ok: 1 }); db.test.findOne(); db.test.drop()
  ```
- **Acceptance:** All four commands succeed from the laptop. Without this, Mongoose's SDAM will silently fail despite `mongosh --directConnection` working — the most common self-hosted-RS gotcha.

### Phase 1 — Backend skeleton + two-DB connections + dual-mode framework

- **Goal:** Express boots, both connections established, `/api/health` reports the right mode, factory wiring proven on a stub repo.
- **Files:** `techsales-api/package.json`, `tsconfig.json`, `src/index.ts`, `config/env.ts`, `config/mongo.ts`, `repositories/types.ts`, `repositories/registry.ts`, `routes/health.routes.ts`, `middleware/*`, `Dockerfile`, `.env.example`, `README.md`. Types live in `techsales-api/src/types/`.
- **Acceptance:**
  - With Pi reachable: `npm run dev` connects to both `medhub_app` and `medhub_lookup`; `curl /api/health` returns `mode:'mongo'`.
  - With Pi unreachable (or `FORCE_JSON=true`) at startup: `npm run dev` boots in JSON mode and `curl /api/health` returns `mode:'json'`.
  - Killing Mongo AFTER the backend booted in `'mongo'` mode causes 5xx on subsequent requests (expected — no auto-fallback). Recovery requires backend restart.

### Phase 2a — Frontend rebrand (atomic, type-safe)

- **Goal:** No real carrier names anywhere in `techsales-app/`. App still runs on bundled JSON (no backend yet). Type rename and string rename land together so `tsc --noEmit` stays green.
- **Files (must commit atomically):**
  - `techsales-app/src/index.css` — `.theme-aetna` → `.theme-carrier1`, `.theme-humana` → `.theme-carrier2`.
  - `techsales-app/src/context/ThemeContext.tsx` — theme keys + UI labels.
  - `techsales-app/src/utils/logoUtils.ts` — neutral logos.
  - `techsales-app/public/` — replace logo files.
  - `techsales-app/src/types/lead.ts` — `existingAetnaMember` → `existingCarrier1Member`.
  - `techsales-app/src/types/member.ts` — carrier union type.
  - **All ~17 components/JSON files** referencing real carrier names (verified count from critic, not 10–15). Run the CI grep first to enumerate them all in one pass.
  - `techsales-app/src/data/runtime/*.json` and `lookup/*.json` — strings rewritten in place by a one-shot script (the FE still reads these in Phase 2a; backend doesn't exist yet to read from `techsales-api/data/sample/`).
- **Acceptance:**
  - `npm run lint && tsc --noEmit && npm run build` all pass.
  - `npm run dev`, click through plans/leads/themes — UI shows `Carrier 1`–`Carrier 5`. Themed member portal still works for Carrier 1 (purple) and Carrier 2 (green).
  - CI guard regex (case-insensitive, word-bounded): `(?i)\b(aetna|humana|cigna|unitedhealthcare|uhc|bcbs|blue[\s-]?cross|anthem|wellcare)\b` matches **zero** files in `techsales-app/src/` and `techsales-app/public/`.

### Phase 2b — Backend transform + seeder + Mongo population

- **Goal:** Backend skeleton from Phase 1 plus a working seeder that populates both `medhub_app` and `medhub_lookup` on the Pi from sanitized sample data. The transform script here is a *separate copy* (writes to `techsales-api/data/sample/`) — Phase 2a's in-place rewrite of `techsales-app/src/data/` is independent and stays.
- **Files:**
  - `techsales-api/src/scripts/transform-sample-data.ts` (reads `techsales-app/src/data/` → writes `techsales-api/data/sample/`).
  - `techsales-api/src/scripts/seed.ts`, `createIndexes.ts`, `drop.ts`, `drop-runtime.ts`.
  - Generated: `techsales-api/data/sample/{runtime,lookup}/*.json`.
- **Acceptance:**
  - `npm run transform-data` produces sanitized files in `techsales-api/data/sample/`.
  - `npm run seed -- --reset` populates both DBs on the Pi. `mongosh` confirms collection counts (8 + 8).
  - CI guard regex extends to `techsales-api/data/sample/**` — must be zero matches.
  - All indexes from §8 created.

### Phase 3 — Leads vertical slice + FE wrapper

- **Goal:** End-to-end CRUD for leads through both modes; FE consuming.
- **Files:** `models/lead.model.ts`, `repositories/mongo/MongoLeadRepository.ts`, `repositories/json/JsonLeadRepository.ts`, `JsonStore.ts`, `controllers/lead.controller.ts`, `routes/lead.routes.ts`, `techsales-app/src/api/apiClient.ts`, rewritten `techsales-app/src/services/leadService.ts`, `techsales-app/vite.config.ts` (proxy), `.env`.
- **Acceptance:**
  - Create a lead in UI → visible in `mongosh medhub_app db.leads.find()` on the Pi.
  - Stop the Pi → create still succeeds, written to `techsales-api/data/runtime/leads.json` (the JSON-mode store).
  - Stop backend entirely → create still succeeds via FE local fallback.

### Phase 4 — Migrate remaining `medhub_app` resources + AuthContext

- **Goal:** users, roles, departments, enrollments, members, memberAppointments, targets routed through API; AuthContext logs in via `/api/auth/login`.
- **Files:** repos + models + routes + controllers per resource; `routes/auth.routes.ts`; rewritten services; `AuthContext.tsx` patched.
- **Acceptance:** Login flow works in mongo / json / FE-only modes. All eight `medhub_app` collections seeded. UI pages function unchanged.

### Phase 5 — Migrate `medhub_lookup` resources

- **Goal:** plans, benefits, premiums, ratings, drugs, pharmacies, providers, zip behind API. **Lookup data has no FE-only fallback after this phase** (see §7 "Local-mode coverage by phase").
- **Files:**
  - Backend: read-only repo impls, `routes/plan.routes.ts` (consolidates plans+benefits+premiums+ratings), `routes/drug.routes.ts`, `pharmacy.routes.ts`, `provider.routes.ts`, `zip.routes.ts`.
  - Frontend: rewrite the 6 lookup services (planService, drugService, pharmacyService, providerService, zipService, plus benefit helpers in planService) to call the API directly — drop the `_xxxLocal` helpers and the `import ... from '../data/lookup/*.json'` lines.
  - Delete `techsales-app/src/data/lookup/*.json` (no longer imported anywhere).
- **Acceptance:**
  - Plan list, drug formulary, pharmacy/provider search, zip lookup all render via API in `'api'` mode.
  - In `'local'` mode (network down at login), these pages show a clean error state with "lookup data requires backend" messaging.
  - Production bundle shrinks ~1 MB (verify with `npm run build`).

### Phase 6 — Hardening & Deployment (no auth in this phase either)

- **Goal:** Validation, observability, deploy story. **Auth/authz remain out of scope** — when added later, that's a separate work item.
- **Files:** `middleware/validate.ts` (zod), `middleware/rateLimit.ts`, structured pino logging, OpenAPI spec via `zod-to-openapi`, `techsales-api/Dockerfile`, GitHub Actions CI.
- **Acceptance:** Bad payloads → 400 with field-level errors. Rate-limited 100 req/min/IP for write endpoints. `/api/openapi.json` served. Backend Dockerfile builds and runs.

### Phase 7 (Deferred) — AI foundation

Not in current scope. The schema already reserves room (`embedding?: number[]` on plans/benefits/drugs; `aiInteractions` collection name reserved). When AI work begins, pick a vector strategy that fits: in-aggregation cosine for small collections (works on the Pi as-is), Qdrant sidecar, or Atlas Vector Search.

---

## 10. Risks & Trade-offs

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Pi is a single point of failure when backend is in `'mongo'` mode** | Two independent fallback layers, both decided ONCE: (a) backend startup falls through to JSON if Pi is unreachable at boot; (b) FE login falls through to bundled JSON if backend is unreachable at login. **Mid-session**: if Pi dies AFTER backend booted into `'mongo'`, requests 5xx until the backend is restarted. Operationally: Pi reboot during a working session = stop and restart `npm run dev` on the laptop. Sessions already in `'local'` mode are unaffected. |
| 2 | **No auth on Pi MongoDB** | LAN-only deployment, documented in `techsales-api/README.md` as DEV-ONLY. Production checklist in Phase 6 requires enabling Mongo auth before any non-LAN exposure. Add bind-IP restriction (`bindIp` to LAN subnet only) on the Pi as a sanity check. |
| 3 | **Cross-DB join attempts** | None planned; controllers compose. If a future feature needs it, options are (a) duplicate the lookup field into the app doc, (b) two queries + JS join. Document this in `techsales-api/README.md`. |
| 4 | **leads.json (495 K) loaded entirely into memory in JSON mode** | Acceptable in JS heap. In Mongo mode, **never `findAll()` from controllers** — `searchLeads` with mandatory pagination, `pageSize<=100`. Add §8 indexes during Phase 2's `createIndexes.ts`. |
| 5 | **JSON writes corrupt source files in `src/data/`** | Hard-prohibited by design: backend reads from `techsales-api/data/`. Bootstrap copy runs once if empty. FE `src/data/` is read-only input. |
| 6 | **Type drift between API and frontend** | Types live in `techsales-api/src/types/`. The FE has its own `techsales-app/src/types/` with parallel definitions; renames must land in both. Future option: generate FE types from an OpenAPI spec served by the API (Phase 6) so they stay automatically in sync. |
| 7 | **"Any password" demo is insecure — and stays that way in this plan** | Auth is deliberately out of scope. The deployment is LAN-only on a trusted home network with no Mongo auth, no JWT, no password verification. **Never expose this stack to the public internet** without first adding real auth. Mitigations while in scope: helmet, CORS allowlist, `bindIp` to LAN subnet on the Pi, `NODE_ENV=development` only. |
| 8 | **Mongoose ties us to Mongo; Pi has no Vector Search** | Repository interface IS the abstraction. Mongoose stays inside `repositories/mongo/`. AI strategy is deferred — when picked up, the Pi can do in-aggregation cosine for small collections, or run Qdrant alongside. |
| 9 | **~1.5 MB JSON in FE bundle** | After Phase 5, the lookup JSON files (~1 MB of the bundle) are removed from `techsales-app/src/data/lookup/` since lookup data has no local fallback (see §7 "Local-mode coverage by phase"). Runtime JSON (~0.5 MB) is kept for the agent/auth bootstrap fallback. Net saving: ~1 MB on the production bundle. |
| 10 | **Mid-flight Pi unreachability** | Backend mode is fixed at startup — there is **no auto-failover**. If the Pi goes down while the backend is in `'mongo'` mode, requests start failing with 5xx until the backend is restarted (which then re-probes and likely boots into `'json'` mode). Trade-off accepted: simpler system, no split-brain, no reconciliation problem. Operationally: monitor backend uptime; restart on Pi reboot. A future enhancement could add a `/api/admin/reload-mode` endpoint to re-probe without a full restart, but it's out of scope. |
| 11 | **Frontend rebrand misses a string** | CI grep guard: case-insensitive, word-bounded regex `(?i)\b(aetna\|humana\|cigna\|unitedhealthcare\|uhc\|bcbs\|blue[\s-]?cross\|anthem\|wellcare\|aarp)\b` over `techsales-app/src/**`, `techsales-app/public/**`, `techsales-app/**/*.md`, AND `techsales-api/data/sample/**`. Fails PR on any match. Covers the 7 mapped carriers + abbreviations. |
| 12 | **CORS / cookies / sessions** | No tokens, no cookies, no auth headers → no CSRF or SameSite considerations. Vite dev proxy → FE+API share origin in dev. If the backend is ever exposed beyond the laptop, configure `CORS_ORIGIN` allowlist; never `*`. |

---

## 11. Critical Files

### New backend files (highest leverage)
- `techsales-api\src\index.ts`
- `techsales-api\src\config\mongo.ts` *(two connections, replica-set aware)*
- `techsales-api\src\repositories\registry.ts`
- `techsales-api\src\repositories\types.ts`
- `techsales-api\src\repositories\json\JsonStore.ts`
- `techsales-api\src\scripts\transform-sample-data.ts`
- `techsales-api\src\scripts\seed.ts`
- `techsales-api\src\scripts\createIndexes.ts`
- `techsales-api\src\routes\index.ts`

### Frontend files needing edits
- `techsales-app\vite.config.ts` — add proxy
- `techsales-app\src\api\apiClient.ts` — NEW
- `techsales-app\src\services\baseService.ts` — add `ApiUnavailable` error class
- All 12 services in `techsales-app\src\services\` — wrap pattern
- `techsales-app\src\context\AuthContext.tsx` — auth endpoint + token storage
- `techsales-app\src\context\ThemeContext.tsx` — rename theme keys
- `techsales-app\src\index.css` — rename `.theme-aetna/.theme-humana`
- `techsales-app\src\utils\logoUtils.ts` — neutral logos
- `techsales-app\src\types\lead.ts` — `existingAetnaMember` → `existingCarrier1Member`
- `techsales-app\src\types\member.ts` — carrier union type
- Components referencing real carrier names (grep `Aetna\|Humana\|Cigna\|UnitedHealthcare\|BCBS` — expect ~10–15 hits)
- `techsales-api\src\types\` — promoted from FE types (lives inside the API package)

### Reuse from existing code
- `techsales-app/src/services/baseService.ts` helpers (`filterByField`, `searchByFields`, `sortByField`, `paginateItems`) — port to `techsales-api/src/utils/` and reuse for the JSON repository implementations so list/search semantics stay identical.
- `techsales-app/src/types/*` — promote, do not duplicate.
- `ServiceResponse<T>` shape — preserve verbatim across HTTP boundary so FE pages need zero changes.

---

## 12. Verification

End-to-end smoke test after Phase 3:

```powershell
# Pre-req: Pi MongoDB is up at 192.168.0.175:27017 with replica set rs0 initiated.

# Terminal 1 — Backend
cd techsales-api
npm install
npm run transform-data        # sanitize sample data
npm run seed -- --reset       # drop+seed both DBs on the Pi
npm run dev                   # listens on :4000

# Terminal 2 — Frontend
cd techsales-app
npm install
npm run dev                   # :5173 with proxy → :4000

# Browser checks
# 1) GET http://localhost:5173/api/health
#    → { mode: 'mongo', mongoUp: true, dbs: { app: {...readyState:1}, lookup: {...readyState:1} } }

# 2) Carrier sanitization check
#    Open http://localhost:5173/plans → carrier filter shows Carrier 1, Carrier 2, Carrier 3, Carrier 4, Carrier 5
#    grep result on the codebase:
Get-ChildItem -Recurse -Path techsales-app/src -Include *.ts,*.tsx,*.json |
  Select-String -Pattern "Aetna|Humana|Cigna|UnitedHealthcare|BCBS"
#    → no matches (CI guard enforces this)

# 3) Two-DB write check (Phase 3 onward)
#    Create a lead in UI; on the Pi:
mongosh "mongodb://192.168.0.175:27017/?directConnection=true"
> use medhub_app
> db.leads.find({leadId: /LEAD/}).sort({_id:-1}).limit(1)
#    → shows the new lead
> use medhub_lookup
> db.plans.countDocuments()
#    → ~80

# 4) Pi failure scenario (no auto-failover — restart required)
#    Stop the backend (Ctrl+C). Disconnect from LAN or stop mongod on the Pi. Restart backend.
#    /api/health now returns mode:'json' (the backend re-probed at startup and got no Mongo).
#    Log in again — FE notices the change via /api/auth/login response and locks session to 'api' mode using the JSON-backed server.
#    Create another lead in UI → succeeds.
Get-Content techsales-api\data\runtime\leads.json | Select-String -Pattern "<the new firstName>"
#    → confirms write to JSON store on the backend

# 5) Backend failure scenario
#    Stop backend (Ctrl+C in terminal 1).
#    Create a lead in UI → still succeeds (FE-only fallback).
#    DevTools network shows ApiUnavailable; in-memory lead visible until refresh.

# 6) Migration drill (Phase 4 onward)
mongodump --uri="mongodb://192.168.0.175:27017/?directConnection=true" `
          --db=medhub_app --out=.\backup-app
#    → ./backup-app/medhub_app/*.bson exists; ~the size of runtime data
mongorestore --uri="<other-mongo-uri>" --db=medhub_app .\backup-app\medhub_app
#    Update techsales-api/.env on other host: MONGO_URI=<other-mongo-uri>
#    Backend starts; UI works on the new host without re-seeding lookup.
```

**Acceptance for the whole effort:** every page in the existing UI works in three modes — (Mongo + backend) / (no Mongo, backend up) / (no backend) — with no real carrier names anywhere in the UI or the seeded data. The service layer is the only seam that moves on the frontend; the only file edited per consumer page is zero.

---

## 13. Operational Notes

### Where things run (dev)

| Component | Host | Port |
|---|---|---|
| Frontend (Vite) | Dev laptop (Windows) | 5173 |
| Backend (Express) | Dev laptop (Windows) | 4000 |
| MongoDB (rs0 single-node) | Raspberry Pi at `192.168.0.175` | 27017 |

Vite dev proxy: `/api` → `http://localhost:4000` — no CORS in dev. Backend connects to the Pi over LAN; expect a few ms per query on a quiet network.

### Recovery procedures

| Scenario | Procedure |
|---|---|
| Pi reboots / Mongo down (backend was in `'mongo'`) | `Ctrl+C` the backend, `npm run dev` again. It re-probes; boots into `'mongo'` if Pi is back, else `'json'`. |
| Backend crashes | `npm run dev` again. FE sessions in `'api'` mode see fetch errors until backend is back; `'local'`-mode sessions unaffected. |
| Want to force `'json'` mode without stopping the Pi | Set `FORCE_JSON=true` in `techsales-api/.env`, restart backend. |
| Mongo data corruption / accidental drop | `mongorestore --db=medhub_app ./backup-app/medhub_app` (procedure in §8 migration playbook). |
| Reset JSON-mode data | `npm run drop-runtime` (deletes `techsales-api/data/runtime/*.json`); next backend boot re-seeds from `techsales-api/data/sample/`. |

### Production posture (out of scope for this plan; checklist for later)

- Backend co-located with Mongo on the Pi (single host) — drop the LAN hop.
- Process supervisor for the backend (systemd or pm2) — auto-restart on Pi reboot.
- Real Mongo auth (`db.createUser` with `readWrite` scoped per DB).
- TLS on Mongo (mTLS or X.509 client certs).
- Real auth: bcrypt password verification, session/JWT, RBAC enforcement at the route layer (out of scope for this plan).
- Backend Dockerfile + Compose for repeatable deploys.
- A `/api/admin/reload-mode` endpoint to re-probe Mongo without a full restart (deferred).

---

## 14. Open Items (resolve during execution)

1. **Pharmacy/provider chain names** — current data may include real chains (CVS, Walgreens, Walmart). If those should also be sanitized, extend `transform-sample-data.ts` with a `CHAIN_MAP`. Decide before Phase 2 ships.
2. **Plan documents/URLs** — some plan records contain URLs pointing to real carrier domains. These will be replaced with placeholder strings (`https://example.com/carrier1/sb.pdf`) by the transform script.
3. **Demo agent usernames** (`johndoe11`, `janesmith22`, `mikewilson33`) — kept as-is since they're already fictitious. Flag if you want `agent1`, `agent2`, `agent3` instead.
4. **CI guard** — once Phase 2 ships, add a GitHub Action that fails any PR reintroducing real carrier names. Sample command in §10 Risk #11.
