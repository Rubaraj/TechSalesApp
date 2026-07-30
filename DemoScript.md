# Demo Script — SalesIQ Platform POC

Every name, zip, drug and call ID below is a real record verified against the
live system. They will behave as written.

**Log in as `mikewilson33@medicarehub.com` (USER-004).** All the recent real
calls and the saved screening persona belong to that agent — any other login
shows empty history and half the demo has nothing to point at.

Two minutes before you start: log in once in the tab you'll present from, then
hard-refresh. Don't open a second tab during the demo — a fresh tab loses the
AI Persona menu item and the dialer icon until you log in again.

---

## Running order

| # | Segment | Min |
|---|---|---|
| 1 | Automated call handling | 8 |
| 2 | Agentic copilot | 5 |
| 3 | Real-time call intelligence | 5 |
| 4 | Supervisor QA | 3 |
| 5 | Training simulator | 4 |
| 6 | Cost transparency | 2 |

≈27 minutes. **Twelve-minute cut:** 1 → 2 → 6.

Lead with what you built this week; close on the number leadership asks for.

---

## 1. Automated Call Handling (8 min)

*The one to lead with. Everything else is a supporting act.*

**Setup:** logged in as Mike Wilson, dialer visible, your mobile in hand.

### 1a. Let it ring out

> "I'm going to call the office line and simply not answer — the way it happens
> when every agent is already on a call."

Dial the Twilio number from your phone and **don't touch anything.**

While it rings: *"Twenty seconds of ringing is where a lead normally dies.
Watch what happens instead."*

The assistant picks up on timeout, discloses that it's automated, and names the
agent it's covering.

> "It said it's an assistant. That's not politeness, that's the disclosure
> requirement — and it's in the persona the agent controls, not buried in code."

### 1b. The intake — say these, one at a time, pausing for each reply

1. "Hi, my name is Robert Johnson."
2. "My zip code is **06604**." *(Bridgeport, Connecticut)*
3. "I take **Eliquis**, five milligrams, twice a day."
4. "I usually fill my prescriptions at **CVS**."
5. "Can someone call me back tomorrow afternoon?"

Point at the screen as it fills:

> "That record is being created while he's still talking. The agent's browser
> is being driven from the call — nobody is typing."

**Safe drugs to improvise with** — all confirmed in the catalog: Eliquis,
Ozempic, Jardiance, Metformin, Lipitor, Xarelto, Trulicity, Atorvastatin,
Levothyroxine, Losartan, Omeprazole, Gabapentin, Sertraline.

If you name something off-catalog it goes to notes flagged for human review.
That's correct behaviour — own it rather than glossing: *"It didn't recognise
that one, so it wrote it down and flagged it instead of guessing. Deliberate."*

### 1c. Ask it something that needs a real lookup

> "Is there a pharmacy near me that takes this?"

Say while it works: *"That's a live lookup against the pharmacy data, not the
model recalling something."*

### 1d. The takeover — the moment that lands

Mid-sentence, click **Take over**. Keep talking on your phone.

> "Same call. No hold music, no transfer, no re-introduction. And everything he
> said before I joined is already on the record in front of me."

### 1e. Close the loop

Open the lead the AI just created: name, zip, the medication attached as a
structured record, the pharmacy, the callback request.

> "Missed call in, qualified record out. No human was involved until the last
> ninety seconds."

