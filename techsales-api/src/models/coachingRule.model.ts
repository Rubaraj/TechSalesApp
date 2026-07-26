/**
 * Coaching rules — admin-editable proactive coaching checks (mirror of
 * complianceRule.model's lazy-connection pattern).
 */
import { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { CoachingRule } from '../types/index.js';
import { appConn } from '../config/mongo.js';

const stripInternals = (_doc: unknown, ret: Record<string, unknown>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const coachingRuleSchema = new Schema<CoachingRule>(
  {
    ruleId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['talk_ratio', 'monologue', 'missed_discovery'],
      required: true,
    },
    tip: { type: String, required: true },
    params: { type: Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String },
  },
  {
    strict: false,
    versionKey: '__v',
    toJSON: { virtuals: false, transform: stripInternals },
    toObject: { virtuals: false, transform: stripInternals },
  },
);

export type CoachingRuleDoc = HydratedDocument<CoachingRule>;

let cached: Model<CoachingRule> | null = null;
export function getCoachingRuleModel(): Model<CoachingRule> {
  if (cached) return cached;
  if (!appConn) throw new Error('CoachingRuleModel requested but appConn not initialized.');
  cached = appConn.model<CoachingRule>('CoachingRule', coachingRuleSchema, 'coachingRules');
  return cached;
}
export const __resetCoachingRuleModelForTests = (): void => {
  cached = null;
};
