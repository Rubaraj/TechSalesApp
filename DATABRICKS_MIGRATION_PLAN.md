# Medicare Hub — Backend integrations plan: Databricks + Vertex (additive, config-driven)

> **Revision 2** — incorporates QA findings: corrected env-var names against actual `env.ts`, fixed `getEmbedder()` symbol collision, expanded the frontend impact list, listed the 6 actual direct-importer files, split Phase 1 into 1a/1b, swapped the order of Phase 2 and Phase 3 to avoid a dim-mismatch dead state, and pinned newer model defaults.

## Context

Goal: extend the Node backend so it can run against **Databricks** (database + AI) or **Vertex AI** (AI only) in addition to the existing MongoDB / Qdrant / Ollama / Anthropic stack. Selected per environment via `.env`.

**Hard constraints:**

1. **Nothing existing gets removed.** MongoDB, Qdrant, Ollama, Anthropic all stay. The active implementation is selected at boot via env flag.
2. **Three categories of new providers** to add:
   - **Database:** Databricks Delta tables (alternate to MongoDB)
   - **Embeddings:** Databricks Foundation Model embedder + Vertex embedder (alternates to Ollama nomic-embed-text)
   - **LLM:** Databricks Foundation Models + Vertex AI Gemini (alternates to Anthropic / Ollama)
3. The existing **provider switch pattern** at `getChatModel()` already exists for the LLM — we extend it to embeddings and vector store with the same shape.

---

## Current state — verified against the repo (May 2026)

| Component | What's actually there today | Selected by |
|---|---|---|
| Database | `connectMongo()` in `src/config/mongo.ts` attempts Mongo; on failure or when `FORCE_JSON=true`, falls back to JSON. No explicit `DATA_BACKEND` env var. The registry constructs each repo with an inline ternary `mongo ? new MongoX() : new JsonX()` for 8 entities (`registry.ts:71-86`). | `FORCE_JSON: boolean` + `JSON_PERSIST: boolean` |
| LLM | `chatModel.ts:37-49` switch on `AI_LLM_PROVIDER` between `'ollama'` and `'anthropic'`. Also exports `getActiveProvider()`, `getActiveModel()`, `getProviderReadinessError()`, plus an `AiProvider` type alias. The `default: never` exhaustiveness check breaks the moment the enum widens. | `AI_LLM_PROVIDER` |
| Embeddings | `ollamaEmbedder.ts` is hardcoded; **already exports a function called `getEmbedder()`**. Imported by 6 files: `hybridRetriever.ts`, `searchPlans.tool.ts`, `comparePlans.tool.ts`, `compareAgent.ts`, `explainAgent.ts`, `collections.ts`. | `AI_EMBED_MODEL`, `AI_EMBED_DIM` (both global, not provider-scoped) |
| Vector store | `qdrantClient.ts` is hardcoded. Imported by the same 6 files (often paired with the embedder). | `QDRANT_URL`, `QDRANT_API_KEY` |

This rev of the plan reflects the above — earlier drafts had a fictional `DATA_BACKEND` enum, an over-simplified `registry.ts` switch, and a 1-file frontend impact list. All corrected.

---

## Target — additive provider matrix

| Component | Implementations after | Selected by |
|---|---|---|
| Database | `mongo`, `json`, **`databricks`** | **NEW `DATA_BACKEND`** env var that supersedes `FORCE_JSON` (kept as a deprecated shim until cutover) |
| LLM | `ollama`, `anthropic`, **`databricks-foundation`**, **`vertex`** | `AI_LLM_PROVIDER` (existing) |
| Embeddings | `ollama`, **`databricks`**, **`vertex`** | **NEW `AI_EMBED_PROVIDER`** (default `ollama` → byte-identical to today) |
| Vector store | `qdrant`, **`databricks`**, **`vertex`** | **NEW `AI_VECTOR_PROVIDER`** (default `qdrant`) |

