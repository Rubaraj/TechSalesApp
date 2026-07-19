/**
 * Compliance rules — admin-editable scanner rules (mirror of role.model's
 * lazy-connection pattern).
 */
import { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { ComplianceRule } from '../types/index.js';
import { appConn } from '../config/mongo.js';

const stripInternals = (_doc: unknown, ret: Record<string, unknown>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const complianceRuleSchema = new Schema<ComplianceRule>(
  {
    ruleId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    ruleText: { type: String, required: true },
    suggestion: { type: String, required: true },
    phrases: { type: [String], default: [] },
    regex: { type: String },
    severity: { type: String, enum: ['info', 'warn', 'critical'], default: 'warn' },
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

export type ComplianceRuleDoc = HydratedDocument<ComplianceRule>;

let cached: Model<ComplianceRule> | null = null;
export function getComplianceRuleModel(): Model<ComplianceRule> {
  if (cached) return cached;
  if (!appConn) throw new Error('ComplianceRuleModel requested but appConn not initialized.');
  cached = appConn.model<ComplianceRule>('ComplianceRule', complianceRuleSchema, 'complianceRules');
  return cached;
}
export const __resetComplianceRuleModelForTests = (): void => {
  cached = null;
};
