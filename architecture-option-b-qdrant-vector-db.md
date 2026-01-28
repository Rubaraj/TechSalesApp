# Architecture Option B — Qdrant Vector DB (Fallback / Pure OSS Vector)

## Summary
- **React Frontend** uses:
  - **Node.js Usual Backend** for standard app data
  - **AI Orchestrator** for natural-language AI features
- **AI Orchestrator** performs retrieval using **Qdrant** and generation using **Ollama**.
- Databricks remains **system of record**; Qdrant is the semantic retrieval layer.

---

## Components
- **React Frontend**
  - Agent UI: Lead form AI assist, call script, note summary, next actions, plan explanation
  - Member UI: plan detail Q&A, “explain my plan”
- **Node.js Usual Backend**
  - Leads/members/plans CRUD and normal workflows (non-AI)
- **AI Orchestrator (Node.js)**
  - Prompt builder
  - Query embedding + retrieval (Qdrant)
  - Response formatter + citations
  - RAG-only policy
- **Ollama**
  - Open-source LLM runtime (**embeddings + generation**)
- **Qdrant**
  - Vector database for semantic search over chunks
- **Databricks Lakehouse**
  - Delta tables (plans, drugs, pharmacy, provider, docs, call notes)
  - Feeds ingestion pipeline (chunk + embed)
- **Langfuse (optional)**
  - Observability/tracing

---

## Runtime Flow
1. UI sends question/request to **AI Orchestrator**
2. Orchestrator embeds the user query (Ollama embeddings)
3. Orchestrator queries **Qdrant** (top-K chunks)
4. Orchestrator sends (Question + Retrieved Context) to **Ollama**
5. Ollama returns grounded response with citations
6. Orchestrator returns answer + sources to UI

---

## Ingestion / Indexing Flow
1. Databricks tables/docs/notes → ingestion job extracts content
2. Split into chunks
3. Generate embeddings (Ollama embeddings)
4. Upsert vectors + metadata to Qdrant

---

## Diagram (Mermaid)

```mermaid
flowchart LR
  UI[React Frontend\n(Agent UI + Member UI)]

  API[Node.js Usual Backend\n(Leads/Members/Plans CRUD\nNo AI logic)]
  ORCH[AI Orchestrator (Node.js)\n- Prompt Builder\n- Retrieval\n- Citations\n- RAG-only policy]
  OLL[Ollama\n(Open-source LLM Runtime)\nEmbeddings + Generation]
  QDR[(Qdrant\nVector Database)]
  DBX[(Databricks Lakehouse\nDelta Tables)]
  ING[Ingestion Job\n(Reads Databricks content\nChunks + Embeddings)]
  OBS[Langfuse (Optional)\nTracing/Observability]

  UI -->|Normal data| API
  UI -->|AI requests| ORCH

  ORCH -->|Embed query| OLL
  ORCH -->|Vector search top-K| QDR
  QDR -->|Top-K chunks + metadata| ORCH

  ORCH -->|Question + Retrieved Context| OLL
  OLL -->|Answer + citations| ORCH
  ORCH -->|Answer + sources| UI

  DBX -->|Tables/Docs/Notes| ING
  ING -->|Embeddings upsert| QDR

  ORCH -. traces .-> OBS
```

---

## Notes
- Qdrant is used only for **semantic retrieval**.
- Databricks remains your authoritative data store.
- This option is a good fallback if Databricks Vector Search is unavailable or not suitable for your POC.
