/**
 * QA + Supervisor pipelines — FE mirrors of the backend wire shapes
 * (models/callRecord.model.ts + services/callBus.ts SupervisorEvent).
 */

export interface CallLine {
  speaker: 'agent' | 'prospect' | 'unknown';
  text: string;
  ts: number;
}

export type CallTagKind = 'compliance' | 'info' | 'entity' | 'note';

export interface CallTag {
  kind: CallTagKind;
  ts: number;
  data: Record<string, unknown>;
}

export interface QaDimension {
  score: number;
  evidence: string;
}

export interface QaScorecard {
  overallScore: number;
  dimensions: {
    compliance: QaDimension;
    discovery: QaDimension;
    communication: QaDimension;
    nextSteps: QaDimension;
  };
  strengths: string[];
  coachingPoints: string[];
  disclosureChecklist: Array<{ item: string; met: boolean; evidence: string }>;
}

export interface QaReview extends QaScorecard {
  reviewedAt: string;
  reviewedBy?: string;
  model: string;
}

export interface CallRecordSummary {
  callSid: string;
  userId?: string;
  direction: 'inbound' | 'outbound';
  startedAt: string;
  endedAt: string;
  durationSec: number;
  tags: CallTag[];
  flagged: boolean;
  qaReview: QaReview | null;
  createdAt: string;
}

export interface CallRecordDetail extends CallRecordSummary {
  lines: CallLine[];
}

export type SupervisorEvent =
  | {
      type: 'snapshot';
      calls: Array<{
        callSid: string;
        userId?: string;
        agentName?: string;
        direction: string;
        startedAt: number;
      }>;
    }
  | {
      type: 'call_started';
      callSid: string;
      userId?: string;
      agentName?: string;
      direction: string;
      startedAt: number;
    }
  | {
      type: 'call_ended';
      callSid: string;
      userId?: string;
      agentName?: string;
      flagged: boolean;
      tagCounts: Record<string, number>;
      durationSec: number;
    }
  | {
      type: 'compliance_flag';
      callSid: string;
      userId?: string;
      agentName?: string;
      phrase: string;
      rule: string;
      suggestion?: string;
      ts: number;
    }
  | { type: 'qa_completed'; callSid: string; overallScore: number };
