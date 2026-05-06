# Medicare Hub — Databricks Deployment Guide (Phase 1)

> **Scope of this guide.** This walks through deploying the Phase 1 build:
> the Node API connected to Databricks Delta tables, plus the React frontend
> wired to the API. **AI features are out of scope** — they still depend on
> Qdrant + Ollama which haven't been migrated yet. Set `AI_ENABLED=false`
> inside the org until Phases 2-4 land.

The work is split across **two environments** because of the org's network
isolation rules:

| Environment | Has access to |
|---|---|
| **Dev box** (your personal laptop) | Mongo on Pi · Internet · Claude Code · `api.anthropic.com` |
| **Inside the org** | Databricks workspace · org git · internal compute · NO Mongo · NO Claude Code |

Git is the only bridge. Everything authored on the dev box reaches the org
through `git push` → `git pull`.

---

## Part 0 — Pre-flight (one-time, ~30 min)

### 0.1 — Confirm with the Databricks admin team
Get these details written down before doing anything else:

- [ ] Workspace URL (e.g. `https://adb-1234567890123456.7.azuredatabricks.net`)
- [ ] Workspace cloud (AWS / Azure / GCP) and region
- [ ] Workspace edition (Premium / Enterprise) — Premium+ is required for Unity Catalog
- [ ] Unity Catalog enabled, with a catalog you can write to (default in our config: `dev_medhub`)
- [ ] A **SQL Warehouse** (Serverless or Pro), and its **HTTP path** (looks like `/sql/1.0/warehouses/abc123def456`)
- [ ] You have permission to `CREATE SCHEMA`, `CREATE TABLE`, `INSERT`, `SELECT` in the chosen catalog

### 0.2 — Generate a Databricks personal-access token (PAT)
1. Inside the Databricks workspace UI, click your username (top right) → **User Settings**.
2. Go to **Developer** → **Access tokens** → **Generate new token**.
3. Name it `medicare-hub-api`, set lifetime (90 days for POC, shorter for prod).
4. Copy the token immediately — you can't view it again. Save it in your password manager.

### 0.3 — Pick where the API will run inside the org
Choose ONE of:

| Option | Best for | Setup effort |
|---|---|---|
| **(A)** Your workstation inside the org | Quick demo, verifying the migration | 5 min |
| **(B)** Internal Linux VM (or container host) you can SSH into | First "real" deployment | 30 min |
| **(C)** Databricks Apps | Long-term production hosting | ~1 day (deferred to Phase 4) |

This guide covers (A) and (B). (C) is documented in `DATABRICKS_MIGRATION_PLAN.md` as Phase 4.

---

## Part 1 — On the dev box (export data, push to git)

You only need to do this once per snapshot of the data — re-run any time you want a fresh export.

### 1.1 — Pull the latest branch
```powershell
cd C:\Users\rubar\Repositories\TechSalesApp\techsales-api
git pull
npm install            # first time only, or when package.json changed
```

### 1.2 — Export from Mongo to NDJSON
Make sure the Pi is reachable (`MONGO_URI` already set in `.env`):

```powershell
npm run migrate:export
```

Expected output:
```
[export] writing to C:\Users\rubar\Repositories\TechSalesApp\techsales-api\data\databricks-bootstrap
[export] medhub_app.leads                  → leads.ndjson                 (57 docs)
[export] medhub_app.users                  → users.ndjson                 (12 docs)
[export] medhub_app.roles                  → roles.ndjson                 (4 docs)
[export] medhub_app.departments            → departments.ndjson           (3 docs)
[export] medhub_app.enrollments            → enrollments.ndjson           (8 docs)
[export] medhub_app.targets                → targets.ndjson               (15 docs)
[export] medhub_app.aiInteractions         → ai_interactions.ndjson       (842 docs)
[export] medhub_app.members                → members.ndjson               (24 docs)
[export] medhub_app.memberAppointments     → member_appointments.ndjson   (31 docs)
[export] done. 996 docs across 9 collections.
```

If row counts look off (e.g. `0 docs` for a collection you expect to have data), stop and check the Mongo connection.

### 1.3 — Commit the NDJSON files
```powershell
git add techsales-api/data/databricks-bootstrap/*.ndjson
git commit -m "Snapshot Mongo data for Databricks bootstrap"
git push
```

The NDJSON files are intentionally committed — they're the bridge between the dev box (where Mongo lives) and the org (where Databricks lives). They contain only synthetic / carrier-sanitized data, so this is safe.

