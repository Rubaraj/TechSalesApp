# TechSales API — Instructions

> Companion API for the `techsales-app/` React frontend. Implements the MongoDB backend described in `../MONGODB_BACKEND_PLAN.md`.

This document is the practical reference: how to run it, what endpoints exist, how to seed and reset data, and what to do when things go wrong. For architectural rationale, see `../MONGODB_BACKEND_PLAN.md`.

---

## 1. What this is

A Node.js + Express + Mongoose backend that serves the Medicare Hub frontend. Three responsibilities:

1. **Talk to MongoDB on the Raspberry Pi** at `192.168.0.175:27017` for persistent data across two databases:
   - `medhub_app` — user-generated state (leads, users, roles, departments, enrollments, members, member appointments, targets).
   - `medhub_lookup` — read-only reference data (plans, benefits, premiums, ratings, drugs, pharmacies, providers, ZIP/state/county).
2. **Fall through to a JSON file store** under `data/runtime/` and `data/lookup/` when MongoDB is unreachable at startup. The mode is decided **once at boot** and locked — no heartbeat, no per-request retry.
3. **Expose a REST API** at `http://localhost:4000/api/*` that the frontend's Vite dev server proxies to from `http://localhost:5173`.

There is **no authentication** — the deployment is LAN-only, "any password works" preserves the existing demo behavior. Do not expose this stack outside the trusted network without first adding real auth.

---

## 2. Repository context

```
TechSalesApp/
├── techsales-app/   ← React frontend (Vite, :5173)
└── techsales-api/   ← THIS folder — Node backend (:4000), types live in src/types/
```

The frontend's `src/services/*` call `/api/*` endpoints in this backend; the response shape is `ServiceResponse<T> = { success, data?, error?, message? }` and the FE preserves it verbatim so consumer pages need no changes.

---

## 3. Prerequisites

- Node.js 20 or newer (Node 24 also works).
- LAN access to the Pi at `192.168.0.175:27017`. To verify: `Test-NetConnection 192.168.0.175 -Port 27017`.
- MongoDB on the Pi must be running with replica set `rs0` initiated. The Pi's `rs.conf()` advertises hostname `mongodb` (not the LAN IP), so the API connects with `?directConnection=true` to bypass topology discovery — see Phase 0 finding in the plan.

---

## 4. First-time setup

```powershell
cd techsales-api
npm install
copy .env.example .env
# (Edit .env if you need to point to a different Mongo host or change ports.)
```

Then seed the Pi from the carrier-sanitized sample data:

```powershell
npm run transform-data    # techsales-app/src/data/* → techsales-api/data/sample/* (carriers anonymized)
npm run seed -- --reset   # drop both DBs on Pi, re-insert, create indexes
```

After seeding you should see:

| DB | Collections | Total docs |
|---|---|---|
| `medhub_app` | leads, users, roles, departments, enrollments, members, memberAppointments, targets | ~1,049 |
| `medhub_lookup` | plans, benefits, premiums, starRatings, drugs, pharmacies, providers, zipStateCounty | ~2,113 |

Total across both: **3,162 documents**.

---

## 5. Running the API

### Dev mode (auto-reload)

```powershell
npm run dev
```

Listens on `http://localhost:4000`. `tsx watch` rebuilds and restarts on file changes. The startup log tells you the mode it booted into:

```
INFO: Mongo connected, mode=mongo
INFO: Repository registry initialized  mode=mongo
INFO: Server listening on http://localhost:4000 (mode=mongo)
```

If the Pi is unreachable at boot:

```
WARN: Mongo unavailable; falling back to JSON repositories
INFO: Server listening on http://localhost:4000 (mode=json)
```

### Force JSON mode (no Pi)

Set in `.env`:

```
FORCE_JSON=true
```

Skips the Mongo connection attempt entirely; reads/writes go to `data/runtime/` and `data/lookup/` only.

### Production-style run

```powershell
npm run build      # tsc → dist/
npm start          # node dist/index.js
```

---

## 6. Environment variables

| Var | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Standard Node convention |
| `PORT` | `4000` | HTTP listen port |
| `MONGO_URI` | `mongodb://192.168.0.175:27017/?directConnection=true` | Connection string. `directConnection=true` is required because the Pi's `rs.conf()` advertises a non-LAN hostname. |
| `MONGO_APP_DB` | `medhub_app` | App database name |
| `MONGO_LOOKUP_DB` | `medhub_lookup` | Lookup database name |
| `MONGO_CONNECT_TIMEOUT_MS` | `3000` | One-shot probe timeout at boot |
| `FORCE_JSON` | `false` | Skip Mongo entirely; use JSON store |
| `JSON_PERSIST` | `true` | When `false`, JSON-mode writes are in-memory only (CI / "reset on restart" demos) |
| `CORS_ORIGIN` | `http://localhost:5173` | Vite dev origin allowlist |

