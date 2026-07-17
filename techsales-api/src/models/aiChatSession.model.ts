/**
 * Phase 4 (M2) — Atlas chat session persistence.
 *
 * One document per agent (`userId`), storing the rolling conversation history.
 * The Atlas chat controller loads the last N turns on each request to provide
 * context; new user + assistant messages are appended after each turn.
 *
 * 30-day TTL on `updatedAt` so abandoned sessions self-purge.
 */
import { Schema, type HydratedDocument, type Model } from 'mongoose';
import { appConn } from '../config/mongo.js';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface AtlasChatMessage {
  role: ChatRole;
  content: string;
  /** Phase 4 (M3) — when the assistant message included tool calls, the
   *  agent records them here for replay + debugging. */
  toolCalls?: Array<{ name: string; input: unknown; output: unknown; latencyMs: number }>;
  /** Rich-chat — display cards emitted during this assistant turn, persisted
   *  so cards survive panel reloads (session GET returns full docs). */
  cards?: Array<{ card: string; tool: string; data: unknown; ts: number }>;
  ts: number;
}

export interface AtlasChatSession {
  userId: string;
  messages: AtlasChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const toolCallSchema = new Schema(
  {
    name: { type: String, required: true },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    latencyMs: { type: Number },
  },
  { _id: false },
);

const cardSchema = new Schema(
  {
    card: { type: String, required: true },
    tool: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    ts: { type: Number, required: true },
  },
  { _id: false },
);

const messageSchema = new Schema<AtlasChatMessage>(
  {
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    // Not required: a card-only assistant turn persists with content ''.
    // (Update-path writes skip validators anyway — this is defensive.)
    content: { type: String, required: false, default: '' },
    toolCalls: { type: [toolCallSchema], default: undefined },
    cards: { type: [cardSchema], default: undefined },
    ts: { type: Number, required: true },
  },
  { _id: false },
);

const sessionSchema = new Schema<AtlasChatSession>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    messages: { type: [messageSchema], default: [] },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  {
    versionKey: '__v',
    toJSON: {
      virtuals: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// TTL: 30 days on updatedAt — Mongoose adds the index at boot.
sessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export type AtlasChatSessionDoc = HydratedDocument<AtlasChatSession>;

let cached: Model<AtlasChatSession> | null = null;
export function getAtlasChatSessionModel(): Model<AtlasChatSession> {
  if (cached) return cached;
  if (!appConn) {
    throw new Error('AtlasChatSessionModel requested but appConn is not initialized (mongo mode required).');
  }
  cached = appConn.model<AtlasChatSession>('AtlasChatSession', sessionSchema, 'atlasChatSessions');
  return cached;
}

export const __resetAtlasChatSessionModelForTests = (): void => {
  cached = null;
};
