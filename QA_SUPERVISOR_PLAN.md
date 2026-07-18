# Call QA Pipeline + Ambient Supervisor CoPilot (TechSalesApp)

> After approval, this plan is ALSO saved to the repo as
> QA_SUPERVISOR_PLAN.md (user request). Prior shipped work (Atlas
> rich-chat, d20bbf5) is untouched — this plan only ADDS capabilities.

## Context

Two up-the-game pipelines for the agentic POC, per user decisions:
- **QA pipeline**: rule-based in-call analysis (existing, free) produces
  TAGS (compliance/info/entity/note). Every call's transcript + tags are
  persisted at call end; flagged calls (any compliance tag) auto-enter the
  review queue. The LLM QA scorecard runs **on-demand only** (supervisor
  click or Atlas ask) — never autonomously per call.
- **ONE agent, one evaluator (user decision)**: QA review is NOT a second
  agent. It is a reusable structured-output evaluator service
  (`runQaReview(callSid)`, same category as noteSummarizer) invoked by
  BOTH (a) the dashboard "Run QA review" button via REST and (b) a new
  admin-gated Atlas tool `run_qa_review` wrapping the same function.
  Atlas remains the only conversational agent.
- **Supervisor CoPilot**: live-only ambience — real-time feed of active
  calls + compliance flags mid-call. Post-call analysis is click-driven
  from the dashboard (tags rendered against the transcript).
- **Surface**: Admin area (admin login = supervisor persona) + Atlas
  admin tools.

Grounding corrections (validated by design agent against source):
1. `getChatModel` lacks a per-call model override — add `modelOverride?`
   to `GetChatModelOptions` (thread into anthropic/ollama providers) +
   env `AI_MODEL_QA` (default falls through to AI_MODEL_DEFAULT) so QA
   runs on Haiku.
2. `direction`/`startedAt` aren't in callAnalysisAgent — extend
   `StartCallAnalysisInput` with `direction?`; record startedAt in a new
   per-call `callMeta` map; WS handler passes direction.
3. transcriptHistory keeps ONLY prospect finals — move both-speaker
   capture into the `subscribe` callback in `startCallAnalysis`
   (preserve real chunk ts/speaker); remove the old push in
   `runProspectSideAnalysis`; filter `speaker==='prospect'` at the
   `runPostCallNoteSummary` call site so notes aren't polluted.
4. Debug `stop-call` leaks callBus emitters (never calls endCall) — fix
   (endCallBus in the delayed publish); the active-call registry must
   unregister in `stopCallAnalysisByCallSid` (the single end funnel,
   including the debug path).

## Phase A — callRecords persistence (BE)

- New `models/callRecord.model.ts` (mirror aiInteraction: lazy appConn,
  strict:false): {callSid unique, userId, direction, startedAt, endedAt,
  durationSec, lines[{speaker,text,ts}], tags[{kind,ts,data}],
  flagged (indexed), qaReview|null, createdAt}.
- Repos for all 3 backends (registry factory switches are exhaustive):
  Mongo/Json/Databricks `CallRecordRepository` — `create`,
  `list({flaggedOnly?,userId?,limit?})` **projecting OUT lines**,
  `findByCallSid`, `setQaReview`. Register in registry.ts; add
  `callRecords` to databricks APP_TABLES.
- callAnalysisAgent.ts: new `callMeta` + `callTags` maps (cleaned in
  stop + __resetAllForTests); tag capture at the existing publish sites
  (compliance / info-card / entity-diff / post-call note); both-speaker
  capture per correction 3; in `stopCallAnalysisByCallSid` — after
  runPostCallNoteSummary, before the deletes — snapshot locals and
  `void persistCallRecord(...)` (new `ai/audit/persistCallRecord.ts`,
  fire-and-forget, log+swallow errors, skip empty ghost calls, cap lines
  ~5000; flagged = any compliance tag).
- WS handler passes `direction`; debug inject-transcript accepts
  `userId` + `direction`; fix the stop-call emitter leak.

## Phase B — QA evaluator (BE, shared by button + Atlas)

