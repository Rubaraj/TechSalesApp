# VM Disk Space Expansion Request — Email Draft

> Fill in before sending: recipient name, VM name/ID, and confirm the requested
> size against your org's standard disk tiers.

---

**Subject:** Disk space expansion request — [VM name/ID] — AI Sales Copilot POC

Hi [Name / IT Support],

I'm requesting additional disk space on my development VM **[VM name/ID]**. The C: drive
is currently full, and I still have several required components left to install for an
active proof-of-concept. Could the drive be expanded by **an additional 100 GB**
(or to 256 GB total, whichever is standard)?

**About the POC (high level):**

I'm building a Medicare sales enablement platform with an integrated AI copilot. The
application manages the full sales lifecycle — lead capture, plan comparison and
recommendation, eligibility checks, and enrollment — and layers on an AI assistant
("Atlas") that supports sales agents in real time: answering plan questions, retrieving
lead context, drafting follow-ups, and (in a later phase) live call transcription with
compliance monitoring. The goal is to demonstrate an end-to-end AI pipeline (embeddings,
vector retrieval, agent orchestration) running largely on local, open-source
infrastructure.

**Software on the VM and its purpose:**

| Software | Purpose | Approx. footprint |
|---|---|---|
| Git + Claude Code | Source control and AI-assisted development (already installed) | ~1 GB |
| Node.js 22 LTS | Runtime for both the React frontend and the Express API backend | ~0.5 GB |
| Project repos + dependencies | Application source, npm packages, build output | ~2 GB |
| MongoDB 8 Community | Application database — leads, users, enrollments, plan reference data, AI audit logs | ~3 GB incl. data growth |
| **Docker Desktop** (not yet installed) | Container runtime for the AI infrastructure below; on Windows this includes a WSL2 backend | ~10 GB |
| **Qdrant** (Docker, not yet installed) | Vector database for semantic search over plan/benefit/drug documents (RAG) | ~2 GB |
| **Ollama + local models** (Docker, not yet installed) | Local LLM (qwen2.5:7b) and embedding model (nomic-embed-text) so AI features run on-VM without external API dependency | ~8–10 GB (model files) |

The remaining installs (Docker, Qdrant, Ollama models) account for roughly **20–25 GB**
on their own, and Docker's WSL2 virtual disk grows with image builds and container data,
which is what makes the current free space insufficient. The additional headroom covers
that growth plus logs, npm caches, and future model updates.

Please let me know if you need any further details or a formal justification form.

Thanks,
Rubarajan
