/**
 * QA rubric items — admin-editable scoring dimensions + disclosure
 * checklist (mirror of coachingRule.model's lazy-connection pattern).
 */
import { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { QaRubricItem } from '../types/index.js';
import { appConn } from '../config/mongo.js';

const stripInternals = (_doc: unknown, ret: Record<string, unknown>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const qaRubricItemSchema = new Schema<QaRubricItem>(
  {
    itemId: { type: String, required: true, unique: true, index: true },
    kind: { type: String, enum: ['dimension', 'disclosure'], required: true },
    key: { type: String },
    label: { type: String, required: true },
    description: { type: String },
    weight: { type: Number },
    sortOrder: { type: Number, default: 0 },
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

export type QaRubricItemDoc = HydratedDocument<QaRubricItem>;

let cached: Model<QaRubricItem> | null = null;
export function getQaRubricItemModel(): Model<QaRubricItem> {
  if (cached) return cached;
  if (!appConn) throw new Error('QaRubricItemModel requested but appConn not initialized.');
  cached = appConn.model<QaRubricItem>('QaRubricItem', qaRubricItemSchema, 'qaRubricItems');
  return cached;
}
export const __resetQaRubricItemModelForTests = (): void => {
  cached = null;
};