**Default values for every new env var preserve today's behavior.** A clean `.env.example` migration that touches no values still boots the existing Mongo + Ollama + Qdrant + Anthropic stack unchanged.

---

## Phased delivery (5 phases — Phase 1 split into 1a/1b)

### Phase 1a — Database layer SCAFFOLDING (dev box)
**Lands on the dev box; produces no live integration; pure code + unit tests + data dump.**

- `techsales-api/src/config/env.ts`:
  - Add `DATA_BACKEND: z.enum(['mongo', 'json', 'databricks']).optional()` — explicitly *optional* during the transition.
  - Add a derived helper `getDataBackend()` that returns: `DATA_BACKEND` if set, else `FORCE_JSON ? 'json' : 'mongo'`. This is the new single source of truth; `FORCE_JSON` becomes a deprecated synonym readable via the helper.
  - Add `DATABRICKS_HOST`, `DATABRICKS_HTTP_PATH`, `DATABRICKS_TOKEN`, `DATABRICKS_CATALOG`, `DATABRICKS_APP_SCHEMA`, `DATABRICKS_LOOKUP_SCHEMA` (all optional; required only when active backend is `databricks`).
- `techsales-api/src/repositories/databricks/` — NEW directory mirroring `mongo/`. One repository file per entity (Lead, Plan, Member, Target, Enrollment, AiInteraction, **plus the existing entities I missed in rev 1: Drug, Pharmacy** — confirm count from `registry.ts:71-86`).
- `techsales-api/src/repositories/databricks/databricksClient.ts` — connection wrapper around `@databricks/sql`.
- `techsales-api/src/repositories/registry.ts` — refactor every inline ternary `mongo ? new MongoX() : new JsonX()` into a factory function `createX(backend)` that handles three cases. **This is a bigger change inside this file than rev 1 implied — every entity gets touched.** The contract (what the registry exports) is unchanged; the construction site is rewritten.
- `techsales-api/scripts/databricks/001-init-schema.sql` — Delta DDL for every table. Idempotent.
- `techsales-api/scripts/databricks/002-export-from-mongo.ts` — read from Mongo on the Pi, produce NDJSON dumps at `data/databricks-bootstrap/{entity}.ndjson`. Run on the dev box only.
- Vitest unit tests for every Databricks repo with a mocked `databricksClient`. **These are the only verification path on the dev box.**

**Acceptance (1a):**
- `npm run build` clean
- `npx vitest run repositories/databricks/` all green
- `npm run migrate:export` produces NDJSON files; row count matches Mongo collection counts
- With `DATA_BACKEND` unset, `getDataBackend()` returns `'mongo'` (or `'json'` per `FORCE_JSON`) — existing behavior unchanged

### Phase 1b — Database layer LIVE LOAD (inside the org)
**Pulled from git inside the org; the only place real Databricks is exercised.**

- Run `001-init-schema.sql` once via the Databricks SQL editor.
- Run `002-load-to-databricks.ts` (the second half of the migration script) — pushes the NDJSON files committed in 1a to a Databricks Volume and `COPY INTO` each Delta table.
- Set `DATA_BACKEND=databricks` plus the credentials, restart the API.

**Acceptance (1b):**
- `curl /api/health` shows `"mode": "databricks"` (extending the existing health-payload type)
- `curl /api/leads` returns the same rows we exported
- `curl -X POST /api/leads -d '{...}'` creates a new lead; re-querying returns it
- Dev-box `DATA_BACKEND=mongo` path **still passes its smoke test** (no regression — verified before and after)

### Phase 2 — Vector store provider chokepoint (BEFORE embeddings, deliberately)
**Why this comes before embeddings:** if we flip the embedder first, the existing 768-dim Qdrant collection stops accepting writes (Databricks bge-large-en is 1024-dim). Building the vector chokepoint first lets us provision a fresh Databricks Vector Search endpoint at the right dim from day 1.