---

## 7. API endpoint reference

All responses are wrapped in `ServiceResponse<T>`. List endpoints with pagination return the wrapped shape `{ data: T[], total, page, pageSize, totalPages }` *inside* `data`. HTTP status mirrors `success` (200/201 vs 400/401/404/500).

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Reports `{ mode, mongoUp, dbs: { app, lookup }, uptimeSec }` |

### Auth (no token, no middleware)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | `{ username, password }` | Password ignored. Returns `{ user }`. 401 on inactive/missing user. |
| POST | `/api/auth/member-login` | `{ policyNumber, dateOfBirth }` | Case-insensitive policy match. Returns `{ member }`. 401 on miss. |

### Leads (`medhub_app.leads` — 580 seeded)

| Method | Path | Description |
|---|---|---|
| GET | `/api/leads` | All leads |
| GET | `/api/leads/search?page=&pageSize=&q=&sortBy=&sortDir=&...filters` | Paginated; filters by `leadStatus`, `state`, `county`, `source`, `createdBy`, etc. |
| GET | `/api/leads/autocomplete?q=` | Top-10 matches on first/last name |
| GET | `/api/leads/:id` | Single lead by `leadId` |
| POST | `/api/leads` | Create. Body must include `createdBy`. |
| PATCH | `/api/leads/:id` | Update. Body may include `updatedBy`. |
| DELETE | `/api/leads/:id` | Hard delete |
| POST | `/api/leads/:id/pharmacies` | Tag (max 3). Body `{ pharmacyId, updatedBy }` |
| DELETE | `/api/leads/:id/pharmacies/:pharmacyId` | Untag |
| POST | `/api/leads/:id/drugs` | Tag/upsert. Body `{ drug: TaggedDrug, updatedBy }` |
| DELETE | `/api/leads/:id/drugs/:drugId` | Untag |
| POST | `/api/leads/:id/providers` | Tag (max 5) |
| DELETE | `/api/leads/:id/providers/:providerId` | Untag |

### Users (`medhub_app.users` — 14 seeded)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/users` | All users |
| GET | `/api/users/search?...` | Paginated; filters `roleId`, `departmentId`, `isActive`, `accessLevel` |
| GET | `/api/users/:id` | Single |
| POST | `/api/users` | Create. Duplicate username/email rejected. |
| PATCH | `/api/users/:id` | Update. Same duplicate guard. |
| DELETE | `/api/users/:id` | Blocked for super admins |
| POST | `/api/users/:id/toggle-status` | Blocked for super admins |

### Roles (`medhub_app.roles` — 3 seeded)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/roles` | Active roles only |
| GET/POST | `/api/roles` and `/api/roles/:id` | CRUD |
| PATCH | `/api/roles/:id` | Duplicate-name guard |
| DELETE | `/api/roles/:id` | Blocked if any user references the role |
| GET | `/api/roles/:id/user-count` | Count of users currently assigned |

### Departments (`medhub_app.departments` — 3 seeded)

Same shape as roles, mounted at `/api/departments`.

### Enrollments (`medhub_app.enrollments` — 440 seeded)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/enrollments` | All. Optional `?agentId=` or `?leadId=` filters |
| GET | `/api/enrollments/by-agent/:agentId` | Filtered |
| GET | `/api/enrollments/by-lead/:leadId` | Filtered |
| POST | `/api/enrollments` | Create only — no update/delete in scope |

### Members (`medhub_app.members` — 2 seeded)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/members/:id` | Single (only if `isActive`) |
| GET | `/api/members/:id/appointments` | Scheduled appointments only |

(Member login is at `POST /api/auth/member-login`.)

### Targets (`medhub_app.targets` — 4 seeded)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/targets` | All |
| GET | `/api/targets/active` | Active only |
| GET | `/api/targets/by-period/:period` | Filter by period |
| GET | `/api/targets/by-metric/:metric` | Filter by metric |
| POST | `/api/targets` | Create |
| PATCH/DELETE | `/api/targets/:id` | Standard |
| POST | `/api/targets/:id/toggle-status` | Toggle `isActive` |

### Lookup resources (Phase 5 — pending)

The remaining read-only resources currently live in `medhub_lookup` but are **not yet** exposed via `/api/*`. Phase 5 of the plan covers wiring them up. Until then the FE reads them from bundled JSON.

Planned:
- `GET /api/plans`, `/api/plans/search`, `/api/plans/:id`, `/api/plans/:id/benefits`, `/api/plans/:id/premium`, `/api/plans/:id/rating`
- `GET /api/drugs`, `/api/pharmacies`, `/api/providers`, `/api/zip-state-county`

