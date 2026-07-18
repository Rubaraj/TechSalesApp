/**
 * QA pipeline — prompt builder for the on-demand call QA review.
 * Renders the rubric + transcript + in-call tags + deterministic metrics.
 */
import type { CallLine, CallTag } from '../../models/callRecord.model.js';
import type { CallMetrics } from '../qa/computeCallMetrics.js';

const MAX_TRANSCRIPT_CHARS = 24_000;

export const QA_SYSTEM_PROMPT = `You are a Medicare sales call QA reviewer for a licensed insurance agency.
Score the AGENT's performance on the call transcript below. Be evidence-based:
every score and checklist judgment must cite a short quote or observation from
the transcript. Be fair but rigorous — this feedback is used for coaching.

Scoring dimensions (0-100 each):
- compliance: CMS marketing rules. No superlatives ("best plan"), no absolute
  claims ("completely free", "guaranteed"), no pressure tactics, required
  disclaimers when discussing benefits. Rule-based flags detected during the
  call are listed under TAGS — verify them and look for anything they missed.
- discovery: did the agent learn the prospect's situation — zip/county,
  current coverage, medications, pharmacy, doctors, budget, eligibility?
- communication: clarity, pacing, listening (see talk-ratio metric),
  professionalism, plain-language explanations of Medicare concepts.
- nextSteps: clear outcome — follow-up scheduled, enrollment step set,
  expectations established.

overallScore: weighted judgment (compliance weighs heaviest — a serious
violation should cap the overall score below 60).

disclosureChecklist items to evaluate:
- "Agent identified themselves and the purpose of the call"
- "No superlative or absolute claims about plans"
- "Costs/benefits stated accurately with appropriate qualifiers"
- "Prospect consent/willingness to continue was respected"
- "Clear next step or close was established"`;

function renderMmSs(ts: number, startTs: number): string {
  const sec = Math.max(0, Math.round((ts - startTs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function buildQaUserPrompt(input: {
  lines: CallLine[];
  tags: CallTag[];
  metrics: CallMetrics;
  direction: string;
  durationSec: number;
}): string {
  const startTs = input.lines[0]?.ts ?? 0;
  let transcript = input.lines
    .map((l) => `[${renderMmSs(l.ts, startTs)}] ${l.speaker.toUpperCase()}: ${l.text}`)
    .join('\n');
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
    transcript =
      transcript.slice(0, half) +
      `\n[... transcript truncated ...]\n` +
      transcript.slice(-half);
  }

  const tagLines =
    input.tags.length > 0
      ? input.tags
          .map((t) => `- [${t.kind}] ${JSON.stringify(t.data).slice(0, 200)}`)
          .join('\n')
      : '(none)';

  return `CALL: ${input.direction}, ${input.durationSec}s.

METRICS (deterministic):
- Agent talk share: ${Math.round(input.metrics.agentTalkShare * 100)}%
- Longest agent monologue: ${input.metrics.longestAgentMonologueChars} chars
- Lines: agent ${input.metrics.agentLines}, prospect ${input.metrics.prospectLines}

TAGS detected during the call by rule-based analysis:
${tagLines}

TRANSCRIPT:
${transcript}`;
}
