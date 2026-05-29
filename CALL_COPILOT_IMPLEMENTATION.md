# Live Call Copilot — Implementation Guide

## What We're Building

A collapsible side panel that activates when an agent takes a call. It shows a live transcript with animation and feeds every utterance to an AI agent. The AI agent **interacts with the running application** — auto-filling lead forms, answering prospect questions with contextual info cards, surfacing relevant plan links, and flagging compliance risks. It is not a chatbot. It is an ambient, context-aware assistant that watches the conversation and acts on the UI.

---

## Core Concept: The App Context Bus

The key architectural idea is a **shared context** between the Call Panel and every page in the app. The Call Panel doesn't operate in isolation — it knows what page the agent is on, what form fields exist, what data is already filled, and what lead/plan is being viewed. When the AI decides to act, it dispatches actions through this context, and the target page reacts.

```
Browser Mic → Transcript chunks → Backend AI Agent → Action events (SSE)
                                                         ↓
                                          CallContext (React Context)
                                                         ↓
                                    ┌────────────────────┼────────────────────┐
                                    ↓                    ↓                    ↓
                              LeadForm.tsx         PlanList.tsx        DrugSearch.tsx
                              (auto-fills)       (shows link)        (adds drug)
```

---

## File-by-File Implementation Plan

### FRONTEND — New Files

#### 1. `techsales-app/src/context/CallContext.tsx`

This is the brain. Every page subscribes to it. The Call Panel writes to it.

```typescript
// State shape
interface CallState {
  isCallActive: boolean;
  isCallPanelOpen: boolean;
  callId: string | null;
  leadId: string | null;             // which lead this call is about
  currentRoute: string;              // "/leads/LEAD-005/edit" etc.
  currentFormData: Record<string, unknown> | null;  // snapshot of whatever form is on screen

  // Accumulated during call
  transcript: TranscriptChunk[];
  extractedEntities: ExtractedEntities;
  aiActions: AiAction[];             // action log for the timeline
  complianceFlags: ComplianceFlag[];
  infoCards: InfoCard[];             // proactive knowledge cards
}

interface ExtractedEntities {
  drugs: { name: string; dosage?: string; frequency?: string }[];
  providers: { name: string; specialty?: string }[];
  pharmacies: { name: string }[];
  zipCode: string | null;
  dateOfBirth: string | null;
  firstName: string | null;
  lastName: string | null;
  planTypeMentions: string[];        // "CSNP", "HMO", "MAPD" etc.
  stateCounty: { state?: string; county?: string } | null;
}

// Actions the AI can dispatch to the app
type AiAction =
  | { type: 'fill_field'; field: string; value: string | boolean }
  | { type: 'add_drug'; drugName: string; dosage?: string; frequency?: string }
  | { type: 'add_provider'; providerName: string }
  | { type: 'add_pharmacy'; pharmacyName: string }
  | { type: 'show_info'; topic: string; title: string; content: string; links?: { label: string; url: string }[] }
  | { type: 'show_plans_link'; planType: string; zipCode: string; url: string }
  | { type: 'compliance_flag'; phrase: string; rule: string; suggestion: string }
  | { type: 'navigate'; url: string; reason: string }
  | { type: 'show_drug_coverage'; drugName: string; results: unknown }
  | { type: 'suggested_response'; question: string; answer: string };

// What each page registers so the AI knows what's on screen
interface PageRegistration {
  route: string;
  formFields?: string[];            // e.g. ["firstName", "lastName", "zipCode", "drugs"]
  currentData?: Record<string, unknown>;
  capabilities: string[];            // e.g. ["fill_field", "add_drug", "add_provider"]
}
```

**Context provider API:**

```typescript
interface CallContextValue {
  state: CallState;

  // Call lifecycle
  startCall: (leadId?: string) => void;
  endCall: () => void;
  togglePanel: () => void;

  // Page registration — each page calls this on mount
  registerPage: (reg: PageRegistration) => void;
  unregisterPage: () => void;
  updateFormSnapshot: (data: Record<string, unknown>) => void;

  // AI action consumption — pages subscribe to actions meant for them
  pendingActions: AiAction[];
  acknowledgeAction: (index: number) => void;
}
```

