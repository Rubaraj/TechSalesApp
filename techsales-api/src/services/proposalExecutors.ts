/**
 * Phase B — Proposal execution registry.
 *
 * Each Atlas write proposal `kind` maps to one executor. The approval
 * controller looks the executor up here instead of growing an if/else
 * chain — adding a write capability is now: (1) a tool that creates the
 * proposal, (2) an executor here, (3) an ApprovalCard renderer on the FE.
 *
 * Executors run ONLY on an agent-approved proposal, so they are the single
 * enforcement point for write safety: field allowlists live here, not in
 * the tools (a tool shapes the payload, but nothing stops a future tool —
 * or a replayed proposal — from carrying extra fields; the executor is
 * what touches the DB).
 */
import { repos } from '../repositories/registry.js';
import { logger } from '../config/logger.js';
import type { AgentProposalKind } from '../models/agentProposal.model.js';

export type ProposalExecutor = (
  payload: Record<string, unknown>,
  userId: string,
) => Promise<Record<string, unknown> | undefined>;

/**
 * Lead fields Atlas may propose changing. Anything else is dropped.
 * Deliberately excluded: leadStatus (dedicated propose_status_change flow),
 * dob/gender/leadId/assignedTo/createdBy (identity + system fields — those
 * change through the lead form with fuller validation, not via chat).
 */
const LEAD_UPDATE_ALLOWED_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'email',
  'address1',
  'address2',
  'city',
  'state',
  'county',
  'zipCode',
  'medicareNumber',
  'medicaidId',
  'partADate',
  'partBDate',
] as const;

const executeEmail: ProposalExecutor = async (payload) => {
  // POC: mock-send. Log to console + record the payload as the result.
  const p = payload as { to?: string; subject?: string; leadId?: string };
  logger.info({ to: p.to, leadId: p.leadId }, 'Atlas: email APPROVED (mock send)');
  return {
    mocked: true,
    to: p.to,
    subject: p.subject,
    sentAt: new Date().toISOString(),
  };
};

const executeStatus: ProposalExecutor = async (payload, userId) => {
  const p = payload as { leadId?: string; newStatus?: string };
  if (!p.leadId || !p.newStatus) return undefined;
  const updated = await repos.lead.update(p.leadId, {
    leadStatus: p.newStatus as never,
    updatedBy: userId,
  });
  return { leadId: p.leadId, updated: !!updated };
};

const executeDrug: ProposalExecutor = async (payload, userId) => {
  // Append the drug to the lead's taggedDrugs (mirrors the LeadForm
  // add_drug consumer: append, never replace, dedup by drugId).
  const p = payload as {
    leadId?: string;
    drug?: { drugId?: string; drugName?: string; dosage?: string; quantity?: number; frequency?: string };
  };
  if (!p.leadId || !p.drug?.drugId) return undefined;
  const lead = await repos.lead.findById(p.leadId);
  const existing = lead?.taggedDrugs ?? [];
  const alreadyTagged = existing.some((d) => d.drugId === p.drug!.drugId);
  if (!lead || alreadyTagged) {
    return { leadId: p.leadId, drugId: p.drug.drugId, applied: false, alreadyTagged };
  }
  const updated = await repos.lead.update(p.leadId, {
    taggedDrugs: [
      ...existing,
      {
        drugId: p.drug.drugId,
        drugName: p.drug.drugName,
        dosage: p.drug.dosage ?? 'unspecified',
        quantity: p.drug.quantity ?? 30,
        frequency: p.drug.frequency ?? 'unspecified',
      },
    ] as never,
    updatedBy: userId,
  } as never);
  return { leadId: p.leadId, drugId: p.drug.drugId, applied: !!updated };
};

const executeLeadUpdate: ProposalExecutor = async (payload, userId) => {
  const p = payload as { leadId?: string; updates?: Record<string, unknown> };
  if (!p.leadId || !p.updates) return undefined;
  // Enforce the allowlist at execution time — the tool builds the payload,
  // but this is the write boundary.
  const safeUpdates: Record<string, unknown> = {};
  for (const field of LEAD_UPDATE_ALLOWED_FIELDS) {
    const value = p.updates[field];
    if (typeof value === 'string' && value.trim() !== '') {
      safeUpdates[field] = value.trim();
    }
  }
  if (Object.keys(safeUpdates).length === 0) {
    return { leadId: p.leadId, updated: false, error: 'no allowlisted fields in payload' };
  }
  const updated = await repos.lead.update(p.leadId, {
    ...safeUpdates,
    updatedBy: userId,
  } as never);
  return { leadId: p.leadId, updatedFields: Object.keys(safeUpdates), updated: !!updated };
};

const executeNote: ProposalExecutor = async (payload, userId) => {
  const p = payload as { leadId?: string; note?: string };
  if (!p.leadId || !p.note?.trim()) return undefined;
  const lead = await repos.lead.findById(p.leadId);
  if (!lead) return { leadId: p.leadId, updated: false, error: 'lead not found' };
  // APPEND, never replace — same contract as the call copilot's add_note
  // (multiple notes accumulate with newlines between them).
  const existing = (lead as { notes?: string }).notes?.trim();
  const stamped = `[Atlas ${new Date().toISOString().slice(0, 10)}] ${p.note.trim()}`;
  const notes = existing ? `${existing}\n${stamped}` : stamped;
  const updated = await repos.lead.update(p.leadId, {
    notes,
    updatedBy: userId,
  } as never);
  return { leadId: p.leadId, updated: !!updated };
};

export const proposalExecutors: Record<AgentProposalKind, ProposalExecutor> = {
  email: executeEmail,
  status: executeStatus,
  drug: executeDrug,
  lead_update: executeLeadUpdate,
  note: executeNote,
};
