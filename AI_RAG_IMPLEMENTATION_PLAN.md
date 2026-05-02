# RAG-Powered AI Feature Suite — Medicare Hub POC

## Context

Medicare Hub is a frontend-only React/TypeScript POC for a Medicare sales platform (agents + members + admin). The app already supports 80+ plans, lead lifecycle, plan briefings, and a member portal — but its existing "Plan Recommendations" module is fully mocked (`src/pages/recommendations/PlanRecommendations.tsx` lines 151–162 use hardcoded match scores).

This plan adds **6 AI-powered features** sharing a single RAG backbone, to demonstrate Anthropic Claude as the intelligence layer for both agent productivity and member self-service. The POC must be demo-ready, run with `npm run dev`, and not require a separate backend service.

**The 6 features (locked-in scope):**

1. **Lead-triggered Plan Recommendation** — auto-rank plans on lead create
2. **Plan Explainer (dual mode)** — agent-grade tech depth + member-grade plain English
3. **Natural-Language Plan Search** — replaces filter-heavy search bar
4. **Natural-Language Plan Comparison** — cross-plan diff + AI narrative
5. **Drug Coverage Q&A** — per-drug, per-plan tier/PA answers on Lead Detail
6. **Member Portal Chat** — persistent floating widget for plan Q&A

---

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend | **Vite middleware plugin** exposing `/api/ai/*` | Zero second-process; one `npm run dev`; API key stays server-side via `loadEnv` |
| RAG store | **No vector DB** — full structured plan corpus as Anthropic prompt-cached system message | 80 plans (~250 KB) fits comfortably in 200K context; cache hits make per-query cost trivial. Defer embeddings until corpus grows or PDFs are ingested |
| PDF docs | **Skip in v1** — reference URLs only, no parsing | Real PDF ingestion is Phase 5 stretch; POC compiles structured JSON corpus instead |
| Drug formulary gap | **Pre-generate deterministic synthetic `formularyMap.json`** keyed by `(planId, drugId)` → `{tier, priorAuth, stepTherapy, qtyLimit}` | No real drug↔plan linkage exists in source data. Synthetic mapping is stable across demos. UI shows "Simulated formulary — pilot data" banner |
| Recommendation UX | **Fire-and-forget on lead create**, cache result in `localStorage` keyed by `leadId`; tab shows cached result or "Generate" button | Doesn't block lead creation flow; tab populates while agent navigates |
| Chat widget | **Floating bottom-right slide-up panel** (Intercom-style); built new (no existing primitive) | Persistent across member portal pages; per-member history in `localStorage` (last 50 messages) |
| LLM client | **`@anthropic-ai/sdk`** server-side; `claude-sonnet-4-6` for cost/latency, `claude-opus-4-7` available for explainer if needed | Anthropic-first stack matches the demo narrative |
| Output validation | **`zod` schemas + 1 retry** with "JSON only" reinforcement | Catches occasional prose-around-JSON Claude responses |

---

## Phased Implementation

### Phase 1 — Infrastructure (BFF + corpus + types)

**Install:** `@anthropic-ai/sdk`, `zod`

**Create:**
- `techsales-app/server/aiPlugin.ts` — Vite plugin registering `/api/ai/{recommend,explain,search,compare,drug-coverage,chat}` routes via `server.middlewares.use()`
- `techsales-app/server/anthropicClient.ts` — wraps SDK; exports `callClaude({ system, messages, schema })` with prompt-cache control on `system`
- `techsales-app/server/prompts/` — one `.ts` per feature with `system` + `userTemplate` + `responseSchema`
- `techsales-app/scripts/buildPlanCorpus.ts` — Node script: reads `src/data/lookup/*.json` → writes `src/data/ai/planCorpus.json` and `src/data/ai/formularyMap.json`
- `techsales-app/src/data/ai/planCorpus.json`, `formularyMap.json` (generated artifacts, gitignored after first run)
- `techsales-app/src/services/aiService.ts` — frontend fetch wrappers, one method per endpoint, returns typed results
- `techsales-app/src/types/ai.ts` — `AIRecommendation`, `AIExplanation`, `AISearchResult`, `AIComparison`, `AIDrugAnswer`, `AIChatMessage`
- `techsales-app/.env.local.example` — `ANTHROPIC_API_KEY=...`

