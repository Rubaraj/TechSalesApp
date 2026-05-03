import { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { MemberAppointment } from '../types/index.js';
import { appConn } from '../config/mongo.js';

const stripInternals = (_doc: unknown, ret: Record<string, unknown>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const memberAppointmentSchema = new Schema<MemberAppointment>(
  {
    appointmentId: { type: String, required: true, unique: true, index: true },
    memberId: { type: String, required: true, index: true },
    agentId: { type: String, required: true },
    agentName: { type: String, required: true },
    appointmentType: { type: String, required: true },
    scheduledDate: { type: String, required: true },
    scheduledTime: { type: String, required: true },
    status: { type: String, required: true, index: true },
    notes: { type: String },
    createdAt: { type: String, required: true },
  },
  {
    strict: false,
    versionKey: '__v',
    toJSON: { virtuals: false, transform: stripInternals },
    toObject: { virtuals: false, transform: stripInternals },
  },
);

export type MemberAppointmentDoc = HydratedDocument<MemberAppointment>;

let cached: Model<MemberAppointment> | null = null;
export function getMemberAppointmentModel(): Model<MemberAppointment> {
  if (cached) return cached;
  if (!appConn) throw new Error('MemberAppointmentModel requested but appConn not initialized.');
  cached = appConn.model<MemberAppointment>('MemberAppointment', memberAppointmentSchema, 'memberAppointments');
  return cached;
}
export const __resetMemberAppointmentModelForTests = (): void => {
  cached = null;
};