---

## 8. Scripts cheat sheet

| Command | What it does |
|---|---|
| `npm run dev` | tsx watch on `src/index.ts` |
| `npm run build` | TypeScript compile to `dist/` |
| `npm start` | Run `dist/index.js` (production) |
| `npm run transform-data` | Read `../techsales-app/src/data/{runtime,lookup}/*.json`, sanitize (carrier rename + URL placeholder + `existingAetnaMember → existingCarrier1Member`), write to `data/sample/*` |
| `npm run seed` | Upsert `data/sample/*` into Mongo. Idempotent. |
| `npm run seed -- --reset` | Drop both DBs then insert |
| `npm run seed -- --reset --app` | Reset only `medhub_app` (preserves lookup) |
| `npm run seed -- --reset --lookup` | Reset only `medhub_lookup` |
| `npm run seed -- --only=leads,users` | Seed listed collections only |
| `npm run drop` | Drop both DBs |
| `npm run drop-runtime` | Delete every `*.json` under `data/runtime/` (JSON-mode store; preserves `.gitkeep`, lookup, sample) |
| `npm run verify-counts` | Dump per-collection document counts on the Pi |
| `npm run lint` | ESLint over `src/` |

---

## 9. Operational notes

### Where things run

| Component | Host | Port |
|---|---|---|
| Frontend (Vite) | Dev laptop | 5173 |
| Backend (Express) | Dev laptop | 4000 |
| MongoDB (rs0) | Raspberry Pi at `192.168.0.175` | 27017 |

Vite dev proxy forwards `/api` → `localhost:4000` so there's no CORS in dev.

### Recovery procedures

| Scenario | Procedure |
|---|---|
| Pi reboots / Mongo down (backend was in `'mongo'`) | `Ctrl+C` the backend, `npm run dev` again. It re-probes; boots into whichever mode is reachable. |
| Backend crashes | `npm run dev` again. FE sessions in `'api'` mode see fetch errors until the backend is back; `'local'`-mode sessions are unaffected. |
| Force `'json'` mode without stopping the Pi | Set `FORCE_JSON=true` in `.env`, restart backend. |
| Mongo data corruption | `mongorestore --uri="<uri>" --db=medhub_app ./backup/medhub_app` |
| Reset JSON-mode runtime data | `npm run drop-runtime`; next backend boot re-seeds from `data/sample/` via the bootstrap-copy step |

### Mode is locked at startup — no auto-failover

The plan deliberately removed per-request fallback for simplicity. If Mongo dies AFTER the backend has booted in `'mongo'`, requests start failing with 5xx. You restart the backend to recover (it then boots into `'json'`). Trade-off accepted: simpler system, no split-brain, no reconciliation problem.

### Migrating `medhub_app` to a new host

```powershell
# Source host
mongodump --uri="mongodb://192.168.0.175:27017/?directConnection=true" --db=medhub_app --out=.\backup

# Destination host
mongorestore --uri="<new-host-uri>" --db=medhub_app .\backup\medhub_app

# Update .env on the new host: MONGO_URI=<new-host-uri>
```

`medhub_lookup` is regenerable (re-run `transform-data` + `seed`), so it doesn't usually need to ride along.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `MongooseServerSelectionError: getaddrinfo ENOTFOUND mongodb` | URI uses `?replicaSet=rs0` (default). The Pi's `rs.conf()` advertises hostname `mongodb` which the laptop can't resolve. | Use `?directConnection=true` (already the default in `.env.example`). |
| Backend boots in `mode:'json'` even though Pi is reachable | `FORCE_JSON=true` in `.env`, OR `MONGO_CONNECT_TIMEOUT_MS` is too low for a slow LAN | Unset/lower the flag; raise the timeout |
| `/api/leads` returns 0 items but `/api/health` is mongo | DB not seeded yet | `npm run seed -- --reset` |
| `npm run seed` complains about missing sample dir | `data/sample/` doesn't exist | Run `npm run transform-data` first |
| Port 4000 already in use | A previous `tsx watch` lingered | `Stop-Process` the orphaned `node` (see `Get-NetTCPConnection -LocalPort 4000`) |
| Type drift between `Lead` shape on FE vs API | Forgot to update `techsales-api/src/types/*` AND `techsales-app/src/types/*` together after a field rename | They are intentionally separate copies. Renames must land on both sides in the same change. Long-term fix: serve OpenAPI from the API and generate FE types from it (Phase 6). |
| FE `'local'` mode locks even with backend up | `AuthContext.login()` got a network error and flipped the session | Log out, log back in; this re-decides the mode |