- `techsales-api/src/ai/vectorstore/types.ts` — NEW. Defines a `VectorClient` interface that captures the methods our hybrid retriever and tools actually use (`upsert`, `query`, `ensureCollection`, etc.).
- `techsales-api/src/ai/vectorstore/index.ts` — NEW. Exports `getVectorClient(): VectorClient`. Switch statement on `AI_VECTOR_PROVIDER`. Default: `qdrant`.
- `techsales-api/src/ai/vectorstore/providers/qdrant.ts` — refactored from existing `qdrantClient.ts`. Wrapped to match the new `VectorClient` interface.
- `techsales-api/src/ai/vectorstore/qdrantClient.ts` — kept as a re-exporting shim so the 6 direct importers don't break in this same commit; followups update them to import from `vectorstore/index.ts`.
- `techsales-api/src/ai/vectorstore/providers/databricks.ts` — NEW. Mosaic AI Vector Search.
- `techsales-api/src/ai/vectorstore/providers/vertex.ts` — NEW. Vertex AI Vector Search.
- `techsales-api/src/ai/vectorstore/hybridRetriever.ts` — keep BM25 (wink) half unchanged; route the ANN half through `getVectorClient()`.
- `techsales-api/src/config/env.ts` — add `AI_VECTOR_PROVIDER` (default `qdrant`), `DATABRICKS_VECTOR_ENDPOINT`, `VERTEX_VECTOR_INDEX_ENDPOINT`, `VERTEX_VECTOR_DEPLOYED_INDEX_ID`.

### Phase 3 — Embeddings provider chokepoint
**Symbol-collision fix:** the existing `ollamaEmbedder.ts` already exports `getEmbedder()`. The new chokepoint is named `getActiveEmbedder()` to avoid the collision.

