# Architecture Option A — Databricks Vector Search (No External Vector DB)

## Summary
- **React Frontend** uses:
  - **Node.js Usual Backend** for standard app data (CRUD/workflows)
  - **AI Orchestrator** for natural-language AI features (Agent + Member)
- **AI Orchestrator** performs retrieval using **Databricks Mosaic AI Vector Search** and generation using **Ollama**.
- No Qdrant dependency.

---

## Components
- **React Frontend**
  - Agent UI: Lead form AI assist, call script, note summary, next actions, plan explanation
  - Member UI: plan detail Q&A, “explain my plan”
- **Node.js Usual Backend**
  - Leads/members/plans CRUD and normal workflows (non-AI)
- **AI Orchestrator (Node.js)**
  - Prompt builder
  - Retrieval (Databricks Vector Search)
  - Response formatter + citations
  - RAG-only policy (answer only from retrieved context)
- **Ollama**
  - Open-source LLM runtime (generation)
- **Databricks Lakehouse**
  - Delta tables (plans, drugs, pharmacy, provider, docs, call notes)
  - **Vector Search index** built on a Delta “chunks” table
- **Langfuse (optional)**
  - Observability/tracing for prompt → retrieval → response

---

## Runtime Flow
1. UI sends question/request to **AI Orchestrator**
2. Orchestrator queries **Databricks Vector Search** with query text (top-K chunks)
3. Orchestrator sends (Question + Retrieved Context) to **Ollama**
4. Ollama returns grounded response with citations
5. Orchestrator returns answer + sources to UI

---

## Ingestion / Indexing Flow
1. Databricks tables/docs/notes → chunking job creates a Delta table (e.g., `plan_chunks`)
2. Databricks Vector Search index syncs from that chunks table (delta sync)
3. Retrieval queries return chunks + metadata (plan_id, source, etc.)

---

## Diagram (Mermaid)

```mermaid
flowchart LR
  UI[React Frontend\n(Agent UI + Member UI)]

  API[Node.js Usual Backend\n(Leads/Members/Plans CRUD\nNo AI logic)]
  ORCH[AI Orchestrator (Node.js)\n- Prompt Builder\n- Retrieval\n- Citations\n- RAG-only policy]
  OLL[Ollama\n(Open-source LLM Runtime)\nGeneration]
  DBX[(Databricks Lakehouse\nDelta Tables)]
  VS[(Databricks Mosaic AI Vector Search\nIndex on Delta Chunks)]
  ING[Chunking/Indexing Job\n(Databricks job or script)\nCreates plan_chunks Delta table]
  OBS[Langfuse (Optional)\nTracing/Observability]

  UI -->|Normal data| API
  UI -->|AI requests| ORCH

  ORCH -->|Vector query (text)| VS
  VS -->|Top-K chunks + metadata| ORCH

  ORCH -->|Question + Retrieved Context| OLL
  OLL -->|Answer + citations| ORCH
  ORCH -->|Answer + sources| UI

  DBX -->|Tables/Docs/Notes| ING
  ING -->|Writes chunk rows| DBX
  DBX -->|Delta Sync / Source| VS

  ORCH -. traces .-> OBS
```

---

## Notes
- Databricks plays two roles:
  - **System of record** (Delta tables)
  - **Semantic retrieval** (Vector Search index)
- Ollama is used for **reasoning + response generation** (not retrieval).