- Add `'call_qa'` to AiInteractionKind (ai/llm/callbacks.ts).
- New `ai/qa/runQaReview.ts` — the SINGLE shared evaluator (a service,
  not an agent):
  - pure `computeCallMetrics(lines)`: talk ratio, longest monologue,
    line counts — deterministic, unit-testable;
  - zod scorecard: {overallScore 0-100, dimensions{compliance,
    discovery, communication, nextSteps} each {score, evidence},
    strengths[], coachingPoints[], disclosureChecklist[{item, met,
    evidence}]};
  - `ai/prompts/callQaPrompt.ts`: Medicare-sales QA rubric (CMS
    disclosures, no-guarantee language, needs discovery, next steps) +
    transcript rendered `[mm:ss] SPEAKER: text` + tags + metrics;
    transcript truncated ~24k chars head+tail;
  - `getChatModel({modelOverride: env.AI_MODEL_QA, temperature: 0.2})`
    via withStructuredOutput (searchAgent pattern) + AuditCallbackHandler
    flush (kind 'call_qa', userId = requesting supervisor);
  - module `inFlight` Set per callSid (concurrent → 409/refusal);
    re-run overwrites qaReview (idempotent);
  - persists via `repos.callRecord.setQaReview`; publishes
    `qa_completed` on the global bus; returns the scorecard.
- `controllers/callQa.controller.ts` + mounts in ai.routes.ts:
  - GET `/api/ai/qa/calls?flaggedOnly=&userId=&limit=` and GET
    `/api/ai/qa/calls/:callSid` mounted BEFORE the AI_ENABLED guard
    (always-on reads; /stats precedent);
  - POST `/api/ai/qa/review/:callSid` body {userId} AFTER
    guard/rateLimit/tokenCap (spends tokens) → runQaReview.
  - All admin-gated via repos.user.findById(userId) →
    accessLevel==='admin' || isSuperAdmin (POC auth posture —
    spoofable; session auth is a tracked follow-up). Stub provider →
    clean 503.

## Phase C — global bus + supervisor SSE (BE)

- callBus.ts: `activeCalls` Map + `globalEmitter`
  (setMaxListeners(100)); SupervisorEvent union {snapshot |
  call_started | call_ended{flagged, tagCounts, durationSec} |
  compliance_flag{callSid, userId, phrase, rule, suggestion, ts} |
  qa_completed{callSid, overallScore}}; registerCall / unregisterCall /
  publishGlobal / subscribeGlobal / getActiveCalls. Targeted
  publishGlobal only — do NOT fan out every per-call publish (keeps
  transcript text off the supervisor wire).
- Wire-ins: startCallAnalysis→registerCall; runAgentSideAnalysis→
  publishGlobal compliance_flag; stopCallAnalysisByCallSid→call_ended +
  unregisterCall; runQaReview→qa_completed.
- `controllers/supervisor.controller.ts`: GET
  `/api/ai/supervisor/stream?userId=` (before guard, admin-gated) —
  clone getCallAnalyzeStream skeleton (writeHead, 15s ping,
  close/aborted cleanup); snapshot on connect (agentName enrichment via
  cached user lookups); forwards global events; snapshot sweep drops
  entries older than TWILIO_MAX_CALL_DURATION_SECONDS+60s.

## Phase D — FE Supervision (admin area)

- Nested AdminLayout tab: `/admin/supervision` +
  `/admin/supervision/:callSid`; new `AdminRoute` guard
  (accessLevel==='admin'||isSuperAdmin, else Navigate '/') wrapping the
  supervision routes; nav item in adminNavItems; export from
  pages/admin/index.ts.
