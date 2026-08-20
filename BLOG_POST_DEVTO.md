---
title: Build Your Own AI Answering Machine
published: false
tags: ai, twilio, webdev, tutorial
cover_image: REPLACE_WITH_COVER_IMAGE_URL
---

AI can answer the phone on your behalf. When you can't pick up, it takes the
call, greets the caller by introducing itself, and holds a natural voice
conversation — following a **persona you define in plain instructions**: how
it should sound, what it should ask, and what it's allowed to do. You can
join the call and take over from it at any moment.

## What Powers It

**Twilio** | **Deepgram**

That's the whole stack: Twilio owns the phone line, Deepgram owns the voice
conversation, and your server is the bridge between them.

Roughly 90% of it is free or open source. The bridge itself runs entirely on
open-source tooling, and both paid services are free to try — a Twilio trial
account comes with **$15** in credit and a Deepgram trial with **$200**,
which is more than enough to build and test everything in this post end to
end. The only thing you need to actually provide is somewhere for the bridge
to run: a cheap VM works, and so does a Raspberry Pi sitting on your desk.

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

- Let a human click a "screen this call" button and redirect a ringing call
  to the AI on demand.
- Ring the human first (`<Dial timeout="20">`) and fall through to the AI
  when nobody answers.
- Answer with the AI immediately when nobody is available at all.

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

**The call comes in** — alongside the usual Decline and Accept, there's a
third option: **Screen**. The agent is at their desk and could pick up, but
chooses to let the AI take it first.

![An incoming call notification showing the caller's name and number, with Decline, Accept and Screen buttons](REPLACE_WITH_IMAGE_URL)

**The AI takes the call** — one click on Screen and the assistant is on the
line, introducing itself and opening the conversation. Everything said
streams onto the screen in real time, so the agent can read the call as it
happens without being on it.

![The AI screening panel showing a live transcript of the assistant greeting the caller, with a Take Over button in the header](REPLACE_WITH_IMAGE_URL)

Notice the **Take over** button sitting in that same header. The agent has
been reading along, and the moment the call turns into something worth
handling personally, one click puts them on the line mid-sentence — with
everything said before the takeover already on screen in front of them.

![End-to-end recording: the call arrives, the agent screens it, the AI converses, and the agent takes over](REPLACE_WITH_RECORDING_URL)

**Setting the persona** — the AI's voice, capabilities, and the whole flow
of the call are a form the user edits, not code. Pick a voice from the
dropdown. Tick what the assistant is allowed to do, and the matching function
simply isn't offered to the model when it's off. Then write the call playbook
in plain English — the numbered steps it works through, one question at a
time. Change the playbook and the very next call follows it.

![The AI Persona settings dialog: a voice dropdown open with six voice options, toggles for saving the lead and looking up plans, and a call playbook text area containing numbered plain-English instructions](REPLACE_WITH_IMAGE_URL)

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

---

The surprising part isn't that any of this is possible — it's how little of
it you have to build. Twilio hands you the audio, Deepgram hands you the
conversation, and everything in between is a few hundred lines of socket
relay. The interesting work is the persona.

If you were pointing an answering machine at one thing in your own product,
what would it be? I'd like to hear what people try.