- `techsales-api/src/ai/embeddings/index.ts` — NEW. Exports `getActiveEmbedder(): Embeddings` and `getActiveEmbedDim(): number`. Switch on `AI_EMBED_PROVIDER`.
- `techsales-api/src/ai/embeddings/providers/ollama.ts` — refactored from existing `ollamaEmbedder.ts`. The function inside is renamed to `buildOllamaEmbedder()` (a fresh symbol, so the refactor doesn't ride on the colliding name).
- `techsales-api/src/ai/embeddings/ollamaEmbedder.ts` — kept as a shim re-exporting `getEmbedder = buildOllamaEmbedder` so existing import sites keep working unchanged in this commit; a follow-up sweep updates the 6 importers to use `getActiveEmbedder()`.
- `techsales-api/src/ai/embeddings/providers/databricks.ts` — NEW. Calls a Databricks Foundation Model embedding endpoint (`databricks-bge-large-en` 1024-dim default, or `databricks-gte-large-en` 1024-dim alternative).
- `techsales-api/src/ai/embeddings/providers/vertex.ts` — NEW. Calls Vertex AI's `text-embedding-005` (768-dim) via `@langchain/google-vertexai`.
- `techsales-api/src/config/env.ts` — add `AI_EMBED_PROVIDER` (default `ollama`). The existing global `AI_EMBED_DIM` is preserved as the **Ollama-specific** dim (not renamed, to avoid breaking anything that reads it). New per-provider dim vars: `DATABRICKS_EMBED_DIM` (default 1024), `VERTEX_EMBED_DIM` (default 768). `getActiveEmbedDim()` reads the right one.
- **Boot-time guard:** `getActiveEmbedDim()` and `getVectorClient()` agree on the dim, OR refuse to start. Specifically, if a Qdrant collection exists with dim 768 and `AI_EMBED_PROVIDER=databricks` (1024), boot logs an explicit error pointing the user to `npm run index:build -- --reset --collection=plans`.

### Phase 4 — LLM provider extension
**Adds `databricks-foundation` and `vertex` to the existing `getChatModel()` switch.** Bigger than just two new cases — every export in `chatModel.ts` needs to handle the wider enum.

- `techsales-api/src/ai/llm/providers/databricks.ts` — NEW. Wraps `ChatDatabricks` from `@langchain/community/chat_models/databricks` (verify import path against current `@langchain/community` 1.x; if path drifted, fall back to the OpenAI-compatible client pointed at the Databricks Model Serving endpoint — keep both options available).
- `techsales-api/src/ai/llm/providers/vertex.ts` — NEW. Wraps `ChatVertexAI` from `@langchain/google-vertexai`. **Default model: `gemini-2.0-flash`** (not 1.5-pro, which is being deprecated). `gemini-2.5-pro` available as premium.
- `techsales-api/src/ai/llm/chatModel.ts` — extend the existing switch statement. **Also extend:**
  - The `AiProvider` type alias from `'ollama' | 'anthropic'` to include the two new values.
  - `getActiveProvider()` return type.
  - `getActiveModel()` switch (must handle 4 cases + return a model id string).
  - `getProviderReadinessError()` switch (must check Databricks reachable + token, Vertex GCP creds present).
  - The `default: never` exhaustiveness check at the bottom of the main switch automatically passes once the enum is widened correctly — TypeScript will fail compilation until every consumer is updated. Treat the TS errors as a checklist.
- `techsales-api/src/config/env.ts` — extend `AI_LLM_PROVIDER` enum to `['ollama', 'anthropic', 'databricks-foundation', 'vertex']`. Add `DATABRICKS_LLM_ENDPOINT` (default `databricks-meta-llama-3-3-70b-instruct` — verify with org admin, model availability rotates). Add `VERTEX_LLM_MODEL` (default `gemini-2.0-flash`).

### Phase 5 — End-to-end verification per provider combination
Run smoke tests against each viable combination (table below). Capture working combinations in `techsales-api/scripts/smoke/providers.ps1`.

---

## Single source of truth: `.env.example`

```dotenv
# ====================== DATABASE LAYER ======================
DATA_BACKEND=mongo                     # mongo | json | databricks (NEW; supersedes FORCE_JSON)

# Legacy — still readable; getDataBackend() prefers DATA_BACKEND when set
FORCE_JSON=false
JSON_PERSIST=true

# Mongo (active when DATA_BACKEND=mongo)
MONGO_URI=mongodb://192.168.0.175:27017/?directConnection=true

# Databricks (active when DATA_BACKEND=databricks; reused by Databricks AI providers)
DATABRICKS_HOST=
DATABRICKS_HTTP_PATH=
DATABRICKS_TOKEN=
DATABRICKS_CATALOG=dev_medhub
DATABRICKS_APP_SCHEMA=medhub_app
DATABRICKS_LOOKUP_SCHEMA=medhub_lookup

# ====================== LLM LAYER ======================
AI_LLM_PROVIDER=ollama                 # ollama | anthropic | databricks-foundation | vertex

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_LLM_MODEL=qwen2.5:7b

# Anthropic
ANTHROPIC_API_KEY=

# Databricks LLM (reuses DATABRICKS_HOST / DATABRICKS_TOKEN above)
DATABRICKS_LLM_ENDPOINT=databricks-meta-llama-3-3-70b-instruct

# Vertex AI (LLM + embeddings + vector search all use these GCP creds)
GOOGLE_PROJECT_ID=
GOOGLE_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=        # absolute path to service-account JSON
VERTEX_LLM_MODEL=gemini-2.0-flash

# Cost circuit breakers (existing; tighten if budget is concern)
AI_MAX_TOOL_STEPS=8
AI_REQUEST_TIMEOUT_MS=60000

# ====================== EMBEDDINGS LAYER ======================
AI_EMBED_PROVIDER=ollama               # ollama | databricks | vertex

# Ollama (existing AI_EMBED_DIM is Ollama-specific in this rev)
OLLAMA_EMBED_MODEL=nomic-embed-text
AI_EMBED_DIM=768

# Databricks embeddings (reuses DATABRICKS_HOST / DATABRICKS_TOKEN)
DATABRICKS_EMBED_ENDPOINT=databricks-bge-large-en
DATABRICKS_EMBED_DIM=1024

# Vertex embeddings (reuses GOOGLE_* above)
VERTEX_EMBED_MODEL=text-embedding-005
VERTEX_EMBED_DIM=768

# ====================== VECTOR STORE LAYER ======================
AI_VECTOR_PROVIDER=qdrant              # qdrant | databricks | vertex

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

# Databricks Vector Search (reuses DATABRICKS_HOST / DATABRICKS_TOKEN)
DATABRICKS_VECTOR_ENDPOINT=

# Vertex AI Vector Search (reuses GOOGLE_* above)
VERTEX_VECTOR_INDEX_ENDPOINT=
VERTEX_VECTOR_DEPLOYED_INDEX_ID=
```

---

## Recommended provider combinations

| Environment | DATA_BACKEND | AI_LLM_PROVIDER | AI_EMBED_PROVIDER | AI_VECTOR_PROVIDER |
|---|---|---|---|---|
| **Dev box, free local** (today's default) | `mongo` | `ollama` | `ollama` | `qdrant` |
| **Dev box, Claude demo** | `mongo` | `anthropic` | `ollama` | `qdrant` |
| **Inside org, fully-Databricks** | `databricks` | `databricks-foundation` | `databricks` | `databricks` |
| **Inside org, Vertex on top of Databricks data** | `databricks` | `vertex` | `vertex` | `vertex` |
| **Inside org, hybrid** (data on Databricks, AI on Vertex) | `databricks` | `vertex` | `vertex` | `databricks` |

**Embedding ↔ vector dim must match.** The boot-time guard refuses to start if the active embedder's dim doesn't match the existing collections in the active vector store.

---

## Critical files to be modified / created

**Modified (additive only — existing branches untouched):**
- `techsales-api/src/config/env.ts` — add new env vars and 4 new enum values across `DATA_BACKEND`, `AI_LLM_PROVIDER`, `AI_EMBED_PROVIDER`, `AI_VECTOR_PROVIDER`. Add a `getDataBackend()` helper that bridges to `FORCE_JSON`.
- `techsales-api/src/repositories/registry.ts` — convert all 8 inline ternaries to factory calls handling 3 backends. Contract unchanged; construction sites rewritten.
- `techsales-api/src/config/mongo.ts` — `connectMongo()` keeps working for `mongo`/`json` modes; in `databricks` mode it short-circuits (no Mongo connect).
- `techsales-api/src/routes/health.routes.ts` — extend `mode` type to include `'databricks'`.
- `techsales-api/src/ai/llm/chatModel.ts` — extend switch + `AiProvider` type + `getActiveProvider()` + `getActiveModel()` + `getProviderReadinessError()`.
- `techsales-api/src/ai/vectorstore/hybridRetriever.ts` — call `getVectorClient()` instead of importing `qdrantClient` directly.
- `techsales-api/src/ai/vectorstore/qdrantClient.ts` — convert to a re-exporting shim pointing at `providers/qdrant.ts`.
- `techsales-api/src/ai/embeddings/ollamaEmbedder.ts` — convert to a re-exporting shim pointing at `providers/ollama.ts`.
- `techsales-api/src/ai/vectorstore/collections.ts` — switch direct embedder/qdrant imports to chokepoints.
- `techsales-api/src/ai/tools/searchPlans.tool.ts` — same.
- `techsales-api/src/ai/tools/comparePlans.tool.ts` — same.
- `techsales-api/src/ai/agents/compareAgent.ts` — same.
- `techsales-api/src/ai/agents/explainAgent.ts` — same.
- `techsales-api/src/scripts/build-vector-index.ts` — same; add `--reset` and dim-check.
- `techsales-api/.env.example` — add all new vars.
- `techsales-api/package.json` — add `@databricks/sql`, `@langchain/google-vertexai`. Verify `@langchain/community ^1.1.27` exports `ChatDatabricks` at the expected path.
- `techsales-app/src/api/mode.ts` — extend `DataSource` type to include `'databricks'`. Update `getDataSource()`/`setDataSource()` validators and the `HealthResponse` interface.
- `techsales-app/src/context/AuthContext.tsx` — extend `dataSource` state + persistence to handle the new value.
- `techsales-app/src/components/layout/Header.tsx` — render the Databricks pill (icon + label + color).
- All consumers of the `'mongo' | 'json'` literal types in the FE — TypeScript will surface them.

**Created:**
- `techsales-api/src/repositories/databricks/databricksClient.ts`
- `techsales-api/src/repositories/databricks/{Lead,Plan,Member,Target,Enrollment,AiInteraction,Drug,Pharmacy}Repository.ts` (verify entity list against `registry.ts`)
- `techsales-api/src/repositories/databricks/__tests__/*.test.ts`
- `techsales-api/scripts/databricks/001-init-schema.sql`
- `techsales-api/scripts/databricks/002-export-from-mongo.ts`
- `techsales-api/scripts/databricks/003-load-to-databricks.ts`
- `techsales-api/src/ai/embeddings/index.ts`
- `techsales-api/src/ai/embeddings/providers/{ollama,databricks,vertex}.ts`
- `techsales-api/src/ai/vectorstore/index.ts`
- `techsales-api/src/ai/vectorstore/types.ts`
- `techsales-api/src/ai/vectorstore/providers/{qdrant,databricks,vertex}.ts`
- `techsales-api/src/ai/llm/providers/{databricks,vertex}.ts`
- `techsales-api/scripts/smoke/providers.ps1`

**Files NOT touched (additive-invariant audit list):**
- `techsales-api/src/repositories/mongo/*.ts` — every file in this directory unchanged
- `techsales-api/src/repositories/json/*.ts` — same
- `techsales-api/src/ai/llm/providers/{ollama,anthropic}.ts` — unchanged
- All controllers, routes, services, models — unchanged
- All FE pages and components except `mode.ts`/`AuthContext.tsx`/`Header.tsx`

---

## Risks & mitigations

1. **Embedding dimension mismatch.** Today's Qdrant `plans` collection is 768-dim. Databricks bge-large-en is 1024-dim. Switching the embedder requires recreating the collection. Mitigation: boot-time dim check that refuses to start with a clear error pointing at `npm run index:build -- --reset --collection=plans`.
2. **Per-request LLM cost on Vertex/Databricks.** Both meter per-token. The `AI_MAX_TOOL_STEPS=8` cap and `AI_REQUEST_TIMEOUT_MS=60000` are the cost circuit breakers — keep them tight. A runaway tool loop costs 8× a single call. Add a daily token cap on the new providers similar to the existing `aiTokenCap` middleware that today only applies to Anthropic.
3. **Auth shape per provider.** Mongo (URI), Databricks (PAT/SP token), Anthropic (API key), Ollama (no auth), Vertex (GCP service-account JSON file). The Vertex auth is the odd one out — needs `GOOGLE_APPLICATION_CREDENTIALS` pointing at a JSON file path. If the org doesn't allow committing service-account JSONs, use a Databricks Secret Scope or a workspace-level binding. Flag for admin team.
4. **`@langchain/community` version path drift.** Plan assumes `ChatDatabricks` lives at `@langchain/community/chat_models/databricks`. If the path drifted in 1.x, fall back to the OpenAI-compatible client pointed at the Databricks Model Serving endpoint. Verify on first import.
5. **Model id rotation.** `databricks-meta-llama-3-3-70b-instruct` and `databricks-claude-3-7-sonnet` are workspace-served endpoints; the published catalog rotates. Verify availability with the Databricks admin during Phase 0 discovery.
6. **`gemini-1.5-pro` is deprecated for new projects.** Default to `gemini-2.0-flash` (cheaper, faster) or `gemini-2.5-pro` (premium). Code handles the model id as opaque string from env, so swapping is one line.
7. **No Claude Code inside the org.** Phase 1b is the first phase that *cannot* be developed inside the org — the migration script must be authored on the dev box, pushed, then run inside. Treat the inside-org session as runtime/QA only. Any quick fix round-trips through git, not hand-edits.
8. **Service-account JSON for Vertex.** May need to live in a Databricks Secret Scope rather than a file. If so, add a small loader that materializes it to a temp file at startup and points `GOOGLE_APPLICATION_CREDENTIALS` at it.
9. **Boot-time validation must be rigorous.** With 4 active backend axes (DB / LLM / embed / vector), the cross-product is 36 combinations; many are nonsense (e.g. `databricks` LLM but no `DATABRICKS_TOKEN`). Boot must fail loudly, not start with half-configured backends.

---

## Verification per phase

After each phase, the existing baseline must still work AND the new path must work:

```powershell
# After Phase 1a — dev box build + tests + export, no Databricks contact
cd techsales-api
npm run build
npx vitest run repositories/databricks/
npm run migrate:export -- --from=mongo --out=data/databricks-bootstrap

# After Phase 1b — real Databricks (inside org)
git pull
$env:DATABRICKS_HOST = '...'; $env:DATABRICKS_HTTP_PATH = '...'; $env:DATABRICKS_TOKEN = '...'
# (run 001-init-schema.sql in the SQL editor)
npm run migrate:load -- --from=data/databricks-bootstrap
$env:DATA_BACKEND='databricks'; npm run dev
curl http://localhost:4000/api/health    # mode: databricks
curl http://localhost:4000/api/leads     # returns leads from Delta

# After Phase 2 — vector chokepoint + Databricks Vector Search index
$env:AI_VECTOR_PROVIDER='databricks'; npm run index:build -- --reset
npm run vector:query -- --collection=plans --query="HMO Florida"

# After Phase 3 — embedder chokepoint
$env:AI_EMBED_PROVIDER='databricks'; npm run index:build -- --reset --collection=plans
npm run vector:query -- --collection=plans --query="HMO Florida"

# After Phase 4 — new LLM
$env:AI_LLM_PROVIDER='databricks-foundation'; curl -X POST http://localhost:4000/api/ai/echo -d '{"text":"hi"}'
$env:AI_LLM_PROVIDER='vertex';                curl -X POST http://localhost:4000/api/ai/echo -d '{"text":"hi"}'

# After EVERY phase — original baseline still passes (the additive contract)
$env:DATA_BACKEND='mongo'
$env:AI_LLM_PROVIDER='ollama'
$env:AI_EMBED_PROVIDER='ollama'
$env:AI_VECTOR_PROVIDER='qdrant'
npm run dev    # everything works exactly as it did before this plan started
```

If the "baseline still passes" step ever regresses, the additive-only contract has been violated and we roll back the offending phase.

---

## Open questions before we start coding

1. **Phase scope to ship first.** All 5 phases is ~3-4 weeks of focused work. **Recommendation: ship Phase 1 (DB) only as the first commit, then re-evaluate.** Phases 2-4 can be authored on the dev box with mocks but only verified inside the org, so each adds a "blind landing" risk. Phase 1 alone is the highest-value, lowest-risk slice — gets data into Databricks, frees us from the Pi, and the AI module continues working unchanged against Mongo or against Databricks via the registry.

2. **Vertex availability.** Does your org actually have GCP / Vertex AI enabled, or is this a "we might want it later" placeholder? If placeholder, we still build the provider files but you don't need to populate the env vars yet.

3. **Catalog / schema names** in your Databricks workspace — defaulted to `dev_medhub.medhub_app` and `dev_medhub.medhub_lookup`. Override if your org has naming conventions.

4. **Databricks Foundation Model availability** in your specific workspace. Check during Phase 0 discovery: which of `databricks-meta-llama-3-3-70b-instruct` / `databricks-meta-llama-3-1-70b-instruct` / `databricks-dbrx-instruct` / `databricks-claude-3-7-sonnet` are actually served. The default is the first; if not available, swap.

5. **Service-account JSON storage** for Vertex inside the org. File on disk (simplest) vs Databricks Secret Scope (more secure). Decide before Phase 4.