**How pages register:**

```typescript
// Inside LeadForm.tsx — on mount
const { registerPage, updateFormSnapshot, pendingActions, acknowledgeAction } = useCallContext();

useEffect(() => {
  registerPage({
    route: `/leads/${id}/edit`,
    formFields: Object.keys(initialFormData),
    capabilities: ['fill_field', 'add_drug', 'add_provider', 'add_pharmacy'],
  });
  return () => unregisterPage();
}, []);

// When form data changes, update the snapshot so AI knows what's already filled
useEffect(() => {
  updateFormSnapshot(formData);
}, [formData]);

// Process AI actions
useEffect(() => {
  for (let i = 0; i < pendingActions.length; i++) {
    const action = pendingActions[i];
    if (action.type === 'fill_field') {
      setFormData(prev => ({ ...prev, [action.field]: action.value }));
      acknowledgeAction(i);
    }
    if (action.type === 'add_drug') {
      // trigger the drug search + add flow programmatically
      handleAiDrugAdd(action.drugName, action.dosage, action.frequency);
      acknowledgeAction(i);
    }
  }
}, [pendingActions]);
```

---

#### 2. `techsales-app/src/components/call/CallPanel.tsx`

The collapsible side panel. Lives in `Layout.tsx` alongside the main content.

**Layout change:**

```typescript
// Layout.tsx — modified
export function Layout() {
  const { state } = useCallContext();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex">
        <main className={`flex-1 p-4 lg:p-6 transition-all ${state.isCallPanelOpen ? 'mr-[380px]' : ''}`}>
          <Outlet />
        </main>
        {state.isCallActive && <CallPanel />}
      </div>
      <footer>...</footer>
    </div>
  );
}
```

**CallPanel sections (top to bottom):**

1. **Call header** — lead name, call duration timer, collapse/expand button, end call button
2. **Live transcript** — scrolling area with waveform animation during speech. Each chunk shows timestamp + text. Highlighted keywords (drug names in blue, plan types in purple, compliance risks in red)
3. **AI actions feed** — cards that appear as the AI acts:
   - Green cards: "Filled firstName → Robert" (auto-fill confirmations)
   - Blue cards: info panels (e.g. "What is CSNP?" with description + plan link)
   - Red cards: compliance warnings
   - Purple cards: plan/drug lookup results
4. **Entity summary** — collapsible section showing accumulated entities (drugs, providers, zip, etc.)

**Key behaviors:**
- Panel slides in from the right (380px wide)
- Collapse = shrink to a thin 48px strip with just a mic icon + waveform animation
- Expand = full panel
- When collapsed, compliance flags show as a red badge count

---

#### 3. `techsales-app/src/hooks/useSpeechRecognition.ts`

Web Speech API wrapper hook.

```typescript
interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;           // current interim result
  finalizedChunks: TranscriptChunk[];
  start: () => void;
  stop: () => void;
  error: string | null;
}

interface TranscriptChunk {
  id: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}
```

**Implementation notes:**
- Use `webkitSpeechRecognition` with `continuous = true`, `interimResults = true`
- `lang = 'en-US'`
- On each `onresult` event, check `event.results[i].isFinal`
- Finalized results become chunks; interim results update a live preview
- Auto-restart on `onend` if call is still active (Speech API stops after silence)
- Debounce: accumulate finalized text for 2-3 seconds before sending to backend (avoids flooding)

---

#### 4. `techsales-app/src/hooks/useCallAnalysis.ts`

Manages the SSE connection to the backend analysis endpoint.