### Health probe one-liner

```powershell
curl http://localhost:4000/api/health
# → { "success": true, "data": { "mode": "mongo", "mongoUp": true, "dbs": { "app": {...}, "lookup": {...} }, "uptimeSec": 12 } }
```

### Direct Mongo check (if `mongosh` is installed)

```powershell
mongosh "mongodb://192.168.0.175:27017/?directConnection=true"
> use medhub_app
> db.leads.countDocuments()        # → 580
> use medhub_lookup
> db.plans.countDocuments()        # → 80
```

If `mongosh` isn't on PATH, use `npm run verify-counts` instead — it does the same via Mongoose.

---

## 11. Project layout (this folder)

```
techsales-api/
├── src/
│   ├── index.ts                          # bootstrap → connect → bootstrap-copy → init registry → mount routes
│   ├── config/
│   │   ├── env.ts                        # zod-validated process.env
│   │   ├── mongo.ts                      # appConn + lookupConn (two Mongoose connections)
│   │   └── logger.ts                     # pino + pino-pretty in dev
│   ├── middleware/
│   │   ├── errorHandler.ts               # → ServiceResponse<never>
│   │   ├── asyncHandler.ts               # async route wrapper
│   │   └── requestLogger.ts              # pino-http
│   ├── repositories/
│   │   ├── types.ts                      # IRepository<T>, ServiceResponse<T>, Paginated<T>, SearchParams<T>
│   │   ├── registry.ts                   # singleton — mode locked at boot
│   │   ├── mongo/                        # Mongo<Resource>Repository.ts (one per resource)
│   │   └── json/                         # Json<Resource>Repository.ts + JsonStore.ts (atomic + concurrent-safe)
│   ├── models/                           # Mongoose schemas with lazy `getXModel()` accessor
│   ├── controllers/                      # Express handlers; wrap repos into ServiceResponse<T>
│   ├── routes/                           # one file per resource; mounted in routes/index.ts
│   ├── scripts/
│   │   ├── transform-sample-data.ts      # JSON in → JSON out, with carrier sanitization
│   │   ├── seed.ts                       # JSON → Mongo, idempotent upsert
│   │   ├── createIndexes.ts              # idempotent index creation per collection
│   │   ├── drop.ts                       # drop both DBs
│   │   └── drop-runtime.ts               # delete data/runtime/*.json
│   └── utils/                            # bootstrap copy, paginate, search helpers
├── scripts-debug/
│   └── verify-counts.mjs                 # Mongoose-driven doc-count probe
├── data/
│   ├── sample/{runtime,lookup}/*.json    # carrier-sanitized seed source (regenerable)
│   ├── runtime/*.json                    # JSON-mode store (writes go here, .gitkeep)
│   └── lookup/*.json                     # JSON-mode mirror of medhub_lookup
├── dist/                                 # tsc output
├── package.json                          # @medhub/techsales-api
├── tsconfig.json
├── Dockerfile                            # production image
├── README.md                             # quickstart
└── INSTRUCTIONS.md                       # this file
```

---

## 12. Production checklist (out of scope for current dev — for later)

Before exposing this stack beyond the trusted LAN:

- [ ] Real auth: bcrypt password verification, session/JWT, RBAC enforcement at route layer
- [ ] Mongo auth: `db.createUser` with `readWrite` scoped per DB
- [ ] TLS on Mongo (mTLS or X.509 client certs)
- [ ] `bindIp` on the Pi restricted to LAN subnet (not `0.0.0.0`)
- [ ] Backend co-located with Mongo on the Pi (drop the LAN hop)
- [ ] Process supervisor (systemd or pm2) for auto-restart on Pi reboot
- [ ] Backend Dockerfile + docker-compose for repeatable deploys
- [ ] zod request validation (Phase 6)
- [ ] Rate limiting (Phase 6)
- [ ] Structured pino logging shipped to a log aggregator (Phase 6)
- [ ] OpenAPI spec served from `/api/openapi.json` (Phase 6)
- [ ] CI guard: regex `(?i)\b(aetna|humana|cigna|unitedhealthcare|uhc|bcbs|blue[\s-]?cross|anthem|wellcare|aarp)\b` over `techsales-app/src/**`, `techsales-app/public/**`, and `techsales-api/data/sample/**` returns zero matches

---

## 13. References

- `../MONGODB_BACKEND_PLAN.md` — full architectural plan with rationale and risks
- `../APPLICATION_GUIDE.md` — frontend application guide
- `../techsales-app/` — the React frontend that consumes this API
- `src/types/` (this folder's own types directory) — TypeScript type definitions for `Lead`, `User`, `Plan`, etc.