> **Note on size.** If a single NDJSON file exceeds ~5 MB, switch it to Git LFS or push it through a Databricks Volume upload instead. Phase 1 POC volumes are well under this limit.

---

## Part 2 — Inside the org (set up the database)

You're now on a workstation inside the org with Databricks access.

### 2.1 — Pull the branch
```powershell
git clone <your-org-git-remote> C:\projects\TechSalesApp
cd C:\projects\TechSalesApp\techsales-api
npm install
```

(If you've already cloned, just `git pull`.)

### 2.2 — Create the Delta tables (one-time)
1. Open the Databricks workspace UI.
2. Go to **SQL Editor** (left sidebar).
3. Make sure your SQL Warehouse is selected (top of the editor).
4. Open `techsales-api/scripts/databricks/001-init-schema.sql` from the repo, copy its contents.
5. Paste into the SQL editor and click **Run all**.
6. Verify with:
   ```sql
   SHOW TABLES IN dev_medhub.medhub_app;
   SHOW TABLES IN dev_medhub.medhub_lookup;
   ```
   You should see 7 tables under `medhub_app` and 2 under `medhub_lookup`.

> **Different catalog/schema names?** Edit `001-init-schema.sql` (find/replace `dev_medhub`, `medhub_app`, `medhub_lookup` with your org's names) before running. Then make sure the same names match what you put in `.env` below.

### 2.3 — Configure the API's `.env`
Create `techsales-api/.env` (don't commit this file):

```dotenv
NODE_ENV=production
PORT=4000

# Databricks connection (from Part 0)
DATA_BACKEND=databricks
DATABRICKS_HOST=https://adb-1234567890123456.7.azuredatabricks.net
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/abc123def456
DATABRICKS_TOKEN=dapi_your_pat_token_here
DATABRICKS_CATALOG=dev_medhub
DATABRICKS_APP_SCHEMA=medhub_app
DATABRICKS_LOOKUP_SCHEMA=medhub_lookup

# Mongo vars are required by zod even when unused — leave dummy values.
MONGO_URI=mongodb://unused:27017/?directConnection=true
MONGO_APP_DB=medhub_app
MONGO_LOOKUP_DB=medhub_lookup

# AI features — disable until Phase 2-4 are done (Qdrant/Ollama not in org yet).
AI_ENABLED=false

# CORS — set to where the frontend will be served from.
CORS_ORIGIN=http://localhost:5173,http://your-internal-fe-host
```

### 2.4 — Load the data
With the same `.env` in place:
```powershell
cd C:\projects\TechSalesApp\techsales-api
npm run migrate:load
```

Expected output:
```
[load] mode=replace; 9 files in C:\projects\TechSalesApp\techsales-api\data\databricks-bootstrap
[load] leads                  ← leads.ndjson                 (57 rows)
[load] users                  ← users.ndjson                 (12 rows)
[load] roles                  ← roles.ndjson                 (4 rows)
[load] departments            ← departments.ndjson           (3 rows)
[load] enrollments            ← enrollments.ndjson           (8 rows)
[load] targets                ← targets.ndjson               (15 rows)
[load] ai_interactions        ← ai_interactions.ndjson       (842 rows)
[load] members                ← members.ndjson               (24 rows)
[load] member_appointments    ← member_appointments.ndjson   (31 rows)
[load] done. 996 rows across 9 tables.
```

Verify in the SQL editor:
```sql
SELECT count(*) FROM dev_medhub.medhub_app.leads;
SELECT count(*) FROM dev_medhub.medhub_lookup.members;
SELECT data FROM dev_medhub.medhub_app.leads LIMIT 1;  -- should show JSON
```

> **Re-running.** `npm run migrate:load` defaults to `--mode=replace`, which TRUNCATEs each table before inserting. Safe to run multiple times. Pass `--mode=append` to add to existing data instead.

---

## Part 3 — Deploy the API

### Option A — Workstation inside the org (quickest)

```powershell
cd C:\projects\TechSalesApp\techsales-api
npm run build         # one-time, produces dist/
npm start             # runs the compiled JS

# OR for live-reload during development:
npm run dev
```

The API listens on `http://localhost:4000`. Test it:
```powershell
curl http://localhost:4000/api/health
# Expect: { "data": { "mode": "databricks", ... } }

curl http://localhost:4000/api/leads
# Expect: an array of leads pulled from Databricks
```

This works for demos but the API only serves on localhost — colleagues on other machines can't reach it.

### Option B — Internal Linux VM (real deployment)

Pre-reqs on the VM:
- Node 20+ installed (`node -v`)
- Git installed
- Network access to the Databricks SQL Warehouse host (test: `curl -I $DATABRICKS_HOST`)
- An open port (e.g. 4000 or 8080) reachable from frontend hosts

```bash
# SSH into the VM
ssh user@your-vm-host

# Clone and install
git clone <org-git-remote> /opt/techsales-app
cd /opt/techsales-app/techsales-api
npm install
npm run build

# Create .env (same content as Part 2.3)
nano .env

# Start under a process manager
sudo npm install -g pm2
pm2 start dist/index.js --name medicare-hub-api
pm2 save
pm2 startup    # follow the printed instructions to enable on boot
```

Test from another machine on the same network:
```bash
curl http://your-vm-host:4000/api/health
```

> **Reverse proxy (recommended).** Put nginx/Caddy in front so the API gets a real hostname + TLS. Sample nginx block:
> ```nginx
> server {
>   listen 80;
>   server_name medicare-hub.internal;
>   location /api/ { proxy_pass http://localhost:4000; proxy_set_header Host $host; }
>   location /    { root /opt/techsales-app/techsales-app/dist; try_files $uri /index.html; }
> }
> ```
> This also lets you serve the frontend from the same hostname (Part 4 covers).

---

## Part 4 — Deploy the frontend

### 4.1 — Configure the FE to talk to the API
The frontend uses Vite's dev-server proxy in development. For production builds, set the API base URL via environment.

Create `techsales-app/.env.production`:
```
VITE_API_BASE_URL=http://medicare-hub.internal/api
# Or, if same-origin: leave it as the empty string and ensure the FE is served
# behind the same reverse proxy as the API (recommended — avoids CORS).
```

> **If the API and FE are on different origins**, add the FE origin to `CORS_ORIGIN` in the API's `.env` (Part 2.3).

### 4.2 — Build the static bundle
```powershell
cd C:\projects\TechSalesApp\techsales-app
npm install
npm run build
```

This produces `techsales-app/dist/` — about ~10 MB of static files (JS, CSS, images, `index.html`).

### 4.3 — Serve it

**Option 1: Same VM as the API (recommended).** The nginx config above already serves `dist/` as the root. Just sync it:
```bash
# From the dev box or directly on the VM:
scp -r techsales-app/dist/* user@your-vm-host:/opt/techsales-app/techsales-app/dist/
sudo systemctl reload nginx
```

**Option 2: Org's internal static host.** If your org has an existing static-content host (S3/Blob/Sharepoint/IIS/etc.), upload `dist/` there. Make sure the host serves `index.html` for unknown paths (SPA fallback).

**Option 3: Databricks Apps.** Future Phase 4 — host the bundled FE as a Databricks App.

### 4.4 — Verify the FE
Open the FE URL in a browser. Expected behavior:

- Login page renders
- Log in as `johndoe11` / any password
- **Header shows an indigo "Databricks" pill** (not green "MongoDB")
- **No AI badge** (because `AI_ENABLED=false`) — this is correct for Phase 1
- All non-AI features work: lead list, plan list, member portal, enrollments, etc.

If the Databricks pill says **"JSON" instead of "Databricks"**, the FE fell into local-mode fallback — it couldn't reach `/api/auth/login`. Check the API URL config and CORS.

---

## Part 5 — End-to-end verification

Run through this checklist after deployment:

- [ ] `curl <api-url>/api/health` returns `{ "mode": "databricks", "mongoUp": false, ... }`
- [ ] `curl <api-url>/api/leads` returns leads from Databricks
- [ ] `curl -X POST <api-url>/api/leads -H 'Content-Type: application/json' -d '{"firstName":"Test","lastName":"Lead","state":"FL", ...}'` creates a new lead, and a follow-up GET returns it
- [ ] `SELECT * FROM dev_medhub.medhub_app.leads WHERE lead_id = '<new-lead-id>'` in the Databricks SQL editor shows the row was actually written
- [ ] FE login works for both agent (`johndoe11`) and member (`POL-2025-002` / `1948-07-22`)
- [ ] Lead detail page loads, shows tagged drugs/pharmacies/providers
- [ ] Creating a new lead from the FE persists (refresh page → new lead still visible)
- [ ] Member portal pages load
- [ ] Header pill shows **Databricks** (indigo)
- [ ] No AI badge (because we set `AI_ENABLED=false`)

---

## Part 6 — Rollback / fallback

If something breaks inside the org, you have three rollback options:

1. **Switch the API back to JSON mode** (no Mongo, no Databricks — pure offline data). Edit `.env`:
   ```
   DATA_BACKEND=json
   ```
   Restart. The API will serve from the bundled JSON files in `techsales-api/data/`. Useful for "demo no matter what" continuity.

2. **Roll back the deployment** (Option B/VM):
   ```bash
   pm2 stop medicare-hub-api
   git checkout <previous-commit>
   npm install && npm run build
   pm2 start medicare-hub-api
   ```

3. **Re-load the data from a fresh export.** If a write went wrong and corrupted data:
   - On the dev box: `npm run migrate:export` again
   - Push, pull inside org
   - `npm run migrate:load -- --mode=replace`

---

## Part 7 — Common issues & fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| `DATA_BACKEND=databricks requires DATABRICKS_HOST, DATABRICKS_HTTP_PATH, DATABRICKS_TOKEN` at boot | One of the three env vars is empty or missing | Set them in `.env`, restart |
| `Connection refused` on first SQL call | SQL Warehouse is asleep (Serverless cold start) | Wait ~30s and retry, or warm the warehouse manually from the UI |
| `Authentication failed` | Token expired or wrong | Generate a fresh PAT (Part 0.2), update `.env`, restart |
| FE shows "JSON" pill instead of "Databricks" | FE fell to local-mode at login because `/api/auth/login` failed | Open browser devtools → Network. Check that requests reach the API. Check CORS origin. |
| `Table or view not found: dev_medhub.medhub_app.leads` | DDL not run, or wrong catalog/schema | Re-run `001-init-schema.sql`, verify catalog name matches `.env` |
| Migration load: `INSERT` fails with parse error on a row | The row contains a character that wasn't escaped | Should be fixed in current build (Phase 1a critical fix #2). If it recurs, capture the row and report. |
| API logs show `JSON.parse` error on read | A Delta row's `data` column is not valid JSON | Likely a manual edit. Re-run the load script with `--mode=replace`. |
| `AI_DISABLED` 501 from FE on lead creation | `AI_ENABLED=false` (intentional in Phase 1) | This is expected. AI features come back online in Phases 2-4. The FE gracefully hides AI surfaces when this flag is off. |
| `Mongo connect timeout` at boot | `DATA_BACKEND` not set, but Mongo not reachable from inside the org | Add `DATA_BACKEND=databricks` to `.env`. The API doesn't try Mongo when this is set. |

---

## What's NOT covered (yet)

- **AI features** (`/api/ai/*`) — Phase 2-4 add Mosaic AI Vector Search, Databricks Foundation Models, etc. Until those land, run with `AI_ENABLED=false` inside the org.
- **Databricks Apps hosting** — Phase 4. For now, host the API as a Node service yourself.
- **Auth / SSO** — the app currently uses simple username/password (and accepts any password in the local-fallback path). Wire up your org's SSO before exposing to real users.
- **Secrets in a Secret Scope** — this guide puts the Databricks PAT in a plain `.env` file. For production, move it to a Databricks Secret Scope or your org's secrets manager.
- **Backups** — Delta has time-travel built in (`SELECT * FROM table TIMESTAMP AS OF '...'`), so point-in-time recovery works out of the box. For longer retention, set up a periodic `DEEP CLONE` to a separate catalog.

---

## Reference — quick command cheat sheet

```powershell
# === Dev box ===
cd techsales-api
npm run migrate:export                    # dump Mongo → NDJSON
git add data/databricks-bootstrap/*.ndjson
git commit -m "Snapshot data for Databricks"
git push

# === Inside the org (one-time setup) ===
git pull
npm install
# Run 001-init-schema.sql via the Databricks SQL editor
# Set DATA_BACKEND=databricks + DATABRICKS_* vars in .env

# === Inside the org (per data refresh) ===
git pull
npm run migrate:load                       # NDJSON → Databricks Delta
# OR with options:
npm run migrate:load -- --mode=replace    # default: TRUNCATE first
npm run migrate:load -- --mode=append     # add to existing rows

# === Inside the org (run the API) ===
npm run build
npm start                                  # production
# OR
npm run dev                                # live-reload

# === Inside the org (build & deploy the FE) ===
cd ../techsales-app
npm install
npm run build
# Copy techsales-app/dist/ to your nginx/IIS/static host

# === Health check ===
curl http://<api-host>:4000/api/health
```

---

**Next phases** (see `DATABRICKS_MIGRATION_PLAN.md` for full detail):
- **Phase 2** — Mosaic AI Vector Search to replace Qdrant
- **Phase 3** — Databricks Foundation Model serving to replace Ollama/Anthropic
- **Phase 4** — Host as a Databricks App