```typescript
interface UseCallAnalysisOptions {
  leadId: string | null;
  onAction: (action: AiAction) => void;
  onEntity: (entities: Partial<ExtractedEntities>) => void;
  onComplianceFlag: (flag: ComplianceFlag) => void;
  onInfoCard: (card: InfoCard) => void;
}

// Sends transcript chunks to backend, receives action events via SSE
function useCallAnalysis(opts: UseCallAnalysisOptions) {
  const sendChunk = async (chunk: TranscriptChunk, pageContext: PageRegistration | null) => {
    // POST to /api/ai/call/analyze with:
    // {
    //   callId, leadId, chunk, fullTranscript,
    //   pageContext: { route, formFields, currentData, capabilities },
    //   extractedEntities (accumulated so far)
    // }
    //
    // Backend responds with SSE stream of actions
  };

  return { sendChunk, isAnalyzing };
}
```

**Critical: we send `pageContext` with every chunk.** This tells the AI what page the agent is on, what fields exist, what data is already filled, and what actions are available. The AI uses this to decide what to do.

---

#### 5. `techsales-app/src/components/call/CallWaveform.tsx`

Visual feedback during active listening. Simple CSS animation — 3-5 vertical bars that animate height when `isListening` is true. No library needed.

---

#### 6. `techsales-app/src/components/call/InfoCard.tsx`

Renders the proactive knowledge cards the AI shows (e.g. "What is CSNP?").

```typescript
interface InfoCardProps {
  title: string;       // "What is CSNP?"
  content: string;     // "A Chronic Condition Special Needs Plan is..."
  links?: { label: string; url: string }[];  // "View 12 CSNP plans in 33101"
  type: 'info' | 'drug' | 'plan' | 'compliance';
}
```

---

### FRONTEND — Modified Files

#### 7. `techsales-app/src/App.tsx`

Wrap the app in `CallProvider`:

```typescript
function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <CallProvider>      {/* ← NEW */}
            <AppRoutes />
          </CallProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
```

#### 8. `techsales-app/src/components/layout/Layout.tsx`

Add the CallPanel to the layout (see section 2 above).

#### 9. `techsales-app/src/components/layout/Header.tsx`

Add a "Start Call" / "End Call" button in the header toolbar. When clicked:
- If on a lead detail/edit page, auto-captures the leadId from the route
- Opens the Call Panel
- Starts speech recognition

#### 10. `techsales-app/src/pages/leads/LeadForm.tsx`

Add page registration + AI action processing (see section 1 above). The form becomes "AI-fillable."

Specific field mappings the AI can fill:
- `firstName`, `lastName` — from "Hi, my name is Robert Anderson"
- `dateOfBirth` — from "I was born March 15, 1955" or "I'm 71 years old" (calculate)
- `zipCode` → auto-triggers existing `handleZipLookup` which fills state/county/city
- `phone`, `email` — from "you can reach me at..."
- `medicaidNumber` — from "my Medicaid number is..."
- `isDualEligible` — from context (mentions Medicaid, mentions both Medicare and Medicaid)
- Drugs — triggers `DrugSearch` component's `addDrug` programmatically
- Providers — triggers `ProviderSearch` component's search
- Pharmacies — triggers `PharmacySearch` component's search

#### 11. `techsales-app/src/components/tagging/DrugSearch.tsx`

Expose an imperative method (via ref or callback) so the CallContext can programmatically add a drug:

```typescript
// Add to DrugSearch props
onAiDrugAdd?: (drugName: string, dosage?: string, frequency?: string) => void;

// Inside component: when called, run the search, find the best match, add it
```

Same pattern for `ProviderSearch.tsx` and `PharmacySearch.tsx`.

---

### BACKEND — New Files

#### 12. `techsales-api/src/ai/agents/callAnalysisAgent.ts`

The core AI agent. This is a ReAct agent (same pattern as `chatAgent.ts`) with a specialized system prompt.

**System prompt structure:**

