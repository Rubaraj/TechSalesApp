# Design documents

Phase-by-phase design and migration documents written during development. They record the
*reasoning* behind the architecture — the trade-offs considered, what was rejected and why,
and the failures that shaped the current design.

**They can lag the code.** Where a document and the source disagree, the source wins. Verify
specifics before relying on them.

These were written while the API lived in a monorepo alongside the React frontend, so paths
appear as `techsales-api/src/...`; in this repository that is simply `src/...`. References
to `techsales-app/` point at the frontend, which lives in a separate repository.

| Document | Covers |
|---|---|
| [`MONGODB_BACKEND_PLAN.md`](MONGODB_BACKEND_PLAN.md) | The backend plan: data model, repository pattern, the three-backend switch, rollout phases, risks |
| [`AI_BACKEND_PLAN.md`](AI_BACKEND_PLAN.md) | The AI pipeline: LangChain agents and tools, Qdrant vector store, embeddings, guardrails and cost control |
| [`BACKEND_VM_SETUP.md`](BACKEND_VM_SETUP.md) | Standing the API and a local MongoDB up on a VM |
| [`DATABRICKS_MIGRATION_PLAN.md`](DATABRICKS_MIGRATION_PLAN.md) | Moving the data layer to Databricks Delta tables |
| [`DATABRICKS_DEPLOYMENT_GUIDE.md`](DATABRICKS_DEPLOYMENT_GUIDE.md) | Operating that deployment (AI features out of scope) |
| [`architecture-option-a-databricks-vector-search.md`](architecture-option-a-databricks-vector-search.md) | Vector search option A — Databricks Vector Search |
| [`architecture-option-b-qdrant-vector-db.md`](architecture-option-b-qdrant-vector-db.md) | Vector search option B — Qdrant (the option that shipped) |
