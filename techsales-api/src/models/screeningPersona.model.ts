/**
 * Screening personas — per-agent AI assistant tuning (mirror of
 * simulatorPersona.model's lazy-connection pattern).
 */
import { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { ScreeningPersonaRecord } from '../types/index.js';
import { appConn } from '../config/mongo.js';

const stripInternals = (_doc: unknown, ret: Record<string, unknown>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const screeningPersonaSchema = new Schema<ScreeningPersonaRecord>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    greeting: { type: String, required: true },
    // Mongoose `required` rejects empty strings — instructions may be ''.
    instructions: { type: String, default: '' },
    voice: { type: String, required: true },
    offerPlans: { type: Boolean, default: true },
    createLeadLive: { type: Boolean, default: true },
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

export type ScreeningPersonaDoc = HydratedDocument<ScreeningPersonaRecord>;

let cached: Model<ScreeningPersonaRecord> | null = null;
export function getScreeningPersonaModel(): Model<ScreeningPersonaRecord> {
  if (cached) return cached;
  if (!appConn) throw new Error('ScreeningPersonaModel requested but appConn not initialized.');
  cached = appConn.model<ScreeningPersonaRecord>(
    'ScreeningPersona',
    screeningPersonaSchema,
    'screeningPersonas',
  );
  return cached;
}
export const __resetScreeningPersonaModelForTests = (): void => {
  cached = null;
};
