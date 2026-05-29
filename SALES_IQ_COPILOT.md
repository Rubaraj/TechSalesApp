# Sales IQ Copilot — Implementation Instructions

> **Purpose:** This file is the single source of truth for implementing the Sales IQ Copilot feature in TechSalesApp. It is designed to be consumed by Claude Code CLI or any AI coding assistant. Read this file fully before writing any code.

---

## Vision

Sales IQ Copilot is a **context-aware AI agent embedded across the entire application** — not a chatbot you go to, but an assistant that comes to you.

- **Lead Management:** Analyzes a prospect's profile and proactively recommends best-fit plans ranked by drug coverage, cost, and eligibility.
- **Plan Browsing:** Lets agents search in natural language ("low-premium HMO in Miami with dental") instead of clicking through filters.
- **Enrollment:** Pre-fills forms, validates eligibility rules, and flags missing fields before submission.
- **Live Calls:** Listens to the conversation via browser mic, auto-fills lead data from speech, surfaces Medicare term explanations when prospects ask questions, runs drug coverage lookups when medications are mentioned, and flags CMS compliance violations in real time.
- **Post-Interaction:** Generates CRM notes, drafts personalized follow-up emails with plan comparisons, and queues next-best-action tasks — all for the agent to review and approve.

The agent is **ambient** — it reads page context, understands what the agent is doing, and offers the right assistance at the right moment without being prompted.

---

## Existing Codebase Summary

### Tech Stack
- **Frontend:** React 19 + TypeScript 5.9 + Vite 7.2 + Tailwind CSS 4.1
- **Backend:** Node 20 + Express 5 + TypeScript
- **Database:** MongoDB (with JSON fallback)
- **AI:** LangChain 1.3.5 + LangGraph 1.2.9 + Anthropic SDK (Claude) + Ollama (local)
- **Vector Search:** Qdrant + BM25 hybrid retrieval

### Existing AI Agents (in `techsales-api/src/ai/agents/`)
All use `createReactAgent` from `@langchain/langgraph/prebuilt`:
- `chatAgent.ts` — Member chat with SSE streaming (reference pattern for new agents)
- `recommendAgent.ts` — Lead-triggered plan recommendations
- `explainAgent.ts` — Plan explanation (agent/member modes)
- `searchAgent.ts` — Natural-language plan search
- `compareAgent.ts` — Side-by-side plan comparison
- `drugCoverageAgent.ts` — Drug formulary Q&A
- `echoAgent.ts` — Smoke test

### Existing AI Tools (in `techsales-api/src/ai/tools/`)
Reuse these — do NOT rebuild:
- `searchPlans.tool.ts` — Search plan catalogue by filters
- `checkDrugCoverage.tool.ts` — Check drug formulary coverage per plan
- `comparePlans.tool.ts` — Compare 2-4 plans side by side
- `calcSavings.tool.ts` — Estimate annual cost/savings
- `getLeadDetails.tool.ts` — Fetch full lead profile by ID
- `getMemberPlan.tool.ts` — Fetch member's current plan

### Key Existing Files
- `techsales-api/src/ai/llm/chatModel.ts` — LLM provider switch (Anthropic/Ollama). Use `getChatModel()`.
- `techsales-api/src/ai/llm/callbacks.ts` — `AuditCallbackHandler` for logging AI interactions.
- `techsales-api/src/routes/ai.routes.ts` — All AI endpoints. Gated by `AI_ENABLED` flag + rate limiter + token cap.
- `techsales-api/src/routes/index.ts` — Main router. Mount new routes here.
- `techsales-app/src/services/aiService.ts` — Frontend AI client (POST + SSE pattern).
- `techsales-app/src/components/chat/ChatWidget.tsx` — Existing SSE chat UI (reference for streaming pattern).
- `techsales-app/src/components/layout/Layout.tsx` — Main app shell. CallPanel goes here.
- `techsales-app/src/App.tsx` — Router + context providers. Add CallProvider here.
- `techsales-app/src/context/AuthContext.tsx` — Auth + RBAC context.
- `techsales-app/src/pages/leads/LeadForm.tsx` — Lead create/edit form. Primary target for auto-fill.
- `techsales-app/src/components/tagging/DrugSearch.tsx` — Drug tagging component. Needs imperative add method.
- `techsales-app/src/components/tagging/ProviderSearch.tsx` — Provider tagging. Needs imperative add.
- `techsales-app/src/components/tagging/PharmacySearch.tsx` — Pharmacy tagging. Needs imperative add.