**Say this before it happens:** the Twilio trial preamble ("you have a trial
account…") plays before inbound calls connect. Name it the moment it starts —
*"that's the Twilio trial notice, it goes away on a paid number"* — or it reads
as a bug in your app.

---

## 2. Agentic Copilot (5 min)

Open the Atlas chat pane. Build an arc: **ask → look up → act → propose.**

**Ask about their own book:**
> "What's in my pipeline right now?"

**A real clinical lookup:**
> "Is Eliquis covered, and what tier is it?"

**Semantic search — say what you want, not the product name:**
> "Find me a plan with good dental coverage."

Land the point here: *"That's not keyword matching. 'Good dental' isn't a field
in the catalog."*

**Something local:**
> "Find a pharmacy near 06604."

**Now make it act on the UI, not just answer:**
> "Take me to John Smith's record."

**Then the write path — this is the part managers care about:**
> "Update his status to qualified."

It comes back as a *proposal*, not a change.

> "Twenty-three tools, all reached in plain English. Everything that reads,
> it just does. Everything that writes comes back for me to approve. The AI
> prepares, the human commits — that's the design, not a limitation we hit."

Optional if the room is engaged: *"How am I tracking against my target?"* or
*"Draft a follow-up email for him."*

Keep it to one short conversation and don't scroll far back — ordering can
still jumble on a long session.

---

## 3. Real-Time Call Intelligence (5 min)

The compliance engine matches specific phrases. **Say the scripted lines
exactly** — improvised wording may not trip a rule, and nothing firing is worse
than not demoing it.

| Say this | Fires | Severity |
|---|---|---|
| "Honestly, this is **the best plan for you**." | Superlatives — CMS marketing rule | warn |
| "And it's **completely free**." | Misrepresenting costs | **critical** |
| "**You need to enroll** today." | Pressure language | warn |
| "It's **better than Original Medicare**." | Disparaging Original Medicare | warn |
| "**Everyone chooses this** one." | Bandwagon pressure | warn |
| "This is a **limited time offer**." | False urgency | warn |
| "**Do you have diabetes**?" | Health-status question (non-SNP) | **critical** |

Two is enough. The best-plan / completely-free pair gives you a warn and a
critical back to back.

> "That flagged while the call was still live. The agent gets the correction in
> the moment — with the compliant alternative, not just a red mark."

Also point out, as the call runs: the live transcript with speaker separation,
sentiment tracking through the call, and the coaching prompts on talk-ratio and
missed discovery topics.

> "Emotion, coaching and compliance are one pass, not three. Same insight,
> materially lower cost per call."

Then open the admin UI and show the rule list.

> "Compliance rules change. When they do, this is a form — not a release."

*(Quietly: the "Guarantees" rule has no pattern configured, so it won't fire.
Don't point at that one.)*

---

## 4. Supervisor QA (3 min)

Use a real, already-reviewed call rather than generating one live:

**`CA067e6a0c5fcd10c313564045d0fa552b`** — 26 July, inbound, 2m15s, 23
transcript lines, 4 compliance flags, QA review stored.

Backups:
- `CAee9c276c6812ec194cbfad4bbfd6bd75` — 2m19s, 5 compliance flags, reviewed
- `CA866ddb3b38976d7df035b61545a30853` — 3m05s, 2 compliance flags, reviewed

Show the transcript with compliance and coaching markers inline → the scorecard
→ the rubric behind it.

> "Ten rubric items, and supervisors edit them themselves. Today QA means
> listening to maybe three calls per agent per month. This is every call,
> scored the same way, with humans spending their time on the ones that need
> attention."

Real numbers you can quote: **75 call records, 14 stored QA reviews.**

---

## 5. Training Simulator (4 min)

| Persona | Who | Trains |
|---|---|---|
| Confused first-timer | Margaret, 67 — new to Medicare, lost in jargon | Patience, plain language |
| Skeptical comparison-shopper | Pushes back, compares everything | Objection handling |
| Frustrated & price-sensitive | Gloria, 69 — angry about drug costs, vents first | Empathy before pitch |

Pick **Frustrated & price-sensitive** — it's the most dramatic and it makes the
best point about why practice matters.

> "This is a live voice call against an AI prospect. New agents get their first
> difficult conversation here instead of with a real customer — and practice
> calls produce the same scorecards real ones do."

Then the admin angle:

> "Supervisors write these themselves. A new objection shows up in the market on
> Monday, there's a scenario for it on Tuesday. No engineering."

**Don't promise compliance cards in the simulator** — across 19 practice
sessions the rules have never matched trainee speech; the patterns are written
for how people actually talk on real calls. Show the scorecard instead.

---

## 6. AI Cost Transparency (2 min) — close here

> "Every AI call this platform makes is logged — 792 so far — split four ways:
> copilot, QA analysis, transcription, and training. Per call and per agent,
> computed from real usage rather than estimated."

Change the agent-count assumption to **100** and let the projection redraw.

Then click from a cost figure straight through to the transcript that produced
it.

> "That's usually the first question leadership asks, and we can answer it with
> actual numbers."

---

## Likely questions

**"Is it making up plan or drug information?"**
No. It can't answer from its own knowledge — every figure comes from a tool call
against the actual catalog, executed server-side. If a lookup fails it says so
rather than filling the gap.

**"What if it gets something wrong on a live call?"**
Two answers. The agent takes over at any moment, mid-sentence, and the caller
hears one continuous call. And anything it couldn't match to master data goes to
notes flagged for a human — nothing the customer said is discarded.

**"Can it act on its own?"**
On calls it captures and creates. In the copilot every write is a proposal the
agent approves. Caller identity is injected server-side, so it can't act as
anyone other than the agent it's covering.

**"How fast is it?"** Every system call is time-capped — a slow backend can
never leave a caller listening to silence. It acknowledges and moves on.

**"What does it cost?"** Section 6, with real numbers.

**"Is this production-ready?"**
Be straight: a working proof of concept on real infrastructure — real telephony,
real transcription, real data. Hardening, security review and scale testing are
what sit between here and production. Overclaiming is the one thing that will
cost you the room.

---

## Don't demo these

- **Plans have no zip or county service areas.** Say "market" and "region"
  (Northeast, New England). Never "plans available in your zip code" — that data
  isn't there and someone may ask you to prove it.
- **Chat ordering** can jumble on long sessions. Keep the copilot segment short.
- **Suggestion cards accumulate** across a browser session — refresh between
  segments.
- **One tab only.** A new tab drops the AI Persona menu and dialer icon.
- **Simulator compliance** doesn't fire. Covered above.

## If something breaks mid-demo

Don't debug on stage. If the call won't connect, jump to section 5 — same voice
engine, same point — and come back if there's time. If the copilot stalls, go to
section 4; the stored QA reviews need nothing live. Keep moving; a demo that
flows past a hiccup reads as confidence, a demo that stops to troubleshoot reads
as fragile.
