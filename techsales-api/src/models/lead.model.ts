/**
 * Mongoose schema for `medhub_app.leads`. Bound explicitly to `appConn`
 * (NOT `mongoose.model`) per plan §3 multi-connection pattern.
 *
 * The `toJSON` transform strips `_id` and `__v` so that responses match the
 * existing FE `Lead` shape verbatim — see plan §8 "ID strategy".
 *
 * `strict: false` lets legacy/unknown fields round-trip without being silently
 * discarded (the seeder writes whatever the sample JSON contains; defensive
 * against future field additions on the FE side before backend catches up).
 */
import { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { Lead, TaggedDrug } from '../types/index.js';
import { appConn } from '../config/mongo.js';

const taggedDrugSchema = new Schema<TaggedDrug>(
  {
    drugId: { type: String, required: true },
    drugName: { type: String },
    dosage: { type: String, required: true },
    quantity: { type: Number, required: true },
    frequency: { type: String, required: true },
    daysSupply: { type: Number },
  },
  { _id: false },
);

const leadSchema = new Schema<Lead>(
  {
    leadId: { type: String, required: true, unique: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dob: { type: String, required: true },
    age: { type: Number },
    gender: { type: String, enum: ['Male', 'Female'], required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address1: { type: String, default: '' },
    address2: { type: String },
    zipCode: { type: String, required: true },
    state: { type: String, required: true },
    county: { type: String, required: true },
    city: { type: String, required: true },
    ethnicity: { type: String },
    race: { type: String },
    medicareNumber: { type: String },
    medicaidId: { type: String },
    stateAssistanceNumber: { type: String },
    partADate: { type: String },
    partBDate: { type: String },
    leadStatus: { type: String, required: true },
    source: { type: String, required: true },
    permissionToContact: { type: Boolean, default: false },
    existingCarrier1Member: { type: Boolean, default: false },
    tobaccoUsage: { type: Boolean, default: false },
    taggedPharmacies: { type: [String], default: [] },
    taggedDrugs: { type: [taggedDrugSchema], default: [] },
    taggedProviders: { type: [String], default: [] },
    // Phase 3b.1 — notes textarea. AI post-call summarizer appends here.
    notes: { type: String },
    // Phase 4 (M1) — Atlas "my pipeline" filter. Backfilled from createdBy.
    assignedTo: { type: String, index: true },
    createdAt: { type: String, required: true },
    createdBy: { type: String, required: true },
    updatedAt: { type: String },
    updatedBy: { type: String },
  },
  {
    strict: false,
    // Mongo manages _id; we use leadId as business key.
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

// Useful indexes (covered by createIndexes script too, but harmless duplicates).
leadSchema.index({ leadStatus: 1 });
leadSchema.index({ state: 1, county: 1 });
leadSchema.index({ createdBy: 1 });
leadSchema.index({ assignedTo: 1 });

export type LeadDoc = HydratedDocument<Lead>;

/**
 * Lazy accessor — `appConn` is undefined in JSON mode, and this module is
 * imported by the registry up front. We must never throw at import time.
 * Callers (MongoLeadRepository) only resolve this in mongo mode.
 */
let cached: Model<Lead> | null = null;
export function getLeadModel(): Model<Lead> {
  if (cached) return cached;
  if (!appConn) {
    throw new Error('LeadModel requested but appConn is not initialized (mongo mode required).');
  }
  cached = appConn.model<Lead>('Lead', leadSchema, 'leads');
  return cached;
}

/** Reset for tests (so repeat imports in a single process don't bind to a stale conn). */
export const __resetLeadModelForTests = (): void => {
  cached = null;
};
