# Frontend Dev Environment — Fresh VM Setup

Prerequisites and setup steps to develop the frontend (`techsales-app`) on a brand-new VM.
Assumes only **Git** and **Claude Code** are already installed. Everything else below must be installed.

> The frontend runs standalone: if no backend is reachable at login, it automatically falls
> back to **local mode** (bundled JSON data in `src/data/`), so you do NOT need the backend,
> MongoDB, Qdrant, Ollama, or Twilio to develop UI features. AI/call surfaces are gated off
> in local mode.

---

## 1. Software to install

| Software | Version | Why |
|---|---|---|
| **Node.js** | **22 LTS** (minimum 20.19; 24.x also works) | Vite 7 requires Node ≥ 20.19 or ≥ 22.12. npm ships with Node. |
| Git | any recent | already installed |
| Claude Code | latest | already installed |

That is the complete list for frontend-only work. No global npm packages are needed —
Vite, TypeScript, ESLint, and Tailwind are all local devDependencies installed by `npm install`.

### Windows VM

```powershell
winget install OpenJS.NodeJS.LTS
# then open a NEW terminal so PATH refreshes
node --version   # expect v22.x
npm --version
```

### Linux VM (Ubuntu/Debian)

Use `nvm` (avoids apt's outdated Node):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# restart shell or: source ~/.bashrc
nvm install 22
nvm use 22
node --version   # expect v22.x
```

---

## 2. Clone the repository

```bash
git clone <REPO_URL> TechSalesApp
cd TechSalesApp/techsales-app
```

If the enterprise Git account uses HTTPS + SSO, run `git config --global credential.helper manager`
(Windows) or set up a PAT/SSH key per your org's policy before cloning.

---

## 3. Install dependencies

```bash
# from TechSalesApp/techsales-app
npm install
```

`package-lock.json` is committed — plain `npm install` reproduces the exact dependency tree.
If your VM is behind a corporate proxy, configure npm first:

```bash
npm config set proxy http://<proxy>:<port>
npm config set https-proxy http://<proxy>:<port>
```

---

## 4. Environment file

```bash
# from techsales-app/
cp .env.local.example .env.local        # Windows: copy .env.local.example .env.local
```

`.env.local` is gitignored. Defaults are fine for frontend-only work:

- `VITE_AI_ENABLED=true` — master frontend AI flag (AI UI still hides in local mode).
- `VITE_API_BASE_URL` — optional; only needed if a backend runs somewhere other than the
  default Vite proxy target (`http://localhost:4000`).

---

## 5. Run

```bash
npm run dev
```

- App: **http://localhost:5173**
- Login credentials for the demo users are in `LOGIN_CREDENTIALS.md` at the repo root.
- With no backend running, the login flow detects this and enters **local mode** automatically.

### Other commands

```bash
npm run build     # type-check (tsc -b) + production build to dist/
npm run preview   # serve the production build locally
npm run lint      # ESLint over the whole app
```

---

## 6. Optional — full stack later

Only needed when working on Atlas/AI, live calls, or persistence:

- **Backend** (`techsales-api`): Node ≥ 20, `npm install`, `.env` from `.env.example`, `npm run dev` (port 4000).
- **MongoDB** — or set `DATA_BACKEND=json` in the backend `.env` to skip it.
- **Qdrant + Ollama** (Docker) — only for RAG/vector features (`AI_ENABLED=true`, provider `ollama`).
- **Anthropic API key** — only for `AI_LLM_PROVIDER=anthropic`.
- **Twilio + Deepgram keys + public tunnel** — only for live call features (`TWILIO_ENABLED=true`).

See `ARCHITECTURE.md` and `techsales-api/.env.example` for details.

---

## 7. Quick verification checklist

1. `node --version` → v22.x (or ≥ 20.19)
2. `npm install` completes with no errors
3. `npm run dev` → Vite banner, no red errors
4. Browser at http://localhost:5173 shows the login page
5. Log in with a demo user → dashboard loads (local mode banner is expected without a backend)
6. `npm run build` passes clean (confirms the TypeScript toolchain is healthy)
