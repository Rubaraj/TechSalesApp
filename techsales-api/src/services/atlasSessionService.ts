/**
 * Phase 4 (M2) — Direct-Mongo helpers for Atlas chat session + proposal
 * persistence. We skip the 3-backend repo abstraction here because Atlas is
 * mongo-only for the POC; adding json + databricks impls is a Phase 4 followup
 * if a non-Mongo deployment ships later.
 */
import { randomUUID } from 'node:crypto';
import {
  getAtlasChatSessionModel,
  type AtlasChatMessage,
} from '../models/aiChatSession.model.js';
import {
  getAgentProposalModel,
  type AgentProposal,
  type AgentProposalKind,
  type AgentProposalDecision,
} from '../models/agentProposal.model.js';
import { logger } from '../config/logger.js';

const SESSION_MESSAGE_CAP = 200; // hard upper bound; we trim on append

// --- Atlas chat session ----------------------------------------------------

export async function getSessionMessages(
  userId: string,
  limit = 20,
): Promise<AtlasChatMessage[]> {
  const Model = getAtlasChatSessionModel();
  const doc = await Model.findOne({ userId }).lean<{
    messages: AtlasChatMessage[];
  } | null>().exec();
  if (!doc) return [];
  const msgs = doc.messages ?? [];
  return msgs.slice(-limit);
}

export async function appendSessionMessage(
  userId: string,
  message: AtlasChatMessage,
): Promise<void> {
  const Model = getAtlasChatSessionModel();
  // Upsert with $push + $slice to cap at SESSION_MESSAGE_CAP newest messages.
  await Model.updateOne(
    { userId },
    {
      $set: { updatedAt: new Date() },
      $setOnInsert: { userId, createdAt: new Date() },
      $push: {
        messages: { $each: [message], $slice: -SESSION_MESSAGE_CAP },
      },
    },
    { upsert: true },
  ).exec();
}

export async function clearSession(userId: string): Promise<void> {
  const Model = getAtlasChatSessionModel();
  await Model.deleteOne({ userId }).exec();
}

// --- Agent proposals -------------------------------------------------------

export interface CreateProposalInput {
  userId: string;
  kind: AgentProposalKind;
  payload: Record<string, unknown>;
}

export async function createProposal(input: CreateProposalInput): Promise<AgentProposal> {
  const Model = getAgentProposalModel();
  const doc = await Model.create({
    proposalId: randomUUID(),
    userId: input.userId,
    kind: input.kind,
    payload: input.payload,
  });
  logger.info(
    { proposalId: doc.proposalId, kind: doc.kind, userId: doc.userId },
    'Atlas: proposal created',
  );
  return doc.toJSON() as AgentProposal;
}

export async function findProposalById(
  proposalId: string,
): Promise<AgentProposal | null> {
  const Model = getAgentProposalModel();
  const doc = await Model.findOne({ proposalId }).lean<AgentProposal | null>().exec();
  return doc;
}

export async function recordProposalDecision(
  proposalId: string,
  decision: AgentProposalDecision,
  result?: Record<string, unknown>,
): Promise<AgentProposal | null> {
  const Model = getAgentProposalModel();
  const doc = await Model.findOneAndUpdate(
    { proposalId },
    {
      $set: {
        decision,
        executedAt: new Date(),
        ...(result ? { result } : {}),
      },
    },
    { new: true },
  )
    .lean<AgentProposal | null>()
    .exec();
  return doc;
}
