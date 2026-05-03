import { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { Member } from '../types/index.js';
import { appConn } from '../config/mongo.js';

const stripInternals = (_doc: unknown, ret: Record<string, unknown>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const memberSchema = new Schema<Member>(
  {
    memberId: { type: String, required: true, unique: true, index: true },
    policyNumber: { type: String, required: true, index: true },
    dateOfBirth: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    address: { type: Schema.Types.Mixed },
    planId: { type: String, required: true },
    carrier: { type: String, required: true },
    assignedAgentId: { type: String },
    enrollmentDate: { type: String, required: true },
    isActive: { type: Boolean, default: true, index: true },
    createdAt: { type: String, required: true },
  },
  {
    strict: false,
    versionKey: '__v',
    toJSON: { virtuals: false, transform: stripInternals },
    toObject: { virtuals: false, transform: stripInternals },
  },
);

export type MemberDoc = HydratedDocument<Member>;

let cached: Model<Member> | null = null;
export function getMemberModel(): Model<Member> {
  if (cached) return cached;
  if (!appConn) throw new Error('MemberModel requested but appConn not initialized.');
  cached = appConn.model<Member>('Member', memberSchema, 'members');
  return cached;
}
export const __resetMemberModelForTests = (): void => {
  cached = null;
};