```
You are an ambient call copilot for a Medicare sales agent. You are listening
to a live phone call between the agent and a Medicare beneficiary.

You receive transcript chunks as they are spoken. For each chunk, you must:

1. EXTRACT ENTITIES — Identify any new information: names, DOB, medications,
   providers, pharmacies, zip codes, Medicare/Medicaid numbers, plan types.

2. DECIDE ACTIONS — Based on what was said AND the current page context:
   - If the agent is on the Lead Form and the prospect mentions personal info,
     emit fill_field actions for the relevant form fields.
   - If the prospect mentions a drug, emit add_drug with the drug name.
   - If the prospect asks a question about a Medicare term (CSNP, DSNP, MAPD,
     HMO, PPO, Medigap, Part D, LIS, IRMAA, AEP, OEP, SEP, etc.), emit
     show_info with a clear explanation. If a zip code is known, include a
     link to relevant plans.
   - If the agent says something that violates CMS marketing rules, emit
     compliance_flag.

3. USE TOOLS when needed:
   - search_plans: when a plan type + geography is known
   - check_drug_coverage: when a specific drug is mentioned and candidate plans exist
   - get_lead_details: to load existing lead data at call start
   - compare_plans: when the prospect asks to compare options

CURRENT PAGE CONTEXT:
Route: {route}
Available form fields: {formFields}
Currently filled: {currentData}
Available actions: {capabilities}
Already extracted entities: {extractedEntities}

RULES:
- Only emit fill_field for fields that exist on the current page.
- Don't re-emit actions for entities you've already extracted.
- For drug names, use the exact brand/generic name (e.g. "Eliquis", not "blood thinner").
- For show_info, be concise (2-3 sentences). Include a plan link when possible.
- Compliance flags: watch for superlatives ("best plan"), guarantees ("guaranteed"),
  cherry-picking ("this plan is better than Medicare"), scare tactics, unsolicited
  contact claims.

Respond with a JSON array of actions. Return [] if no action needed for this chunk.
```

**Why ReAct with tools (not just a prompt)?**

For simple extraction → structured output (JSON mode) is enough.
For plan lookups, drug coverage, comparison → the agent needs to call your existing tools. When the prospect says "does that plan cover Eliquis?", the AI must call `check_drug_coverage` with real data. This is the agentic part.

**Implementation:**

```typescript
// Follow the exact same pattern as chatAgent.ts:
// createReactAgent + streamEvents + SSE

export async function* streamCallAnalysis(
  input: CallAnalysisInput,
  signal?: AbortSignal,
): AsyncIterable<CallStreamEvent> {
  // 1. Build system prompt with page context injected
  // 2. Create ReAct agent with tools
  // 3. Stream events, translating to our action union
  // 4. Flush audit row
}

interface CallAnalysisInput {
  callId: string;
  leadId: string | null;
  chunk: string;
  fullTranscript: string;
  pageContext: {
    route: string;
    formFields: string[];
    currentData: Record<string, unknown>;
    capabilities: string[];
  };
  extractedEntities: ExtractedEntities;
  userId?: string;
}

// Events streamed back to frontend
type CallStreamEvent =
  | { type: 'actions'; actions: AiAction[] }
  | { type: 'entities'; entities: Partial<ExtractedEntities> }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: unknown }
  | { type: 'thinking'; content: string }  // optional: show what AI is considering
  | { type: 'error'; error: string };
```

---

#### 13. `techsales-api/src/ai/tools/complianceCheck.tool.ts`

New tool for the call analysis agent.

```typescript
// Input: { text: string }
// Output: { violations: { phrase: string, rule: string, suggestion: string }[] }

// Implementation: combination of regex for known forbidden phrases + LLM judgment
// for nuanced violations.

const CMS_FORBIDDEN_PATTERNS = [
  { pattern: /\bbest plan\b/i, rule: 'CMS prohibits superlatives in Medicare marketing', suggestion: 'Say "a plan that may fit your needs" instead' },
  { pattern: /\bguarantee/i, rule: 'Cannot guarantee benefits or outcomes', suggestion: 'Say "this plan includes..." instead' },
  { pattern: /\byou need this/i, rule: 'Cannot pressure beneficiaries', suggestion: 'Present options neutrally' },
  { pattern: /\bbetter than medicare\b/i, rule: 'Cannot disparage Original Medicare', suggestion: 'Compare specific benefits instead' },
  // ... more patterns from CMS Medicare Communications and Marketing Guidelines
];
```

