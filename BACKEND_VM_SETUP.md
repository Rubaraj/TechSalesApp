# Backend + MongoDB — VM Setup & Data Import

Continues from `FRONTEND_VM_SETUP.md`. This guide gets `techsales-api` running on the VM
with a **locally hosted MongoDB**, imports the data, and connects the already-running
frontend to it.

Scope: backend + Mongo only. AI (Ollama/Qdrant) and telephony (Twilio/Deepgram) stay
**off** in this setup — the last section explains how to turn each on later.

---

## 1. Install MongoDB on the VM

MongoDB 8 Community Server. Pick ONE of the two options.

### Option A — Native install

**Windows:**

```powershell
winget install MongoDB.Server
# Installs as a Windows service ("MongoDB") and starts automatically on :27017.
# Also install the shell + database tools (used for import/verification):
winget install MongoDB.Shell MongoDB.DatabaseTools
```

**Ubuntu/Debian:**

```bash
# Follow https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/ — summary:
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
echo "deb [signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

### Option B — Docker (if Docker is allowed on the VM)

```bash
docker run -d --name mongodb -p 27017:27017 -v mongo-data:/data/db --restart unless-stopped mongo:8
```

### Verify

```bash
mongosh --eval "db.runCommand({ ping: 1 })"     # expect { ok: 1 }
```

> Keep Mongo bound to localhost (the default). Do not expose 27017 externally on an
> enterprise VM without auth configured.

---

## 2. Backend install & configuration

```bash
cd TechSalesApp/techsales-api
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Edit `.env` — the minimal working config for a local Mongo, no AI, no telephony:

```ini
NODE_ENV=development
PORT=4000

# Local MongoDB on this VM (directConnection avoids replica-set discovery issues)
MONGO_URI=mongodb://localhost:27017/?directConnection=true
MONGO_APP_DB=medhub_app
MONGO_LOOKUP_DB=medhub_lookup

# Explicitly select the Mongo backend
DATA_BACKEND=mongo
FORCE_JSON=false

CORS_ORIGIN=http://localhost:5173

# AI off until Ollama/Qdrant (or an Anthropic key) exist on this VM.
# The /api/ai/* routes return 501 AI_DISABLED; the frontend hides AI surfaces.
AI_ENABLED=false

# Telephony off (no Twilio/Deepgram needed). Backend refuses call webhooks cleanly.
TWILIO_ENABLED=false
```

Notes:

- The `.env.example` in the repo points `MONGO_URI` at the old Raspberry Pi
  (`192.168.0.175`) — **replace it with localhost** as above.
- `DATA_BACKEND` accepts `mongo | json | databricks`. With `json` the backend serves the
  bundled JSON store and Mongo is not needed at all (useful as a fallback check).

---

## 3. Import data into MongoDB

The database layout is two logical DBs on one server:

| DB | Collections | Source files |
|---|---|---|
| `medhub_app` (runtime) | leads, users, roles, departments, enrollments, members, memberAppointments, targets | `data/sample/runtime/*.json` |
| `medhub_lookup` (reference) | plans, benefits, premiums, starRatings, drugs, pharmacies, providers, zipStateCounty | `data/sample/lookup/*.json` |

### Path A — Seed from the committed sample data (fresh VM — use this)

The bootstrap seed data is **checked into the repo** at `techsales-api/data/sample/`,
so a fresh clone can populate Mongo directly:

```bash
cd techsales-api
npm run seed
```

What it does: reads every `data/sample/{runtime,lookup}/*.json`, **upserts by business
key** (`leadId`, `planId`, …) into the right DB/collection, then creates indexes.
It is idempotent — re-running refreshes documents without duplicating them.

Useful flags:

```bash
npm run seed -- --reset             # DROP both DBs, then insert clean
npm run seed -- --reset --app       # reset only medhub_app (runtime data)
npm run seed -- --reset --lookup    # reset only medhub_lookup (reference data)
npm run seed -- --only=leads,users  # seed just the listed collections (never drops)
```

Related scripts:

```bash
npm run drop            # drop both DBs entirely
npm run drop-runtime    # drop only runtime (app) DB
npm run transform-data  # regenerate data/sample/ from the frontend's JSON
                        # (only needed if you change techsales-app/src/data/*)
```