**Modify:**
- `techsales-app/vite.config.ts` — register `aiPlugin()`, load env via `loadEnv`
- `techsales-app/package.json` — add scripts `"corpus:build"` and `"prebuild": "npm run corpus:build"`; chain corpus build into `dev` via `predev`
- `techsales-app/.gitignore` — `.env.local`, `src/data/ai/*.json`

**Outcome:** `curl localhost:5173/api/ai/recommend -d '{"leadId":"LEAD-001"}'` returns ranked plans.

---

### Phase 2 — Feature #1: Lead-triggered Recommendation

**Create:**
- `techsales-app/src/services/recommendationCache.ts` — `localStorage` get/set per `leadId`, with TTL
- `techsales-app/src/components/recommendations/RecommendedPlansTab.tsx` — reads cache, calls `aiService.recommend()` if missing, renders ranked plan cards with AI highlights

**Modify:**
- `techsales-app/src/pages/leads/LeadForm.tsx` line 324–330 — after `createLead` success, fire `aiService.recommend(result.data.leadId)` without `await` before `navigate('/leads')`
- `techsales-app/src/pages/leads/LeadDetail.tsx` lines 156–163 — add `{ id: 'recommendations', label: 'Recommended Plans', icon: Sparkles, badge: 'AI' }` to tabs array; add `<RecommendedPlansTab leadId={id} />` inside the `TabPanel` block
- `techsales-app/src/pages/recommendations/PlanRecommendations.tsx` — replace mock array (lines 151–162) with `aiService.recommend()` driven by selected real lead from `leadService.getLeadById()`

**Outcome:** Create lead → navigate to detail → "Recommended Plans" tab populated within ~3s with AI-ranked plans + reasoning.

---

### Phase 3 — Features #2, #3, #4: Plan Explainer + NL Search + NL Compare (agent-side)

**Create:**
- `techsales-app/src/components/plans/PlanExplainerPanel.tsx` — `mode: 'agent' | 'member'` prop; renders streamed explanation (basic markdown-to-JSX, no new dep)
- `techsales-app/src/components/plans/NLSearchBar.tsx` — debounced (400ms); shows "Interpreted as:" chip row of structured filters; click chip to remove
- `techsales-app/src/pages/plans/PlanCompare.tsx` — new page; multi-select 2–4 plans, side-by-side grid + AI narrative
- `techsales-app/src/components/comparison/ComparisonGrid.tsx` — extracted from YOYComparison; consumed by both YOY and PlanCompare

**Modify:**
- `techsales-app/src/pages/plans/PlanDetail.tsx` — add "AI Explainer" tab using `<PlanExplainerPanel mode="agent" planId={...} />`
- `techsales-app/src/pages/plans/PlanList.tsx` — swap header `<SearchInput>` for `<NLSearchBar onResults={setPlans} />`; preserve filter sidebar as fallback
- `techsales-app/src/App.tsx` — register `/plans/compare` route
- `techsales-app/src/pages/yoy/YOYComparison.tsx` — refactor inline grid into shared `<ComparisonGrid>`

**Outcome:**
- `/plans` → typing "low premium HMO with dental in Florida under 4 stars" filters results with visible chip explanation
- PlanDetail "AI Explainer" tab → readable agent-grade summary
- `/plans/compare` → narrative diff across selected plans

---

### Phase 4 — Features #5, #6: Drug Coverage + Member Chat

**Create:**
- `techsales-app/src/components/drugs/DrugCoverageButton.tsx` — inline button per drug → modal showing per-plan tier/PA/cost table
- `techsales-app/src/components/chat/ChatWidget.tsx` — floating bottom-right panel (380×560), theme-aware
- `techsales-app/src/components/chat/useChatHistory.ts` — `localStorage`-backed hook keyed by `memberId`, last 50 messages

