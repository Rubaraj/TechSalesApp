# TechSalesApp — Full Architecture

Medicare sales platform with live AI call copilot.
Outbound + inbound PSTN calls → Deepgram diarized transcription → rule-based AI agent (stub mode; LLM-swappable) → real-time form auto-fill + post-call notes.

---

## Top-level system diagram

```
                                         ┌───────────────────────────────────────────────┐
                                         │              Twilio Cloud                     │
                                         │  ┌─────────────┐    ┌────────────────────┐    │
                                         │  │ TwiML App   │    │ Phone Number       │    │
                                         │  │ (outbound)  │    │ +1 (888) 668-1840  │    │
                                         │  └──────┬──────┘    └──────┬─────────────┘    │
                                         └─────────┼──────────────────┼──────────────────┘
                                                   │ POST /voice      │ POST /incoming
                                                   │                  │
                                                   ▼                  ▼
                            (Cloudflare NAMED tunnel "home-api" → api.rubarajan.dev
                             → Pi: cloudflared-api → Caddy :8081 [/techsales prefix
                             stripped, see gateway/] → Pi API :4000)
                                                            │
                                                            ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                          Backend  (techsales-api · Express 5 · Node + TS)                          │
│                                                                                                   │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │  HTTP Router  (src/routes/index.ts)                                                        │   │
│  │   /api/health   /api/auth     /api/leads     /api/users   /api/roles    /api/departments   │   │
│  │   /api/enrollments  /api/members  /api/targets    /api/ai/*                                │   │
│  │   /api/twilio/*  (voice • status • incoming • incoming/result)  ← verifyTwilioSignature    │   │
│  │   /api/presence/heartbeat    ← Phase 2.6                                                    │   │
│  │   /api/_debug/*  ← dev only (inject-transcript • stop-call • presence)                      │   │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                   │
│  ┌─────────────────────────────────────┐  ┌──────────────────────────────────────────────────┐    │
│  │  WS server  /ws/twilio-media        │  │  Services                                        │    │
│  │  src/ws/twilioMediaStream.ws.ts     │  │   twilioService     callMinuteCap                │    │
│  │   ↳ per-call ctx:                   │  │   deepgramService   callBus  (in-memory pub/sub) │    │
│  │       direction (in/out)            │  │   agentPresence  (round-robin, 30s heartbeat)    │    │
│  │       2× Deepgram streams           │  │                                                  │    │
│  │       callAnalysisAgent stop fn     │  │                                                  │    │
│  │       heartbeat + duration cap      │  │                                                  │    │
│  └─────────────────────────────────────┘  └──────────────────────────────────────────────────┘    │
│                                                                                                   │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │  AI pipeline (src/ai/)                                                                     │   │
│  │                                                                                            │   │
│  │  ┌─ agents/callAnalysisAgent.ts ──────────────────────────────────────┐                    │   │
│  │  │ env.AI_LLM_PROVIDER='stub' (today)                                 │                    │   │
│  │  │  - subscribe(callSid)  ← callBus                                   │                    │   │
│  │  │  - on FINAL prospect chunk: runProspectSideAnalysis                │                    │   │
│  │  │  - on FINAL agent chunk:    runAgentSideAnalysis (compliance)      │                    │   │
│  │  │                                                                    │                    │   │
│  │  │  Per-call Maps (cleaned on stop):                                  │                    │   │
│  │  │   accumulators           ExtractedEntities snapshot                │                    │   │
│  │  │   shownTopics            info-card dedup                           │                    │   │
│  │  │   callerNumbers          inbound caller-ID (phone dedup)           │                    │   │
│  │  │   transcriptHistory      for post-call note summary                │                    │   │
│  │  │   unsubscribers          for stopCallAnalysisByCallSid             │                    │   │
│  │  │                                                                    │                    │   │
│  │  │  stop() order  (Phase 3b.1):                                       │                    │   │
│  │  │    1. runPostCallNoteSummary → publish add_note actions            │                    │   │
│  │  │    2. unsubscribe from callBus                                     │                    │   │
│  │  │    3. clear per-call Maps                                          │                    │   │
│  │  └────────────────────────────────────────────────────────────────────┘                    │   │
│  │                                                                                            │   │
│  │  ┌─ tools/  ────────┐  ┌─ rules/  ──────────────────────┐  ┌─ audit/ ──┐  ┌─ llm/ ───┐    │   │
│  │  │ medicareKnowledge│  │ entityExtractor                │  │ audit-    │  │ chatModel │    │   │
│  │  │  15+ glossary    │  │  zip / drugs (+dosage/freq)    │  │ Call-     │  │  (Phase  │    │   │
│  │  │  CSNP/DSNP/MAPD  │  │  phone / email / MBI           │  │ Analysis  │  │  3c LLM) │    │   │
│  │  │ complianceCheck  │  │  medicaidNumber / names        │  │ Event    │  │          │    │   │
│  │  │  8 CMS rules     │  │  isDualEligible / isLISEligible│  │           │  │ embed    │    │   │
│  │  │  (regex)         │  │  pharmacies (chain) / providers│  │           │  │  Service │    │   │
│  │  │                  │  │ noteSummarizer (post-call)     │  │           │  │          │    │   │
│  │  │                  │  │  6 categories + catalog_miss   │  │           │  │          │    │   │
│  │  └──────────────────┘  └────────────────────────────────┘  └───────────┘  └──────────┘    │   │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                   │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │  Repository layer  (src/repositories/registry.ts — single mode at startup)                 │   │
│  │      ┌─────────┐    ┌─────────┐    ┌──────────────┐                                        │   │
│  │      │  mongo/ │ or │  json/  │ or │  databricks/ │                                        │   │
│  │      └────┬────┘    └────┬────┘    └──────┬───────┘                                        │   │
│  │           │              │                │                                                 │   │
│  │       Lead, User, Role, Dept, Enrollment, Member, Target, AiInteraction                    │   │
│  │       (findByPhone on Lead repo — Phase 2.6; notes column — Phase 3b.1)                    │   │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
              │                              │                            │                  │
              │ Mongo wire                   │ SSE  /api/ai/call/analyze  │                  │
              ▼                              ▼                            ▼                  ▼
┌──────────────────────────┐  ┌────────────────────────────────────────────────────────────────┐
│ Raspberry Pi             │  │            Frontend  (techsales-app · React 19 + Vite)          │
│  ┌────────────────────┐  │  │                                                                 │
│  │ MongoDB 8 (Docker) │  │  │  ┌─ App.tsx + Router ─────────────────────────────────────────┐ │
│  │  medhub_app DB     │  │  │  │  <CallProvider> (CallContext — single state for all calls)  │ │
│  │  medhub_lookup DB  │  │  │  │   <AuthProvider> <ThemeProvider> <Routes>                   │ │
│  └────────────────────┘  │  │  │     <Layout>                                                │ │
│                          │  │  │       <CallRuntime>  ← hosts the single useTwilioCall +     │ │
│  techsales-api (systemd) │  │  │                       presence heartbeat, ALWAYS mounted    │ │
│  caddy :8081 (gateway)   │  │  │         <Header>                                            │ │
│  cloudflared-api         │  │  │         <Outlet/> (pages swap here on nav)                  │ │
│   (named tunnel)         │  │  │         <CallPanel>  ← right-docked, never unmounts         │ │
└──────────────────────────┘  │  │       </CallRuntime>                                        │ │
                              │  │     </Routes>                                               │ │
                              │  │   </CallProvider>                                           │ │
                              │  └─────────────────────────────────────────────────────────────┘ │
                              └────────────────────────────────────────────────────────────────┘
```