### Data Models
- **Leads:** firstName, lastName, dob, email, phone, address, zip/state/county/city, medicareNumber, medicaidId, partADate, partBDate, leadStatus (6-stage), taggedDrugs[], taggedProviders[], taggedPharmacies[]
- **Plans:** 80+ plans, 5 carriers, types: MAPD/MA/PDP/Medsup/ANC, subtypes: HMO/PPO/POS/RPPO/PDP/DSNP/CSNP/ISNP/Medigap
- **Drugs:** formulary with tier, dosage forms, frequencies, prior auth, step therapy, quantity limits
- **AI Interactions:** Audit log of every AI call (kind, input, output, tokens, latency)

---

## Architecture: The App Context Bus

The core architectural idea: a **shared React context** between the Copilot Panel and every page. The panel knows what page the agent is on, what form fields exist, what's already filled, and what actions are available. The AI dispatches actions through this context, and the target page reacts.

```
                        ┌──────────────────────────────────┐
                        │        CallContext (React)        │
                        │  - current route & page state     │
                        │  - registered form fields         │
                        │  - extracted entities              │
                        │  - pending AI actions              │
                        └──────┬───────────┬───────────────┘
                               │           │
              ┌────────────────┘           └────────────────┐
              ▼                                             ▼
   ┌─────────────────┐                          ┌──────────────────┐
   │   CallPanel.tsx  │                          │  Any Page (e.g.  │
   │  (side panel)    │                          │  LeadForm.tsx)   │
   │  - transcript    │   AI actions flow        │  - registers     │
   │  - info cards    │   ──────────────►        │    fields        │
   │  - compliance    │                          │  - consumes      │
   │  - entity list   │                          │    fill_field,   │
   │                  │                          │    add_drug etc  │
   └─────────────────┘                          └──────────────────┘
              ▲
              │ SSE events
   ┌─────────────────────┐
   │  Backend AI Agent    │
   │  callAnalysisAgent   │
   │  (LangGraph ReAct)   │
   └─────────────────────┘
```

### How Pages Participate

Each page that wants AI assistance registers itself with CallContext on mount:

```typescript
// Example: LeadForm registers its capabilities
registerPage({
  route: '/leads/LEAD-005/edit',
  pageType: 'lead_form',
  formFields: ['firstName', 'lastName', 'dateOfBirth', 'zipCode', 'drugs', ...],
  currentData: { firstName: 'Robert', zipCode: '', drugs: [] },
  capabilities: ['fill_field', 'add_drug', 'add_provider', 'add_pharmacy'],
});
```

The AI receives this context with every transcript chunk and knows exactly what actions are possible on the current screen.

---

## Implementation Plan — All Files

### NEW FILES TO CREATE

#### Frontend