**Modify:**
- `techsales-app/src/pages/leads/LeadDetail.tsx` lines 524–557 (Drugs tab) — add `<DrugCoverageButton lead={lead} drug={drug} />` next to each drug row's remove button
- `techsales-app/src/pages/member/MemberPlanDetail.tsx` — add `<PlanExplainerPanel mode="member" planId={...} />` as button-triggered modal section
- `techsales-app/src/pages/member/MemberDashboard.tsx` — mount `<ChatWidget memberId={member.memberId} planId={member.planId} />` at bottom

**Outcome:**
- Member logs in → chat widget answers "Is my Metformin covered?" with plan-specific reply
- Agent on lead Drugs tab → "Check coverage" → modal lists tier/PA per candidate plan with synthetic-data banner

---

### Phase 5 — Polish, Theme, Safety

**Modify all new components:**
- Replace any hardcoded color (`bg-orange-*`, `text-blue-*`) with `bg-primary-*` / `text-primary-*`
- Verify Aetna (purple), Humana (green), Default (orange) themes
- Verify dark mode via `dark:` variants
- Add "AI may be inaccurate — verify with official SBC" footer to chat widget and explainer panels
- Synthetic formulary banner on Drug Coverage modal
- Server-side rate limit (10 req/min/IP) in `aiPlugin.ts`
- Pre-warm Anthropic prompt cache on server boot (one dummy call)

---

## Per-Feature Integration Map

| # | Feature | Touch Points | API |
|---|---|---|---|
| 1 | Lead-triggered Recs | `LeadForm.tsx:324`, `LeadDetail.tsx:156`, `PlanRecommendations.tsx:151` | `POST /api/ai/recommend {leadId}` |
| 2a | Explainer (agent) | `PlanDetail.tsx` new tab | `POST /api/ai/explain {planId, mode:'agent'}` |
| 2b | Explainer (member) | `MemberPlanDetail.tsx` modal | `POST /api/ai/explain {planId, mode:'member'}` |
| 3 | NL Plan Search | `PlanList.tsx` search bar swap | `POST /api/ai/search {query}` → returns `{filters, rationale, rerankedIds}` |
| 4 | NL Plan Compare | new `/plans/compare` route | `POST /api/ai/compare {planIds[]}` |
| 5 | Drug Coverage Q&A | `LeadDetail.tsx:524–557` Drugs tab | `POST /api/ai/drug-coverage {leadId, drugId}` |
| 6 | Member Chat | `MemberDashboard.tsx` floating widget | `POST /api/ai/chat {memberId, planId, history, message}` (streaming) |

---

## Critical Files

**New (15):**
- `techsales-app/server/aiPlugin.ts`
- `techsales-app/server/anthropicClient.ts`
- `techsales-app/server/prompts/{recommend,explain,search,compare,drugCoverage,chat}.ts`
- `techsales-app/scripts/buildPlanCorpus.ts`
- `techsales-app/src/services/aiService.ts`
- `techsales-app/src/services/recommendationCache.ts`
- `techsales-app/src/types/ai.ts`
- `techsales-app/src/components/recommendations/RecommendedPlansTab.tsx`
- `techsales-app/src/components/plans/PlanExplainerPanel.tsx`
- `techsales-app/src/components/plans/NLSearchBar.tsx`
- `techsales-app/src/components/comparison/ComparisonGrid.tsx`
- `techsales-app/src/components/drugs/DrugCoverageButton.tsx`
- `techsales-app/src/components/chat/ChatWidget.tsx`
- `techsales-app/src/components/chat/useChatHistory.ts`
- `techsales-app/src/pages/plans/PlanCompare.tsx`