- `services/supervisorService.ts`: listCalls / getCall / runQaReview +
  `openSupervisorStream` (copy callService's hand-rolled SSE reader).
- `pages/admin/Supervision.tsx`: LIVE section (active-call cards via
  snapshot/started/ended; scrolling compliance-alert feed with agent
  name/phrase/rule/ts; reconnect with backoff) + Call Log table (time,
  agent, duration, direction, tag chips by kind, flagged badge, QA
  score chip; flaggedOnly toggle + agent filter; refresh on
  call_ended/qa_completed). Hand-rolled Tailwind per
  ProductivityDashboard (no chart lib).
- `pages/admin/SupervisionCallDetail.tsx`: transcript viewer
  (speaker-colored rows, mm:ss offsets) with inline tag chips at the
  nearest-preceding line by ts; "Run QA Review" button → loading →
  scorecard panel (overall gauge, 4 dimension bars with evidence,
  strengths/coaching lists, disclosure checklist). Re-run allowed.
- `types/supervisor.ts` mirrors wire shapes.

## Phase E — Atlas admin tools (3) + QA card

- `run_qa_review` ({userId, callSid}) — wraps the SAME runQaReview
  service; returns the scorecard JSON. Add 'qa_review' to CARD_TOOL_MAP
  + new compact `QaScorecardCard` in the existing card registry (overall
  score, dimension bars, top coaching points, "Open in Supervision"
  link → /admin/supervision/:callSid).
- `get_team_calls` ({userId, flaggedOnly?, agentUserId?, limit?}) —
  compact list (callSid, agent name, startedAt, durationSec, flagged,
  tagCounts, qaScore). Markdown list output for v1 (no new card).
- `get_qa_review` ({userId, callSid}) — existing scorecard, no re-run
  (also renders the qa_review card).
- **Enforcement = tool self-check**: each tool loads
  repos.user.findById(userId); non-admin → JSON error refusal (prompt
  gating alone is advisory; varying the tool list per-request would
  bust the prompt cache).
- Register in atlasTools (one-time cache invalidation, acceptable);
  system prompt: describe as admin-only; buildDynamic appends an
  availability note when user.role==='admin'.

## Phase F — repo plan doc

- Save this plan as `QA_SUPERVISOR_PLAN.md` at repo root and commit with
  the implementation.

## Verification (no Twilio — debug replay)

1. inject-transcript {callSid QA-TEST-1, userId USER-001, direction
   outbound, both-speaker chunks incl. an agent violation ("this plan
   is completely free")} → stop-call → GET qa/calls/QA-TEST-1: both
   speakers in lines with real ts; tags include compliance+entity+note;
   flagged true; durationSec>0.
2. Non-admin userId on the reads → 403.
3. POST review → zod-valid scorecard; aiInteractions gains a call_qa
   row with real tokens; re-run overwrites; two parallel runs → one
   409; stub provider → 503.
4. curl -N supervisor/stream + replay with delayMs 500 → snapshot →
   call_started → compliance_flag mid-replay → call_ended{flagged,
   tagCounts} → qa_completed after review; getActiveCalls empty after.
5. Atlas (admin): "run a QA review on call QA-TEST-1" → run_qa_review →
   qa_review card with score + Supervision link; "show my team's
   flagged calls" → get_team_calls; agent user → refusal message.
6. FE: admin login → Supervision tab; live feed during replay; log row
   on call end; detail transcript + inline tags; button renders
   scorecard; agent login → redirect. List endpoint carries no lines
   field. Typecheck + lint both apps; new files lint-clean.

## Risks (accepted/mitigated)

- Global-emitter listener leaks → cleanup on close+aborted; maxListeners
  100; 15s heartbeat surfaces dead connections.
- Ghost active calls → unregister in the single stop funnel + snapshot
  age sweep.
- Transcript size → lines cap 5000; list projections exclude lines.
- QA cost → single non-agentic LLM call, 24k-char truncation, behind
  rateLimit+tokenCap, visible in /stats as kind call_qa.
- POC auth (userId query) — documented, not production access control.
- persistCallRecord is fire-and-forget: a Mongo failure loses that
  call's record (error-logged); the call path never blocks on it.

## Critical files

BE new: models/callRecord.model.ts;
repositories/{mongo,json,databricks}/*CallRecordRepository.ts;
ai/audit/persistCallRecord.ts; ai/qa/runQaReview.ts;
ai/prompts/callQaPrompt.ts; controllers/callQa.controller.ts;
controllers/supervisor.controller.ts; ai/tools/runQaReview.tool.ts;
ai/tools/getTeamCalls.tool.ts; ai/tools/getQaReview.tool.ts.
BE mod: services/callBus.ts; ai/agents/callAnalysisAgent.ts;
ws/twilioMediaStream.ws.ts; routes/_debug/injectTranscript.routes.ts;
routes/ai.routes.ts; repositories/registry.ts; ai/llm/callbacks.ts;
ai/llm/chatModel.ts + providers/{anthropic,ollama}.ts; config/env.ts;
repositories/databricks/databricksHelpers.ts; ai/tools/index.ts;
ai/prompts/atlasSystemPrompt.ts; ai/agents/atlasAgent.ts
(CARD_TOOL_MAP + AtlasCardType).
FE new: services/supervisorService.ts; pages/admin/Supervision.tsx;
pages/admin/SupervisionCallDetail.tsx; types/supervisor.ts;
components/atlas/cards/QaScorecardCard.tsx.
FE mod: App.tsx (AdminRoute + routes); pages/admin/AdminLayout.tsx;
pages/admin/index.ts; components/atlas/cards/cardRegistry.tsx;
services/atlasService.ts (AtlasCardType union).