| # | File | Purpose |
|---|------|---------|
| 1 | `techsales-app/src/context/CallContext.tsx` | Global state: call lifecycle, page registration, AI action dispatch, entity accumulation |
| 2 | `techsales-app/src/components/call/CallPanel.tsx` | Collapsible right-side panel: transcript, waveform, info cards, compliance alerts, entity summary |
| 3 | `techsales-app/src/components/call/CallWaveform.tsx` | CSS-animated audio waveform bars (listening indicator) |
| 4 | `techsales-app/src/components/call/InfoCard.tsx` | Proactive knowledge cards (Medicare terms, plan links, drug results) |
| 5 | `techsales-app/src/components/call/ComplianceAlert.tsx` | Red compliance violation banner with rule + correction |
| 6 | `techsales-app/src/components/call/ActionFeed.tsx` | Scrolling feed of AI actions taken (auto-fill confirmations, lookups, alerts) |
| 7 | `techsales-app/src/components/call/EntitySummary.tsx` | Collapsible section showing accumulated entities (drugs, providers, zip, etc.) |
| 8 | `techsales-app/src/hooks/useSpeechRecognition.ts` | Web Speech API wrapper: start/stop, interim/final results, auto-restart, chunk batching |
| 9 | `techsales-app/src/hooks/useCallAnalysis.ts` | SSE client: sends transcript chunks + page context to backend, receives action events |
| 10 | `techsales-app/src/services/callService.ts` | API client for `/api/ai/call/*` endpoints |
| 11 | `techsales-app/src/types/call.ts` | Type definitions: CallState, AiAction, TranscriptChunk, ExtractedEntities, InfoCard, ComplianceFlag, PageRegistration |

#### Backend

| # | File | Purpose |
|---|------|---------|
| 12 | `techsales-api/src/ai/agents/callAnalysisAgent.ts` | Core LangGraph ReAct agent. Processes transcript chunks with page context. Decides actions + tool calls. SSE streaming (same pattern as chatAgent.ts). |
| 13 | `techsales-api/src/ai/tools/complianceCheck.tool.ts` | CMS compliance scanner: regex for known violations + LLM for nuanced cases |
| 14 | `techsales-api/src/ai/tools/medicareKnowledge.tool.ts` | Static Medicare glossary lookup (CSNP, DSNP, AEP, LIS, IRMAA, etc.). Returns description + plan link when zip is known. |
| 15 | `techsales-api/src/routes/call.routes.ts` | Routes: POST `/analyze` (SSE), POST `/end` |
| 16 | `techsales-api/src/controllers/call.controller.ts` | Controller: validate input, set SSE headers, stream agent events |
| 17 | `techsales-api/src/ai/types/call.types.ts` | Backend type definitions for call analysis |

### FILES TO MODIFY

| # | File | Change |
|---|------|--------|
| 18 | `techsales-app/src/App.tsx` | Wrap app in `<CallProvider>` |
| 19 | `techsales-app/src/components/layout/Layout.tsx` | Add `<CallPanel />` to layout, adjust main content width when panel is open |
| 20 | `techsales-app/src/components/layout/Header.tsx` | Add "Start Call" / "End Call" button in toolbar |
| 21 | `techsales-app/src/pages/leads/LeadForm.tsx` | Add page registration + AI action consumption (fill_field, add_drug, add_provider, add_pharmacy) |
| 22 | `techsales-app/src/pages/leads/LeadDetail.tsx` | Register page for proactive recommendation trigger |
| 23 | `techsales-app/src/pages/plans/PlanList.tsx` | Register page for NL search integration |
| 24 | `techsales-app/src/pages/enrollment/EnrollmentForm.tsx` | Register page for form pre-fill + validation |
| 25 | `techsales-app/src/components/tagging/DrugSearch.tsx` | Expose imperative `addDrugByName(name, dosage?, frequency?)` method |
| 26 | `techsales-app/src/components/tagging/ProviderSearch.tsx` | Expose imperative `addProviderByName(name)` method |
| 27 | `techsales-app/src/components/tagging/PharmacySearch.tsx` | Expose imperative `addPharmacyByName(name)` method |
| 28 | `techsales-api/src/ai/tools/index.ts` | Export new tools: complianceCheckTool, medicareKnowledgeTool |
| 29 | `techsales-api/src/routes/index.ts` | Mount callRouter under `/api/ai/call` |
| 30 | `techsales-api/src/routes/ai.routes.ts` | Import and mount call routes |

---

## Detailed Specifications

### 1. CallContext State Shape

