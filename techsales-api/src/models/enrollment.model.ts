import { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { Enrollment } from '../types/index.js';
import { appConn } from '../config/mongo.js';

const stripInternals = (_doc: unknown, ret: Record<string, unknown>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const enrollmentSchema = new Schema<Enrollment>(
  {
    enrollmentId: { type: String, required: true, unique: true, index: true },
    leadId: { type: String, required: true, index: true },
    planId: { type: String, required: true, index: true },
    agentId: { type: String, required: true, index: true },
    enrollmentDate: { type: String, required: true },
    effectiveDate: { type: String, required: true },
    enrollmentType: { type: String, required: true },
    enrollmentPeriod: { type: String, required: true },
    status: { type: String, required: true, index: true },
    confirmationNumber: { type: String },
    premium: { type: Number, default: 0 },
    medicaidEligible: { type: Boolean, default: false },
    lisLevel: { type: Number },
    notes: { type: String },
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

export type EnrollmentDoc = HydratedDocument<Enrollment>;

let cached: Model<Enrollment> | null = null;
export function getEnrollmentModel(): Model<Enrollment> {
  if (cached) return cached;
  if (!appConn) throw new Error('EnrollmentModel requested but appConn not initialized.');
  cached = appConn.model<Enrollment>('Enrollment', enrollmentSchema, 'enrollments');
  return cached;
}
export const __resetEnrollmentModelForTests = (): void => {
  cached = null;
};