---

## Live call data-flow (the call copilot pipeline)

```
        ┌──────────────────────────────────────────────────────────────────────────────────┐
        │  OUTBOUND (agent dials)                INBOUND (prospect dials Twilio number)    │
        │                                                                                  │
        │  Browser SDK Device                    PSTN → Twilio                             │
        │      │ device.connect({To})                │                                     │
        │      ▼                                    ▼                                     │
        │  Twilio TwiML App → POST /voice       Twilio → POST /incoming                   │
        │      │ <Start><Stream both_tracks         │ agentPresence.pickRoundRobin()      │
        │      │   direction=outbound>              │  ↳ <Dial timeout=20>                │
        │      │ <Dial>+1xxx</Dial>                 │     <Client>agent_USER-002</Client> │
        │      ▼                                    │     direction=inbound +              │
        │  Twilio Media Stream WS opens             │     prospectNumber=From              │
        │      │                                    ▼                                     │
        │      │                              Browser SDK fires device.on('incoming')      │
        │      │                                    │ accept() / reject()                  │
        │      │                                    ▼                                     │
        │      └────────────────────┬───────────────┘                                     │
        │                           ▼                                                     │
        │                   /ws/twilio-media                                              │
        │                           │ JSON frames: start / media (μ-law) / stop            │
        │                           ▼                                                     │
        │              twilioMediaStream.ws.ts handleConnection                            │
        │                           │                                                     │
        │                           ▼ on 'start':                                          │
        │                  - direction-aware trackToSpeaker                                │
        │                       outbound: inbound=agent  outbound=prospect                 │
        │                       inbound : inbound=prospect outbound=agent  (FLIPPED)       │
        │                  - open 2× Deepgram streams (one per track)                      │
        │                  - startCallAnalysis({callSid, userId, callerNumber})            │
        │                  - duration cap + WS heartbeat                                   │
        │                           │                                                     │
        │                           ▼ on 'media':                                          │
        │                  decode μ-law → Deepgram stream                                  │
        │                                                                                 │
        │           Deepgram (per track)                                                  │
        │              │ partial / final TranscriptChunks                                 │
        │              │ (speakerLabel from trackToSpeaker)                               │
        │              ▼                                                                   │
        │     callBus.publish(callSid, {type:'transcript', chunk})                         │
        │              │                                                                  │
        │      ┌───────┴──────────────────────────────┐                                   │
        │      ▼                                       ▼                                   │
        │  SSE bridge                       callAnalysisAgent  (subscribed)                │
        │  (controllers/call.controller       │                                            │
        │    .getCallAnalyzeStream)           │ on FINAL chunk:                            │
        │   forwards every event              │  - speaker=agent  → scanForViolations      │
        │   to /api/ai/call/analyze            │  - speaker=prospect →                     │
        │                                     │       extractFromProspectChunk             │
        │                                     │         (zip, drugs+dose/freq, phone,     │
        │                                     │          email, MBI, medicaid, names,     │
        │                                     │          dual/LIS, pharmacy chain,        │
        │                                     │          provider name)                   │
        │                                     │       lookupMedicareTerm (info card)      │
        │                                     │       append to transcriptHistory         │
        │                                     │                                            │
        │                                     │ publishes back to callBus:                 │
        │                                     │   {type:'entities', entities:diff}         │
        │                                     │   {type:'actions',  actions:[...]}         │
        │                                     │     • fill_field (each new scalar)         │
        │                                     │     • add_drug   (new drugs only)          │
        │                                     │     • add_pharmacy / add_provider          │
        │                                     │     • compliance_flag                       │
        │                                     │     • show_info / show_plans_link          │
        │                                     ▼                                            │
        │  Stream emits to FE                                                              │
        │      │                                                                           │
        │      ▼                                                                           │
        │  useCallAnalysis (hook)                                                          │
        │   route by action.type:                                                          │
        │     show_info / show_plans_link → addInfoCard slice                              │
        │     compliance_flag             → addComplianceFlag slice                        │
        │     fill_field / add_drug /                                                      │
        │       add_pharmacy / add_provider /                                              │
        │       add_note                  → enqueueActions (pendingActions queue)          │
        │                                                                                  │
        │   ALSO: every action → appendActivity (one row in aiActivityLog feed)            │
        │                                                                                  │
        │              │                                                                   │
        │   ┌──────────┴──────────────────────────────────────────┐                        │
        │   ▼                                                       ▼                      │
        │  CallPanel render                                  LeadForm consumer              │
        │   ┌────────────────────────────────┐                consumeActionsByType('...')   │
        │   │ Header                          │                                            │
        │   │  Compliance alerts (sticky)     │                fill_field → setFormData     │
        │   │  ─── TRANSCRIPT (50% top) ───   │                  (empty-only rule)           │
        │   │  TranscriptBubble × N           │                add_drug → setTaggedDrugs    │
        │   │  ─── AI ACTIVITY (50% bot) ───  │                  (drugId lookup +            │
        │   │  ✨ 12s Filled zipCode: 33101  │                   quantity derivation)       │
        │   │  💊 14s Eliquis · 5mg · 2×/day  │                add_pharmacy → tagged++       │
        │   │  🏥 16s CVS                     │                  (chainName → pharmacyId    │
        │   │  👨‍⚕ 18s Dr. Smith                │                   zip-prefix-aware)         │
        │   │  📝 02m concern: deductible     │                add_provider → tagged++       │
        │   │  ⚠️ 03m best plan → fit         │                add_note → APPEND to notes    │
        │   │  Audio device picker            │                                            │
        │   │  Extracted (5) ▾  EntitySummary │                Each fill → yellow ring 2s    │
        │   └────────────────────────────────┘                  + 'AI' chip until edit       │
        │                                                                                  │
        │  CALL END (closeStreams → callAnalysisStop):                                     │
        │    1. runPostCallNoteSummary → emits add_note actions                            │
        │       (scans transcriptHistory for 6 anchor categories +                         │
        │        catalog_miss for unresolved pharmacy/provider names)                      │
        │    2. unsubscribe from callBus                                                   │
        │    3. clear per-call Maps                                                        │
        │    4. WS handler publishes 'status:ended' → SSE closes                           │
        │    5. FE appends notes to LeadForm.notes field                                   │
        │    6. Agent clicks Save → notes persisted on Lead document                       │
        └──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key invariants & contracts

| Invariant | Why it matters |
|---|---|
| **`AI_LLM_PROVIDER='stub'` today** | `callAnalysisAgent` throws at startup if non-stub but real LLM isn't wired. Phase 3c will replace the stub branch with a LangGraph ReAct agent; same `actions` / `entities` wire shape — zero FE changes. |
| **`CallRuntime` is always mounted** | Hoists the single Twilio Device above the route Outlet so navigation never destroys the call. Hosts the eager Device init required for inbound. |
| **`trackToSpeaker` is direction-aware** | Outbound and inbound swap the parent-call originator. Without the flip, inbound calls would label prospect speech as "Agent" and the AI pipeline (compliance, fill_field) would route to the wrong side. |
| **Agent stop() ordering** | `runPostCallNoteSummary → publish add_note → unsubscribe → clear`. If we unsubscribed first, the SSE bridge would still hold its subscription but the agent's own listener would be gone (no harm); the WS handler's subsequent `publish('status','ended')` is what closes the SSE. |
| **Empty-only fill rule** | LeadForm AI fills never overwrite typed values. Agent retains authority; AI augments. |
| **Action queue is id-based** | `consumeActionsByType` filters by stable `_id` (not positional index) — fixes a latent Phase 1 bug where two consumers between batches drifted indices. |
| **Notes APPEND, not replace** | Unlike `fill_field` (empty-only), `add_note` concatenates to the notes field with `\n` between lines so multiple categories survive. |
| **Phone caller-ID dedup** | For inbound calls, the prospect's caller-ID is stashed at agent start; the extractor suppresses phone matches equal to it so the prospect "saying their own number" doesn't double-fire. |
| **Activity log + action queue caps** | aiActivityLog capped at 100; pendingActions + actionLog capped at 200 each (drop-oldest). Prevents unbounded growth on long calls. |
| **Presence heartbeat = 30 s, online window = 60 s** | One missed heartbeat doesn't kick an agent; two does. Round-robin skips agents with `inCall=true`. |
| **Dev-only debug hook** | `window.__techsalesDebug` exposes `startFakeCall / inject / endFakeCall / runFullTest`. Stripped from production via `import.meta.env.DEV`. |

---

## Repository layout

```
TechSalesApp/
├─ techsales-api/                              Backend (Node 22, Express 5, TS strict)
│  ├─ src/
│  │  ├─ ai/
│  │  │  ├─ agents/callAnalysisAgent.ts        Per-call stub agent (Phase 3a/3b/3b.1)
│  │  │  ├─ audit/auditCallAnalysisEvent.ts    Fire-and-forget audit
│  │  │  ├─ llm/                                chatModel, embedService, callbacks
│  │  │  ├─ rules/
│  │  │  │  ├─ entityExtractor.ts              Zip, drugs(+dose/freq), phone, email,
│  │  │  │  │                                   MBI, medicaid, names, dual/LIS,
│  │  │  │  │                                   pharmacy chain, provider name
│  │  │  │  └─ noteSummarizer.ts               Post-call category scan
│  │  │  ├─ tools/
│  │  │  │  ├─ medicareKnowledge.tool.ts       Glossary lookup
│  │  │  │  └─ complianceCheck.tool.ts         8 CMS rule regexes
│  │  │  └─ types/call.types.ts                Wire types (mirrored on FE)
│  │  ├─ controllers/                          Lead, twilio, presence, call, AI, …
│  │  ├─ middleware/                           verifyTwilioSignature, callMinuteCap, …
│  │  ├─ models/lead.model.ts                  Mongoose schema (notes column added)
│  │  ├─ repositories/                         mongo / json / databricks per entity
│  │  ├─ routes/                               All /api/* routers
│  │  │  └─ _debug/injectTranscript.routes.ts  Dev fixture replay + stop-call
│  │  ├─ services/                             twilio, deepgram, callBus, agentPresence
│  │  ├─ utils/phoneUtils.ts                   normalizeToE164 (BE mirror)
│  │  └─ ws/twilioMediaStream.ws.ts            Media Streams receiver
│  ├─ data/lookup/                             zip, drug, pharmacy, provider seeds
│  └─ .env                                     TWILIO_*, DEEPGRAM_*, PUBLIC_BASE_URL,
│                                              AI_LLM_PROVIDER, MONGO_URI, ...
│
├─ techsales-app/                              Frontend (React 19, Vite 7, TS strict)
│  ├─ src/
│  │  ├─ api/apiClient.ts                      Tiny fetch wrapper → /api
│  │  ├─ components/
│  │  │  ├─ call/                              All call UI lives here
│  │  │  │  ├─ CallPanel.tsx                   Right-docked panel (50/50 split)
│  │  │  │  ├─ CallRuntime.tsx                 Always-mounted Device host + heartbeat
│  │  │  │  ├─ Dialer.tsx                      Keypad + dial button
│  │  │  │  ├─ Keypad.tsx, PhoneButton.tsx     Click-to-dial primitives
│  │  │  │  ├─ TranscriptBubble.tsx            Single transcript line
│  │  │  │  ├─ AudioDeviceSelector.tsx         Mic / speaker picker
│  │  │  │  ├─ ActiveCallBadge.tsx             Header timer when collapsed
│  │  │  │  ├─ RecentCallsStrip.tsx            Long-press for recent numbers
│  │  │  │  ├─ ComplianceAlert.tsx             Sticky-top red alert
│  │  │  │  ├─ InfoCard.tsx                    Medicare term card
│  │  │  │  ├─ EntitySummary.tsx               Collapsible "Extracted (N)" footer
│  │  │  │  ├─ IncomingCallView.tsx            Inbound ring UI inside CallPanel
│  │  │  │  └─ AiActivityFeed.tsx              Bottom-50% AI activity log
│  │  │  ├─ common/AiChip.tsx                  Yellow "AI" badge on filled inputs
│  │  │  └─ tagging/                           PharmacySearch, DrugSearch, ProviderSearch
│  │  ├─ context/
│  │  │  ├─ CallContext.tsx                    Reducer + dev __techsalesDebug hook
│  │  │  ├─ AuthContext.tsx                    Session + logout
│  │  │  └─ ThemeContext.tsx                   3 themes (default/carrier1/carrier2)
│  │  ├─ hooks/
│  │  │  ├─ useTwilioCall.ts                   Eager init + outbound/inbound lifecycle
│  │  │  └─ useCallAnalysis.ts                 SSE consumer + action router + activity log
│  │  ├─ pages/leads/LeadForm.tsx              The AI fill consumer
│  │  ├─ services/
│  │  │  ├─ callService.ts                     Token mint + SSE stream client
│  │  │  ├─ twilioClientService.ts             Voice SDK wrapper (lazy SDK load)
│  │  │  ├─ presenceService.ts                 30s heartbeat
│  │  │  ├─ ringtone.ts                        WebAudio incoming-ring loop
│  │  │  ├─ drugService.ts                     +findDrugByName
│  │  │  ├─ pharmacyService.ts                 +findPharmacyByChainName
│  │  │  └─ providerService.ts                 +findProviderByName
│  │  ├─ types/call.ts                         Wire types (mirrored from BE)
│  │  └─ utils/phoneUtils.ts                   normalizeToE164 (FE)
│  └─ data/lookup/                             Imported JSON catalogs
│
└─ ARCHITECTURE.md                              ← this file
```

---

## Phase history (for context)

| Phase | What shipped | LLM? |
|---|---|---|
| Phase 1 | DB rebuild, repository registry (mongo/json/databricks), Web Speech panel scaffold | No |
| Phase 2 | Twilio Voice SDK + Deepgram diarized streaming, SSE bridge, CallPanel transcript | No |
| Phase 2.5 | Telephony UX (keypad, click-to-dial, ActiveCallBadge, AudioDeviceSelector, RecentCalls), CallRuntime hoist | No |
| **Phase 2.6** | **Inbound PSTN calls** — round-robin presence, IncomingCallView, WebAudio ringtone, direction-aware track mapping, eager Device init, lead-by-phone lookup | No |
| Phase 3a | **Sales IQ Copilot MVP** — stub agent, compliance scanner, Medicare knowledge tool, entity extractor, InfoCard/ComplianceAlert/EntitySummary | No |
| **Phase 3b** | **LeadForm auto-fill** — fill_field / add_drug actions, drug dosage+frequency parsing, AI chip + yellow ring, id-based action consumption | No |
| **Phase 3b.1** | **Pharmacy + provider + post-call notes + AI activity feed** — 50/50 panel split, noteSummarizer, lead.notes persistence | No |
| Phase 3c | LLM swap (LangGraph ReAct, Anthropic/Ollama) | **Yes** |
| Phase 3d / 5 | Post-call CRM summary / draft email | Yes |

The pipeline is wire-format stable across phases — the LLM swap in 3c only replaces the body of `runStub` inside `callAnalysisAgent.ts` and emits the same `actions` / `entities` shapes; zero FE work.