### Path B — Migrate real data from an existing MongoDB (e.g., the Pi)

If you want to carry over live data (leads created during development, notes, etc.)
instead of starting from the sample seed, dump from the source machine and restore
on the VM:

```bash
# On a machine that can reach the source Mongo:
mongodump --uri="mongodb://<SOURCE_HOST>:27017/?directConnection=true" --db=medhub_app    --out=./medhub-dump
mongodump --uri="mongodb://<SOURCE_HOST>:27017/?directConnection=true" --db=medhub_lookup --out=./medhub-dump

# Copy ./medhub-dump to the VM (scp / shared drive), then on the VM:
mongorestore --uri="mongodb://localhost:27017" --drop ./medhub-dump
```

`--drop` replaces any existing collections so the restore is clean. Run
`npm run seed` afterwards ONLY if you also want sample rows merged in (it upserts,
so restored documents with matching business keys would be overwritten).

### Verify the import

```bash
npm run verify-counts     # prints per-collection counts from the backend's viewpoint
```

or directly:

```bash
mongosh --eval "
  const app = connect('mongodb://localhost:27017/medhub_app');
  const lk  = connect('mongodb://localhost:27017/medhub_lookup');
  ['leads','users','enrollments','members'].forEach(c => print('app.'+c, app.getCollection(c).countDocuments()));
  ['plans','drugs','pharmacies','zipStateCounty'].forEach(c => print('lookup.'+c, lk.getCollection(c).countDocuments()));
"
```

Every listed collection should be non-zero.

---

## 4. Run the backend & connect the frontend

```bash
cd techsales-api
npm run dev          # tsx watch, listens on :4000
```

Check health:

```bash
curl http://localhost:4000/api/health
```

Expect `ok: true` with a payload that includes the active data backend (`mongo`) and
feature flags (`aiEnabled: false`, `twilioEnabled: false`).

Then connect the frontend:

1. Keep `npm run dev` running in `techsales-app` (port 5173). The Vite dev server
   already proxies `/api` → `http://localhost:4000` — no frontend config change needed.
2. **Log out and log back in.** The frontend decides `api` vs `local` mode once, at
   login, by probing `/api/health`. A session started before the backend existed is
   locked in local mode.
3. After re-login you're in **api mode**: leads/enrollments you create now persist in
   Mongo (verify: create a lead, then `mongosh` → `use medhub_app` → `db.leads.find().sort({_id:-1}).limit(1)`).

---

## 5. Turning on the optional stacks later

| Feature | What to install | .env changes |
|---|---|---|
| AI (local, free) | Ollama (`ollama pull qwen2.5:7b nomic-embed-text`) + Qdrant (`docker run -p 6333:6333 qdrant/qdrant`), then `npm run index:build` | `AI_ENABLED=true`, `AI_LLM_PROVIDER=ollama` |
| AI (Claude) | nothing — API only | `AI_ENABLED=true`, `AI_LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=...` (needs Console credit; a Max-plan login does not provide a backend key) |
| AI (demo, no LLM) | nothing | `AI_ENABLED=true`, `AI_LLM_PROVIDER=stub` — deterministic Atlas/call-copilot behavior, zero cost |
| Live calls | public HTTPS tunnel to :4000 (e.g. `cloudflared tunnel --url http://localhost:4000`) | `TWILIO_ENABLED=true` + `TWILIO_*` creds, `DEEPGRAM_API_KEY`, `PUBLIC_BASE_URL=<tunnel URL>`; update the TwiML App + phone-number webhooks in the Twilio console to the new tunnel URL |

Formulary data for drug-coverage features: `npm run formulary:build` (writes
`data/formulary-synthetic.json`; a generated copy is already committed).

---

## 6. Quick verification checklist

1. `mongosh --eval "db.runCommand({ping:1})"` → `{ ok: 1 }`
2. `npm run seed` completes with a per-collection "Seeded" log line and no errors
3. `npm run verify-counts` shows non-zero counts for app + lookup collections
4. `curl localhost:4000/api/health` → `ok: true`, backend `mongo`
5. Frontend re-login lands in **api mode** (no local-mode banner)
6. Creating a lead in the UI shows up in `medhub_app.leads`
