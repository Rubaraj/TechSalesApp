/**
 * Simulator personas — admin-editable training scenarios (mirror of
 * coachingRule.model's lazy-connection pattern).
 */
import { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { SimulatorPersonaRecord } from '../types/index.js';
import { appConn } from '../config/mongo.js';

const stripInternals = (_doc: unknown, ret: Record<string, unknown>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const simulatorPersonaSchema = new Schema<SimulatorPersonaRecord>(
  {
    personaId: { type: String, required: true, unique: true, index: true },
    label: { type: String, required: true },
    description: { type: String, required: true },
    voice: { type: String, required: true },
    greeting: { type: String, required: true },
    prompt: { type: String, required: true },
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

export type SimulatorPersonaDoc = HydratedDocument<SimulatorPersonaRecord>;

let cached: Model<SimulatorPersonaRecord> | null = null;
export function getSimulatorPersonaModel(): Model<SimulatorPersonaRecord> {
  if (cached) return cached;
  if (!appConn) throw new Error('SimulatorPersonaModel requested but appConn not initialized.');
  cached = appConn.model<SimulatorPersonaRecord>(
    'SimulatorPersona',
    simulatorPersonaSchema,
    'simulatorPersonas',
  );
  return cached;
}
export const __resetSimulatorPersonaModelForTests = (): void => {
  cached = null;
};
