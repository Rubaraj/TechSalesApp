/**
 * Mongoose schema for `medhub_app.aiInteractions` — the per-call audit log
 * for every /api/ai/* request. Bound to `appConn` via the lazy-accessor
 * pattern (mirror `lead.model.ts`).
 *
 * `strict: false` lets later phases tack on richer fields (e.g. retrieval
 * traces, structured tool args) without a schema migration.
 */
import { Schema, type HydratedDocument, type Model } from 'mongoose';
import { appConn } from '../config/mongo.js';
import type { AiInteractionRecord, ToolCallTrace } from '../ai/llm/callbacks.js';

/** Persisted shape (input gets an interactionId stamped on by the repo). */
export type AiInteraction = AiInteractionRecord & { interactionId: string };

const toolCallSchema = new Schema<ToolCallTrace>(
  {
    name: { type: String, required: true },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    latencyMs: { type: Number, default: 0 },
  },
  { _id: false },
);

const aiInteractionSchema = new Schema<AiInteraction>(
  {
    interactionId: { type: String, required: true, unique: true, index: true },
    kind: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    memberId: { type: String, index: true },
    provider: { type: String, required: true, default: 'anthropic' },
    model: { type: String, required: true },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    tokensIn: { type: Number, default: 0 },
    tokensOut: { type: Number, default: 0 },
    cachedInputTokens: { type: Number, default: 0 },
    cachedReadTokens: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    toolCalls: { type: [toolCallSchema], default: [] },
    error: { type: String },
    createdAt: { type: String, required: true, index: true },
  },
  {
    strict: false,
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

export type AiInteractionDoc = HydratedDocument<AiInteraction>;

let cached: Model<AiInteraction> | null = null;
export function getAiInteractionModel(): Model<AiInteraction> {
  if (cached) return cached;
  if (!appConn) {
    throw new Error(
      'AiInteractionModel requested but appConn is not initialized (mongo mode required).',
    );
  }
  cached = appConn.model<AiInteraction>('AiInteraction', aiInteractionSchema, 'aiInteractions');
  return cached;
}

export const __resetAiInteractionModelForTests = (): void => {
  cached = null;
};