```typescript
interface CallState {
  isCallActive: boolean;
  isCallPanelOpen: boolean;
  callId: string | null;
  leadId: string | null;
  callStartTime: number | null;
  currentPage: PageRegistration | null;

  transcript: TranscriptChunk[];
  extractedEntities: ExtractedEntities;
  pendingActions: AiAction[];
  actionLog: AiAction[];           // completed actions for the feed
  complianceFlags: ComplianceFlag[];
  infoCards: InfoCard[];
}

interface TranscriptChunk {
  id: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

interface ExtractedEntities {
  drugs: { name: string; dosage?: string; frequency?: string }[];
  providers: { name: string; specialty?: string }[];
  pharmacies: { name: string }[];
  zipCode: string | null;
  dateOfBirth: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  medicareNumber: string | null;
  medicaidNumber: string | null;
  planTypeMentions: string[];
  stateCounty: { state?: string; county?: string } | null;
}

interface PageRegistration {
  route: string;
  pageType: 'lead_form' | 'lead_detail' | 'plan_list' | 'plan_detail' | 'enrollment_form' | 'dashboard' | 'other';
  formFields?: string[];
  currentData?: Record<string, unknown>;
  capabilities: string[];
}
```

### 2. AI Action Types

```typescript
type AiAction =
  // Form interaction
  | { type: 'fill_field'; field: string; value: string | boolean; confidence: number }
  | { type: 'add_drug'; drugName: string; dosage?: string; frequency?: string }
  | { type: 'add_provider'; providerName: string }
  | { type: 'add_pharmacy'; pharmacyName: string }

  // Knowledge surfacing
  | { type: 'show_info'; topic: string; title: string; content: string; links?: { label: string; url: string }[] }
  | { type: 'show_plans_link'; planType: string; zipCode: string; count?: number; url: string }
  | { type: 'show_drug_coverage'; drugName: string; results: unknown }
  | { type: 'show_recommendation'; plans: unknown[] }

  // Compliance
  | { type: 'compliance_flag'; phrase: string; rule: string; suggestion: string }

  // Agent assist
  | { type: 'suggested_response'; question: string; answer: string }
  | { type: 'navigate_suggestion'; url: string; reason: string };
```

### 3. SSE Event Types (Backend → Frontend)

```typescript
type CallStreamEvent =
  | { type: 'actions'; actions: AiAction[] }
  | { type: 'entities'; entities: Partial<ExtractedEntities> }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: unknown; latencyMs: number }
  | { type: 'thinking'; content: string }
  | { type: 'error'; error: string };
```

### 4. Backend API Contract

```
POST /api/ai/call/analyze
Content-Type: application/json
Accept: text/event-stream

Request Body:
{
  "callId": "string",
  "leadId": "string | null",
  "chunk": "string",                    // latest transcript chunk
  "fullTranscript": "string",           // all chunks concatenated
  "chunkIndex": "number",
  "pageContext": {
    "route": "string",
    "pageType": "string",
    "formFields": ["string"],
    "currentData": {},
    "capabilities": ["string"]
  },
  "extractedEntities": {},              // accumulated so far
  "userId": "string | null"
}

Response: SSE stream of CallStreamEvent
```

```
POST /api/ai/call/end
Content-Type: application/json

Request Body:
{
  "callId": "string",
  "leadId": "string | null",
  "fullTranscript": "string",
  "extractedEntities": {},
  "complianceFlags": [],
  "actionLog": [],
  "userId": "string | null"
}

Response JSON:
{
  "summary": "string",
  "crmNote": "string",
  "followUps": [{ "task": "string", "dueDate": "string", "type": "string" }],
  "draftEmail": "string",
  "complianceReport": { "flags": [], "remediation": "string" } | null
}
```

### 5. callAnalysisAgent System Prompt