**Modified (12):**
- `techsales-app/vite.config.ts`
- `techsales-app/package.json`
- `techsales-app/.gitignore`
- `techsales-app/src/App.tsx`
- `techsales-app/src/pages/leads/LeadForm.tsx`
- `techsales-app/src/pages/leads/LeadDetail.tsx`
- `techsales-app/src/pages/plans/PlanList.tsx`
- `techsales-app/src/pages/plans/PlanDetail.tsx`
- `techsales-app/src/pages/recommendations/PlanRecommendations.tsx`
- `techsales-app/src/pages/yoy/YOYComparison.tsx`
- `techsales-app/src/pages/member/MemberDashboard.tsx`
- `techsales-app/src/pages/member/MemberPlanDetail.tsx`

**Reused (no changes):**
- `Modal`, `Tabs`, `Button`, `EmptyState` (`src/components/common/`)
- `useAuth()` (`src/context/AuthContext.tsx`)
- `useTheme()` (`src/context/ThemeContext.tsx`)
- `planService.getPlanWithDetails`, `comparePlans`, `searchPlans`, `calculateAdjustedPremium`
- `leadService.getLeadById`, `getAllLeads`
- `memberService.getMemberById`

---

## Verification Plan

1. **Setup:** Add `ANTHROPIC_API_KEY` to `.env.local`; run `npm install`; `npm run corpus:build`; `npm run dev`.
2. **Smoke test BFF:** `curl -X POST localhost:5173/api/ai/recommend -H "Content-Type: application/json" -d '{"leadId":"LEAD-001"}'` returns valid ranked plans JSON.

| # | Demo Login | Steps | Expected |
|---|---|---|---|
| 1 | `johndoe11` / any | Create lead with FL ZIP, Medicaid=true, 2 drugs → save → reopen → "Recommended Plans" tab | 5+ ranked plans within ~5s; top one is a DSNP/Aetna |
| 2a | `johndoe11` | `/plans` → open any plan → "AI Explainer" tab | Markdown summary in <4s, technical depth |
| 2b | `POL-2025-001` / `1955-03-15` | Member dashboard → "View My Plan" → "Explain in plain English" | 6th-grade-readable summary, Aetna-themed (purple) |
| 3 | `admin` / any | `/plans` → type "cheap HMO with dental in Texas" | Filter chips appear; list narrows |
| 4 | `johndoe11` | `/plans/compare` → pick 3 plans | Side-by-side grid + AI narrative |
| 5 | `johndoe11` | Open lead with Metformin tag → Drugs tab → "Check coverage" | Modal lists Tier 1, no PA across most plans, with synthetic-data banner |
| 6 | `POL-2025-002` / `1948-07-22` | Member dashboard → chat widget → "Do I need a referral for cardiology?" | Plan-specific answer, Humana-themed (green); persists on reload |

3. **Theme audit:** Toggle Default/Aetna/Humana + light/dark; verify no hardcoded colors in any new component.
4. **Lint:** `npm run lint` clean.
5. **Type check:** `npm run build` passes.

---

## Open Risks

1. **Stale corpus drift** — `planCorpus.json` only regenerates on `npm run corpus:build`. If anyone edits `planInformation.json` and forgets, AI returns stale data. **Mitigation:** chain corpus build into `predev` and `prebuild` scripts.
2. **Cold-cache latency** — first request per session is 3–6s; rapid demo clicks compound. **Mitigation:** pre-warm cache on server boot with one dummy call to each endpoint type.
3. **Synthetic formulary credibility** — if a stakeholder spot-checks against a real PDF, answers will diverge. **Mitigation:** visible "Simulated data — pilot only" banner on Drug Coverage modal.
4. **JSON-mode reliability** — Claude occasionally wraps JSON in prose. **Mitigation:** `zod` validation + one retry with stronger "JSON only" instruction.
5. **Theme regressions in new chat widget** — easy to hardcode a neutral gray and break Aetna/Humana switching. **Mitigation:** explicit theme QA pass during Phase 5; visual diff across all 3 themes in dev.
