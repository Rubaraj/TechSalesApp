# Build Your Own AI Answering Machine

AI can answer the phone on your behalf. When you can't pick up, it takes the
call, greets the caller by introducing itself, and holds a natural voice
conversation — following a **persona you define in plain instructions**: how
it should sound, what it should ask, and what it's allowed to do. You can
join the call and take over from it at any moment.

## What Powers It

**Twilio** | **Deepgram**

That's the whole hardware-free stack: Twilio owns the phone line, Deepgram
owns the voice conversation.

A large portion of this can be built with open-source freeware and trial
accounts. The bridge itself runs entirely on open-source tooling, and both
paid services are free to try — a Twilio trial account comes with **$15** in
credit and a Deepgram trial with **$200**, which is more than enough to build
and test everything in this post end to end.

---

## How Can We Do It?

The entire answering machine is a bridge between two websockets: Twilio
streaming the call audio to you, and the Deepgram Voice Agent doing the
listening, thinking, and speaking.

### 1. Twilio takes the call

Buy a Twilio phone number and point its incoming-call webhook at your server.
When a call comes in you respond with TwiML — Twilio's XML instructions. The
key instruction is:

```xml
<Connect>
  <Stream url="wss://your-server/ws/screening" />
</Connect>
```

`<Connect><Stream>` opens a **bidirectional** websocket: Twilio sends you the
caller's audio as base64-encoded μ-law frames, and any audio you send back is
played to the caller. From this point the phone call is just a websocket.

You decide *when* to hand the call to the AI. Three natural triggers:

- Ring the human first (`<Dial timeout="20">`) and fall through to the AI
  when nobody answers.
- Answer with the AI immediately when nobody is available at all.
- Let a human click a "screen this call" button and redirect a ringing call
  to the AI on demand.

### 2. Deepgram has the conversation

On your server, open a second websocket to the **Deepgram Voice Agent**
(`wss://agent.deepgram.com/v1/agent/converse`). This one service replaces the
whole speech pipeline you'd otherwise assemble yourself — speech-to-text, a
reasoning model, and text-to-speech — behind a single socket. You configure
it with one settings message:

- **Audio** — μ-law at 8 kHz in and out, matching Twilio's telephony format
  exactly. No transcoding needed: frames pass straight through.
- **Listen** — a Deepgram speech-recognition model transcribes the caller in
  real time.
- **Think** — a large language model drives the conversation. This is where
  your **persona** goes: the system prompt is
  built from the instructions you wrote — who the AI is covering for, what
  tone to take, what to collect, what it may and may not offer.
- **Speak** — a Deepgram voice speaks the replies. The voice itself is part
  of the persona, so different teams can sound different.
- **Greeting** — the exact opening line, including the required disclosure
  that the caller is speaking with an automated assistant.

### 3. The bridge

Your server's job is now beautifully small: relay audio frames from the
Twilio socket to the Deepgram socket, and relay the agent's audio back. Two
details make it feel human:

- **Barge-in** — when the caller starts talking over the AI, send Twilio a
  `clear` event to flush the audio it hasn't played yet. The AI stops
  mid-sentence instead of talking over the caller.
- **Function calling** — when the caller asks something that needs real data
  ("is there a pharmacy near me?"), the Voice Agent sends a function-call
  request over the same socket. Your server runs the lookup and returns the
  result, and the AI speaks it. Which functions exist is gated by the
  persona, so a switched-off capability is never even offered to the model.

### 4. The takeover

Because the AI is just one leg of a normal Twilio call, a human can join it
like any other call. Redirect the call back to an agent's line and the AI
leg ends — same call, no hold music, no transfer, the caller never dials
twice.

---

## Here Is an Example

Here's the same integration running inside our web app.

**The AI answering a live call** — the caller rang, nobody picked up, and
the assistant took over. Everything the caller says streams onto the screen
in real time.

<!-- SCREENSHOT PLACEHOLDER: CallPanel during an AI-screened call — live transcript streaming -->
> 📸 **[Add screenshot: AI handling a live call, transcript on screen]**

<!-- SCREEN RECORDING PLACEHOLDER: full flow — call rings out, AI picks up, conversation streams -->
> 🎬 **[Add screen recording: end-to-end AI answered call]**

**The takeover** — one click, and the human joins the same call
mid-sentence. Everything said before the takeover is already on screen.

<!-- SCREENSHOT PLACEHOLDER: The Take over button / agent joined mid-call -->
> 📸 **[Add screenshot: taking over the call from the AI]**

**Setting the persona** — the AI's greeting, voice, instructions, and
capabilities are a form the user edits, not code. Change the instructions and
the very next call follows them.

<!-- SCREENSHOT PLACEHOLDER: AI Persona settings screen — greeting, voice, instructions, toggles -->
> 📸 **[Add screenshot: persona configuration screen]**

---

## Future Road Map

- **Training Simulator for Teams** — the same voice pipeline pointed
  inward: AI personas that play difficult callers so new team members
  practice before their first real conversation.
- **Transcript Intelligence** — emotion and compliance tracking over the
  live transcript, flagging risky phrases and caller frustration as they
  happen.
- **Real-Time Call Intelligence** — live coaching and insights driven by the
  transcript and the AI's tool usage during the call.
- **Auto-Filling UI** — forms that fill themselves from what the caller
  says, captured as structured data while the conversation is still going.