```
You are Sales IQ Copilot — an ambient AI assistant for Medicare sales agents.
You observe live phone conversations and act on the application to help the agent.

You receive transcript chunks as they are spoken. For each chunk you must:

1. EXTRACT ENTITIES — Identify new information:
   - Personal: firstName, lastName, dateOfBirth, phone, email
   - Location: zipCode (5 digits)
   - Medicare: medicareNumber (MBI format), medicaidNumber, partADate, partBDate
   - Medications: drug names with dosage and frequency
   - Healthcare: provider names, pharmacy names
   - Plan interest: any mention of plan types (CSNP, DSNP, MAPD, HMO, PPO, Medigap, PDP)

2. DECIDE ACTIONS based on the current page context:
   - If page has a form field for an extracted entity AND that field is currently empty → emit fill_field
   - If a drug is mentioned AND page supports add_drug → emit add_drug
   - If the prospect asks about a Medicare term → emit show_info with concise explanation
   - If a plan type + zip code are both known → emit show_plans_link with filtered URL
   - If a specific drug + candidate plans exist → call check_drug_coverage tool → emit show_drug_coverage
   - If the agent uses CMS-prohibited language → emit compliance_flag immediately

3. USE TOOLS when data lookup is needed:
   - search_plans: when plan type + geography known, find matching plans
   - check_drug_coverage: when drug + plan(s) identified, check formulary
   - compare_plans: when prospect wants to compare options
   - get_lead_details: at call start, load existing lead profile
   - calc_savings: when cost question arises
   - medicare_knowledge: when prospect asks about a term/concept
   - compliance_check: scan agent speech for CMS violations

CURRENT PAGE CONTEXT:
Route: {{route}}
Page type: {{pageType}}
Form fields: {{formFields}}
Currently filled data: {{currentData}}
Available actions: {{capabilities}}
Previously extracted entities: {{extractedEntities}}

RULES:
- Only emit fill_field for fields listed in formFields.
- Only emit fill_field if the field is currently empty or has a different value.
- Do NOT re-extract entities already in extractedEntities.
- Drug names must be specific (brand/generic name like "Eliquis", not "blood thinner").
- show_info content must be 2-3 sentences, plain English.
- Compliance flags must cite the specific CMS rule violated.
- Return a JSON object: { "entities": {...}, "actions": [...] }
- Return { "entities": {}, "actions": [] } if nothing actionable in this chunk.
```

### 6. Medicare Knowledge Base Entries

The `medicareKnowledge.tool.ts` should include at minimum:

| Term | Related Plan Types |
|------|--------------------|
| CSNP | Chronic Condition Special Needs Plan |
| DSNP | Dual Eligible Special Needs Plan |
| ISNP | Institutional Special Needs Plan |
| MAPD | Medicare Advantage Prescription Drug |
| MA | Medicare Advantage (no drug) |
| PDP | Prescription Drug Plan (Part D) |
| Medigap / Medicare Supplement | Medigap |
| HMO | Health Maintenance Organization |
| PPO | Preferred Provider Organization |
| AEP | Annual Enrollment Period (Oct 15 – Dec 7) |
| OEP | Open Enrollment Period (Jan 1 – Mar 31) |
| SEP | Special Enrollment Period |
| LIS / Extra Help | Low Income Subsidy |
| IRMAA | Income-Related Monthly Adjustment Amount |
| Part A | Hospital Insurance |
| Part B | Medical Insurance |
| Part D | Prescription Drug Coverage |
| MBI | Medicare Beneficiary Identifier |
| SOA | Scope of Appointment |
| Star Rating | CMS quality rating (1-5 stars) |

When zipCode is available, return a `planSearchUrl` like `/plans?type=CSNP&zip=33101`.

### 7. CMS Compliance Rules

Minimum patterns for `complianceCheck.tool.ts`:

| Pattern | Rule | Suggestion |
|---------|------|------------|
| "best plan" | No superlatives in Medicare marketing | "a plan that may fit your needs" |
| "guarantee" / "guaranteed" | Cannot guarantee benefits or outcomes | "this plan includes..." |
| "you need this" / "you must" | Cannot pressure beneficiaries | Present options neutrally |
| "better than Medicare" | Cannot disparage Original Medicare | Compare specific benefits |
| "everyone chooses this" | Cannot use bandwagon pressure | "many people in your area consider..." |
| "act now" / "limited time" | Cannot create false urgency outside enrollment windows | State enrollment period facts |
| "free" (for plans with premiums) | Cannot misrepresent costs | "this plan has a $0 premium" (if true) |
| Unsolicited health questions | Cannot ask about health status for non-SNP plans | Only ask if relevant to SNP eligibility |

### 8. CallPanel UI Specification

```
┌─────────────────────────────────────┐
│ 📞 Call with Robert Anderson  02:34 │  ← header: lead name + timer
│                        [_] [End]    │  ← collapse + end buttons
├─────────────────────────────────────┤
│                                     │
│  ~~~~ Live Transcript ~~~~          │
│                                     │
│  [00:12] "Hi my name is Robert      │
│   Anderson"                         │
│  [00:18] "I live in zip 33101"      │
│  [00:25] "I take Eliquis 5mg        │
│   twice a day"                      │
│  [00:34] "What is a CSNP?"          │  ← highlighted: plan type mention
│  [00:42] ░░░░░░░ listening... ░░░░░ │  ← waveform animation
│                                     │
├─────────────────────────────────────┤
│                                     │
│  ~~~~ AI Actions ~~~~               │
│                                     │
│  ✅ Filled firstName → Robert       │  ← green: auto-fill confirmation
│  ✅ Filled lastName → Anderson      │
│  ✅ Filled zipCode → 33101          │
│  💊 Added drug: Eliquis 5mg 2x/day  │  ← blue: drug added
│                                     │
│  ┌─ ℹ️ What is CSNP? ─────────────┐ │  ← info card
│  │ A Chronic Condition Special     │ │
│  │ Needs Plan for people with      │ │
│  │ severe chronic conditions...    │ │
│  │                                 │ │
│  │ 🔗 View 8 CSNP plans in 33101  │ │  ← clickable link
│  └─────────────────────────────────┘ │
│                                     │
│  🚨 COMPLIANCE: You said "best      │  ← red: violation
│  plan" — CMS prohibits              │
│  superlatives. Say "a plan that     │
│  may fit your needs" instead.       │
│                                     │
├─────────────────────────────────────┤
│ ▸ Extracted Entities (6)            │  ← collapsible
│   Name: Robert Anderson             │
│   DOB: 03/15/1955                   │
│   Zip: 33101 (FL, Miami-Dade)       │
│   Drugs: Eliquis 5mg                │
│   Plan Interest: CSNP               │
└─────────────────────────────────────┘
```

**Collapsed state:** 48px-wide strip on the right with mic icon + waveform + compliance badge count.

**Panel width:** 380px. Main content shifts left with `transition-all` when panel opens.

---

## Build Order

### Phase 1: Foundation (Day 1)
1. Create type definitions (`types/call.ts`)
2. Create `CallContext.tsx` with full state management
3. Create `useSpeechRecognition.ts` hook
4. Create `CallPanel.tsx` shell with transcript display + `CallWaveform.tsx`
5. Modify `Layout.tsx` to include CallPanel
6. Modify `App.tsx` to wrap in `CallProvider`
7. Add "Start Call" button to `Header.tsx`
8. **Test:** Mic works, transcript appears in panel

### Phase 2: Backend Agent (Day 2)
1. Create `medicareKnowledge.tool.ts` with full glossary
2. Create `complianceCheck.tool.ts` with CMS patterns
3. Create `callAnalysisAgent.ts` (LangGraph ReAct, SSE streaming)
4. Create `call.routes.ts` + `call.controller.ts`
5. Export new tools in `tools/index.ts`
6. Mount routes in `routes/index.ts`
7. **Test:** POST a transcript chunk via curl, get action events back

