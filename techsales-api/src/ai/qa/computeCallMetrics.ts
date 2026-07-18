/**
 * QA pipeline — deterministic call metrics. Pure function so the numbers
 * are reproducible and never left to LLM arithmetic.
 */
import type { CallLine } from '../../models/callRecord.model.js';

export interface CallMetrics {
  agentLines: number;
  prospectLines: number;
  /** Agent's share of total spoken characters, 0..1. */
  agentTalkShare: number;
  /** Longest run of consecutive agent characters without a prospect turn. */
  longestAgentMonologueChars: number;
}

export function computeCallMetrics(lines: CallLine[]): CallMetrics {
  let agentChars = 0;
  let prospectChars = 0;
  let agentLines = 0;
  let prospectLines = 0;
  let run = 0;
  let longestRun = 0;

  for (const line of lines) {
    if (line.speaker === 'agent') {
      agentLines++;
      agentChars += line.text.length;
      run += line.text.length;
      if (run > longestRun) longestRun = run;
    } else {
      if (line.speaker === 'prospect') {
        prospectLines++;
        prospectChars += line.text.length;
      }
      run = 0;
    }
  }

  const total = agentChars + prospectChars;
  return {
    agentLines,
    prospectLines,
    agentTalkShare: total > 0 ? agentChars / total : 0,
    longestAgentMonologueChars: longestRun,
  };
}