---

#### 14. `techsales-api/src/ai/tools/medicareKnowledge.tool.ts`

New tool — a lookup for Medicare terminology and concepts.

```typescript
// Input: { topic: string, zipCode?: string }
// Output: { title, description, relatedPlanTypes?, planSearchUrl? }

// This is a static knowledge base (no LLM needed for the lookup itself).
// The LLM decides WHEN to call it; the tool returns the content.

const MEDICARE_KNOWLEDGE: Record<string, { title: string; description: string; relatedPlanTypes?: string[] }> = {
  'CSNP': {
    title: 'Chronic Condition Special Needs Plan (C-SNP)',
    description: 'A type of Medicare Advantage plan designed for people with specific severe or disabling chronic conditions such as diabetes, ESRD, heart failure, or HIV/AIDS. C-SNPs provide tailored benefits, specialized provider networks, and care coordination focused on managing the qualifying condition.',
    relatedPlanTypes: ['CSNP'],
  },
  'DSNP': {
    title: 'Dual Eligible Special Needs Plan (D-SNP)',
    description: 'A Medicare Advantage plan for people who are eligible for both Medicare and Medicaid (dual eligible). D-SNPs coordinate benefits between both programs, often with $0 premiums and extra benefits like dental, vision, hearing, and transportation.',
    relatedPlanTypes: ['DSNP'],
  },
  'MAPD': { ... },
  'AEP': { ... },
  'OEP': { ... },
  'SEP': { ... },
  'LIS': { ... },
  'IRMAA': { ... },
  'Part D': { ... },
  'Medigap': { ... },
  'HMO': { ... },
  'PPO': { ... },
  // ... full glossary
};
```

When zipCode is available and the topic maps to a plan type, the tool also returns:
```json
{
  "planSearchUrl": "/plans?type=CSNP&zip=33101",
  "planCount": 12
}
```

---

#### 15. `techsales-api/src/routes/call.routes.ts`

New route file.

```typescript
import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { analyzeChunkHandler, endCallHandler } from '../controllers/call.controller.js';

export const callRouter: Router = Router();

// Real-time chunk analysis — SSE response
callRouter.post('/analyze', asyncHandler(analyzeChunkHandler));

// End call — triggers post-call summary (future phase)
callRouter.post('/end', asyncHandler(endCallHandler));
```

Mount in `routes/index.ts` under `/api/ai/call/*`.

---

#### 16. `techsales-api/src/controllers/call.controller.ts`

```typescript
export async function analyzeChunkHandler(req: Request, res: Response): Promise<void> {
  // 1. Validate input (callId, chunk, pageContext, etc.)
  // 2. Set SSE headers
  // 3. Stream callAnalysisAgent events to client
  // Same SSE pattern as the chat controller
}
```

---

### BACKEND — Modified Files

#### 17. `techsales-api/src/ai/tools/index.ts`

Add new tool exports:

```typescript
export { complianceCheckTool } from './complianceCheck.tool.js';
export { medicareKnowledgeTool } from './medicareKnowledge.tool.js';
```

#### 18. `techsales-api/src/routes/index.ts`

Mount the call router:

```typescript
import { callRouter } from './call.routes.js';
// ...
router.use('/ai/call', callRouter);
```

---

## Data Flow — Step by Step

### Scenario: Agent is editing Lead LEAD-005. Prospect says "I take Eliquis 5mg twice daily and my zip is 33101. What is a CSNP?"

**Step 1 — Speech capture**
Browser mic captures: "I take Eliquis 5mg twice daily and my zip is 33101 what is a CSNP"

