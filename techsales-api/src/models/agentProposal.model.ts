/**
 * Phase 4 (M2) — Pending write actions Atlas proposes for agent approval.
 *
 * When Atlas calls a write tool (`draftFollowUpEmail`, `proposeLeadStatusChange`,
 * `proposeAddDrug`), the tool persists a proposal here and returns a
 * `proposalId`. The FE renders an Approval Card; on Approve, the agent POSTs
 * `/api/ai/atlas/approvals/:proposalId` which executes the action via the
 * matching repo, records the decision + result here, and audits the change.
 *
 * 24h TTL on `createdAt` so unapproved proposals self-purge.
 */
import { Schema, type HydratedDocument, type Model } from 'mongoose';
import { appConn } from '../config/mongo.js';

export type AgentProposalKind = 'email' | 'status' | 'drug' | 'lead_update' | 'note';
export type AgentProposalDecision = 'approve' | 'reject';

export interface AgentProposal {
  proposalId: string;
  userId: string;
  kind: AgentProposalKind;
  /** Free-form payload — kind-specific. Validated at execution time. */
  payload: Record<string, unknown>;
  createdAt: Date;
  executedAt?: Date;
  decision?: AgentProposalDecision;
  /** Result of executing the action (the updated Lead, sent email mock, etc.). */
  result?: Record<string, unknown>;
}

const proposalSchema = new Schema<AgentProposal>(
  {
    proposalId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    kind: {
      type: String,
      enum: ['email', 'status', 'drug', 'lead_update', 'note'],
      required: true,
    },
    payload: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: () => new Date() },
    executedAt: { type: Date },
    decision: { type: String, enum: ['approve', 'reject'] },
    result: { type: Schema.Types.Mixed },
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

// TTL: 24h on createdAt.
proposalSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export type AgentProposalDoc = HydratedDocument<AgentProposal>;

let cached: Model<AgentProposal> | null = null;
export function getAgentProposalModel(): Model<AgentProposal> {
  if (cached) return cached;
  if (!appConn) {
    throw new Error('AgentProposalModel requested but appConn is not initialized (mongo mode required).');
  }
  cached = appConn.model<AgentProposal>('AgentProposal', proposalSchema, 'agentProposals');
  return cached;
}

export const __resetAgentProposalModelForTests = (): void => {
  cached = null;
};
