/**
 * QA pipeline — persisted call records. One document per finished call:
 * the full diarized transcript, the tags the rule-based in-call analysis
 * produced (compliance / info / entity / note), and — once a supervisor
 * runs a review — the LLM QA scorecard.
 *
 * Written fire-and-forget from `stopCallAnalysisByCallSid` (the call path
 * never blocks on Mongo). Bound to `appConn` via the lazy-accessor
 * pattern (mirror `aiInteraction.model.ts`).
 */
import { Schema, type HydratedDocument, type Model } from 'mongoose';
import { appConn } from '../config/mongo.js';

export interface CallLine {
  speaker: 'agent' | 'prospect' | 'unknown';
  text: string;
  ts: number;
}

export type CallTagKind = 'compliance' | 'info' | 'entity' | 'note' | 'emotion' | 'coaching';

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
  /** Gap 9 — keys come from the admin-editable rubric at review time. */
  dimensions: Record<string, QaDimension>;
  /** Gap 9 — snapshot of key → label the review was scored against, so old
   *  reviews render their original labels after rubric edits. */
  dimensionLabels?: Record<string, string>;
  strengths: string[];
  coachingPoints: string[];
  disclosureChecklist: Array<{ item: string; met: boolean; evidence: string }>;
}

export interface CallRecord {
  callSid: string;
  userId?: string;
  direction: 'inbound' | 'outbound';
  startedAt: string;
  endedAt: string;
  durationSec: number;
  lines: CallLine[];
  tags: CallTag[];
  /** True when any compliance tag exists — the review-queue criterion. */
  flagged: boolean;
  qaReview:
    | (QaScorecard & { reviewedAt: string; reviewedBy?: string; model: string; interactionId?: string })
    | null;
  createdAt: string;
}

const lineSchema = new Schema<CallLine>(
  {
    speaker: { type: String, enum: ['agent', 'prospect', 'unknown'], required: true },
    text: { type: String, required: true },
    ts: { type: Number, required: true },
  },
  { _id: false },
);

const tagSchema = new Schema<CallTag>(
  {
    kind: {
      type: String,
      enum: ['compliance', 'info', 'entity', 'note', 'emotion', 'coaching'],
      required: true,
    },
    ts: { type: Number, required: true },
    data: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const callRecordSchema = new Schema<CallRecord>(
  {
    callSid: { type: String, required: true, unique: true, index: true },
    userId: { type: String, index: true },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    startedAt: { type: String, required: true },
    endedAt: { type: String, required: true },
    durationSec: { type: Number, default: 0 },
    lines: { type: [lineSchema], default: [] },
    tags: { type: [tagSchema], default: [] },
    flagged: { type: Boolean, default: false, index: true },
    qaReview: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: String, required: true, index: true },
  },
  {
    strict: false,
    versionKey: '__v',
    toJSON: {
      virtuals: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export type CallRecordDoc = HydratedDocument<CallRecord>;

let cached: Model<CallRecord> | null = null;
export function getCallRecordModel(): Model<CallRecord> {
  if (cached) return cached;
  if (!appConn) {
    throw new Error(
      'CallRecordModel requested but appConn is not initialized (mongo mode required).',
    );
  }
  cached = appConn.model<CallRecord>('CallRecord', callRecordSchema, 'callRecords');
  return cached;
}

export const __resetCallRecordModelForTests = (): void => {
  cached = null;
};