**Step 2 — Chunk sent to backend**
```json
POST /api/ai/call/analyze
{
  "callId": "call-abc-123",
  "leadId": "LEAD-005",
  "chunk": "I take Eliquis 5mg twice daily and my zip is 33101 what is a CSNP",
  "fullTranscript": "...all previous chunks... I take Eliquis 5mg twice daily...",
  "pageContext": {
    "route": "/leads/LEAD-005/edit",
    "formFields": ["firstName", "lastName", "zipCode", "city", "state", "county", "drugs", ...],
    "currentData": { "firstName": "Robert", "lastName": "", "zipCode": "", "drugs": [] },
    "capabilities": ["fill_field", "add_drug", "add_provider", "add_pharmacy"]
  },
  "extractedEntities": { "drugs": [], "firstName": "Robert" }
}
```

**Step 3 — LLM processes chunk**
The `callAnalysisAgent` receives this and reasons:
1. "Eliquis 5mg twice daily" → new drug entity → should call `add_drug` since the page supports it
2. "zip is 33101" → fill the zipCode field (it's empty in currentData)
3. "what is a CSNP" → prospect asked a question → call `medicareKnowledge` tool → show info card
4. Since we now have a zip + plan type mention → include plan link in the info card

**Step 4 — LLM calls tools**
- Calls `medicareKnowledge({ topic: "CSNP", zipCode: "33101" })` → gets description + plan URL
- Optionally calls `check_drug_coverage` if candidate plans exist

**Step 5 — SSE events streamed back**
```
data: {"type":"entities","entities":{"drugs":[{"name":"Eliquis","dosage":"5mg","frequency":"twice_daily"}],"zipCode":"33101","planTypeMentions":["CSNP"]}}

data: {"type":"actions","actions":[
  {"type":"fill_field","field":"zipCode","value":"33101"},
  {"type":"add_drug","drugName":"Eliquis","dosage":"5mg","frequency":"twice_daily"},
  {"type":"show_info","topic":"CSNP","title":"What is CSNP?","content":"A Chronic Condition Special Needs Plan designed for people with specific severe chronic conditions...","links":[{"label":"View CSNP plans in 33101","url":"/plans?type=CSNP&zip=33101"}]}
]}
```

**Step 6 — Frontend processes actions**
- `CallContext` receives actions, adds to `pendingActions`
- `LeadForm` picks up `fill_field` for zipCode → sets form field → triggers `handleZipLookup` which auto-fills state/county/city
- `LeadForm` picks up `add_drug` → programmatically triggers DrugSearch to search "Eliquis", find the match, add it with dosage/frequency
- `CallPanel` renders the CSNP info card with the plan link
- All three actions appear in the Call Panel's action feed with green/blue card styling

---

## LLM Usage Strategy

| Component | LLM Needed? | Model | Why |
|-----------|------------|-------|-----|
| Speech-to-Text | No | — | Web Speech API (free, built-in) |
| Entity extraction | Yes | Claude Haiku or Sonnet | Needs conversational understanding ("my wife's Metformin" ≠ beneficiary's drug) |
| Action decision | Yes | Claude Haiku or Sonnet | Needs to understand page context + what actions make sense |
| Tool orchestration | Yes | Claude Sonnet | ReAct agent decides when to call search_plans, check_drug_coverage, etc. |
| Medicare knowledge lookup | No | — | Static knowledge base; LLM just decides WHEN to call it |
| Compliance regex | No | — | Pattern matching for known CMS violations |
| Compliance nuanced | Yes | Claude Haiku | Edge cases beyond regex |
| Post-call summary | Yes | Claude Sonnet | Full transcript summarization |
| UI rendering | No | — | React components render whatever the AI returns |

**Recommendation:** Use `claude-sonnet-4-6` (your existing `AI_MODEL_DEFAULT`) for the call analysis agent. Each chunk is small (1-3 sentences + context), so latency should be 1-3 seconds. For a hackathon demo this is fine. If latency matters, switch to Haiku for extraction-only chunks and Sonnet for tool-calling chunks.

---

## Build Order (5 days)

### Day 1: Foundation
- [ ] Create `CallContext.tsx` with full state management
- [ ] Create `useSpeechRecognition.ts` hook
- [ ] Create `CallPanel.tsx` shell (transcript display + waveform)
- [ ] Modify `Layout.tsx` to render CallPanel
- [ ] Add "Start Call" button to Header
- [ ] Test: mic works, transcript shows in panel

### Day 2: Backend Agent
- [ ] Create `medicareKnowledge.tool.ts` (static knowledge base)
- [ ] Create `complianceCheck.tool.ts` (regex patterns)
- [ ] Create `callAnalysisAgent.ts` (ReAct agent with system prompt)
- [ ] Create `call.routes.ts` + `call.controller.ts` (SSE endpoint)
- [ ] Mount routes in `routes/index.ts`
- [ ] Test: POST a chunk, get actions back

### Day 3: Action Dispatch
- [ ] Wire `useCallAnalysis.ts` hook (sends chunks, receives SSE events)
- [ ] Implement action processing in `CallContext.tsx`
- [ ] Add page registration to `LeadForm.tsx`
- [ ] Implement `fill_field` action handling in LeadForm
- [ ] Implement `add_drug` programmatic flow in DrugSearch
- [ ] Test: say "my name is John, zip 33101" → form fills

### Day 4: Info Cards + Compliance
- [ ] Build `InfoCard.tsx` component
- [ ] Implement `show_info` action rendering in CallPanel
- [ ] Implement `show_plans_link` with actual navigation
- [ ] Implement compliance flag rendering (red banner in panel)
- [ ] Add entity summary sidebar to CallPanel
- [ ] Test: say "what is CSNP" → info card appears with plan link

### Day 5: Polish + Demo
- [ ] Collapse/expand animation for CallPanel
- [ ] Action feed styling (green/blue/red/purple cards)
- [ ] Call duration timer
- [ ] Error handling (mic permission denied, SSE disconnect, LLM timeout)
- [ ] Demo script with pre-planned conversation flow
- [ ] Record a backup demo video in case live demo fails

---

## Demo Script

Use lead LEAD-005 (or create a new one). Agent logs in as `johndoe11`.

1. Agent navigates to Leads → New Lead
2. Clicks "Start Call" in header
3. Panel opens with waveform animation
4. Speaks (or has someone speak): "Hi, I'm calling about Medicare plans. My name is Robert Anderson."
   → Panel shows transcript. LeadForm auto-fills firstName: Robert, lastName: Anderson
5. "My date of birth is March 15, 1955 and I live in zip code 33101"
   → Form fills DOB, zip → auto-populates state (FL), county, city
6. "I currently take Eliquis 5mg twice a day and Metformin 500mg once daily"
   → Drug tags appear in the form: Eliquis (5mg, twice daily), Metformin (500mg, once daily)
7. "What is a CSNP plan?"
   → Blue info card appears in panel: "Chronic Condition Special Needs Plan..." with link "View 8 CSNP plans in 33101"
8. Agent clicks the link → navigates to plan list filtered by CSNP + 33101
9. "Does the Carrier 1 CSNP plan cover my Eliquis?"
   → AI calls check_drug_coverage → shows coverage card: Tier 3, $47 copay, no prior auth
10. Agent says "This is the best plan for you" (intentional CMS violation)
    → Red compliance alert: "CMS prohibits superlatives. Say 'a plan that may fit your needs' instead"
11. Agent clicks "End Call"
    → Summary appears with CRM note, follow-up tasks, entity summary

---

## Environment Requirements

Add to `.env.example`:

```bash
# Call Copilot (Phase 8)
# No new env vars needed — uses existing AI_LLM_PROVIDER, AI_MODEL_DEFAULT, etc.
# Web Speech API runs entirely in the browser (no API key needed).
```

The only requirement is that `AI_ENABLED=true` and a working LLM provider (Anthropic API key or Ollama running). Your existing setup handles this.
