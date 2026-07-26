/**
 * QA pipeline — prompt builder for the on-demand call QA review.
 * Renders the rubric + transcript + in-call tags + deterministic metrics.
 */
import type { CallLine, CallTag } from '../../models/callRecord.model.js';
import type { CallMetrics } from '../qa/computeCallMetrics.js';
import type { QaRubric } from '../qa/qaRubric.js';

const MAX_TRANSCRIPT_CHARS = 24_000;

/**
 * Gap 9 — the system prompt is now assembled from the admin-editable
 * rubric (Admin › QA Rubric): dimension bullets + disclosure checklist
 * come from DB rows; only this scaffold text lives in code.
 */
export function buildQaSystemPrompt(rubric: QaRubric): string {
  const dimensionBullets = rubric.dimensions
    .map((d) => `- ${d.key}: ${d.label} (weight ${d.weight ?? 3}/5). ${d.description ?? ''}`.trim())
    .join('\n');

  const hasHeavyDimension = rubric.dimensions.some((d) => (d.weight ?? 3) >= 5);
  const capSentence = hasHeavyDimension
    ? ' A serious violation on a weight-5 dimension should cap the overall score below 60.'
    : '';

  const disclosureBullets =
    rubric.disclosures.length > 0
      ? rubric.disclosures.map((d) => `- "${d.label}"`).join('\n')
      : '- (no required disclosures configured — return an empty checklist)';

  return `You are a Medicare sales call QA reviewer for a licensed insurance agency.
Score the AGENT's performance on the call transcript below. Be evidence-based:
every score and checklist judgment must cite a short quote or observation from
the transcript. Be fair but rigorous — this feedback is used for coaching.

Scoring dimensions (0-100 each; higher weight = bigger influence on the
overall score). Rule-based flags detected during the call are listed under
TAGS — verify them and look for anything they missed.
${dimensionBullets}

overallScore: weighted judgment across the dimensions above.${capSentence}

disclosureChecklist items to evaluate:
${disclosureBullets}`;
}

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