### Phase 3: Action Dispatch (Day 3)
1. Create `useCallAnalysis.ts` hook (sends chunks, receives SSE)
2. Create `callService.ts` API client
3. Wire action processing in `CallContext.tsx` (pendingActions → pages)
4. Add page registration to `LeadForm.tsx`
5. Implement `fill_field` handling in LeadForm
6. Expose `addDrugByName` in `DrugSearch.tsx` and wire `add_drug` action
7. Expose `addProviderByName` in `ProviderSearch.tsx`
8. Expose `addPharmacyByName` in `PharmacySearch.tsx`
9. **Test:** Say "my name is John, zip 33101" → form fills automatically

### Phase 4: Info Cards + Compliance (Day 4)
1. Create `InfoCard.tsx`, `ComplianceAlert.tsx`, `ActionFeed.tsx`, `EntitySummary.tsx`
2. Wire `show_info` action rendering in CallPanel
3. Wire `show_plans_link` with navigation
4. Wire `compliance_flag` rendering
5. Wire `show_drug_coverage` cards
6. Register additional pages: `LeadDetail.tsx`, `PlanList.tsx`, `EnrollmentForm.tsx`
7. **Test:** Say "what is CSNP" → info card with plan link. Say "best plan" → compliance alert.

### Phase 5: Post-Call + Polish (Day 5)
1. Implement `POST /api/ai/call/end` endpoint (summary, CRM note, follow-ups, email draft)
2. Build post-call review UI in CallPanel (timeline of outputs, edit + approve)
3. Panel collapse/expand animation
4. Call duration timer
5. Error handling (mic denied, SSE disconnect, LLM timeout)
6. **Test full demo flow end-to-end**

---

## Demo Script

Login as `johndoe11` (Sales Agent).

1. Navigate to **Leads → New Lead**
2. Click **"Start Call"** in header → panel opens with waveform
3. Speak: *"Hi, I'm calling about Medicare plans. My name is Robert Anderson."*
   → Panel shows transcript. Form auto-fills: firstName=Robert, lastName=Anderson
4. Speak: *"My date of birth is March 15, 1955 and I live in zip code 33101"*
   → Form fills: DOB, zipCode → auto-triggers zip lookup → state=FL, county=Miami-Dade, city=Miami
5. Speak: *"I take Eliquis 5mg twice daily and Metformin 500mg once a day"*
   → Drug tags appear: Eliquis (5mg, twice daily), Metformin (500mg, once daily)
6. Speak: *"What is a CSNP plan?"*
   → Blue info card: "Chronic Condition Special Needs Plan..." + link "View CSNP plans in 33101"
7. Click the plan link → navigates to PlanList filtered by CSNP + 33101
8. Speak: *"Does the Carrier 1 CSNP cover my Eliquis?"*
   → AI calls check_drug_coverage → card: Tier 3, $47 copay, no prior auth
9. Agent says: *"This is the best plan for you"*
   → Red compliance alert: "CMS prohibits superlatives. Say 'a plan that may fit your needs'"
10. Click **"End Call"** → Post-call summary with CRM note, follow-ups, email draft
11. Review + approve → Lead record updated with all extracted data

---

## Constraints & Rules

- **Do NOT create a chatbot.** The copilot acts without being asked.
- **Reuse existing tools.** Do not rebuild search_plans, check_drug_coverage, etc.
- **Follow existing patterns.** New agents must match chatAgent.ts structure (createReactAgent + streamEvents + SSE + AuditCallbackHandler).
- **Carrier names are sanitized.** Use "Carrier 1"..."Carrier 7" in all prompts and outputs. Never invent real carrier names.
- **Drug data is synthetic.** Always include a disclaimer that formulary data is simulated.
- **No new env vars needed.** Uses existing AI_ENABLED, AI_LLM_PROVIDER, AI_MODEL_DEFAULT, ANTHROPIC_API_KEY, etc.
- **Web Speech API only.** No third-party speech-to-text services. Free, built-in, works in Chrome.
- **Panel must be collapsible.** Never block the agent's workflow.
- **All AI actions are non-destructive.** Auto-fills are visible and editable. Nothing saves without agent confirmation.
