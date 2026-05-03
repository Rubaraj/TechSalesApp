import { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { Target } from '../types/index.js';
import { appConn } from '../config/mongo.js';

const stripInternals = (_doc: unknown, ret: Record<string, unknown>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const targetSchema = new Schema<Target>(
  {
    targetId: { type: String, required: true, unique: true, index: true },
    metric: { type: String, required: true, index: true },
    period: { type: String, required: true, index: true },
    targetValue: { type: Number, required: true },
    points: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    createdAt: { type: String, required: true },
    createdBy: { type: String, required: true },
    updatedAt: { type: String },
    updatedBy: { type: String },
  },
  {
    strict: false,
    versionKey: '__v',
    toJSON: { virtuals: false, transform: stripInternals },
    toObject: { virtuals: false, transform: stripInternals },
  },
);

export type TargetDoc = HydratedDocument<Target>;

let cached: Model<Target> | null = null;
export function getTargetModel(): Model<Target> {
  if (cached) return cached;
  if (!appConn) throw new Error('TargetModel requested but appConn not initialized.');
  cached = appConn.model<Target>('Target', targetSchema, 'targets');
  return cached;
}
export const __resetTargetModelForTests = (): void => {
  cached = null;
};
