/**
 * Lead controller — wraps repo calls into `ServiceResponse<T>` per plan §6.
 *
 * - `getAllLeads`         → `ServiceResponse<Lead[]>`
 * - `getLeadById`         → `ServiceResponse<Lead>`
 * - `searchLeads`         → `ServiceResponse<Paginated<Lead>>` (wrapped — plan §6 critical)
 * - `autocompleteLeads`   → `ServiceResponse<Lead[]>`
 * - `createLead`          → `ServiceResponse<Lead>` + 201
 * - `updateLead`          → `ServiceResponse<Lead>` + 200
 * - `deleteLead`          → `ServiceResponse<null>` + 200
 * - tag/untag operations  → `ServiceResponse<Lead>`
 *
 * `createdBy`/`updatedBy` come from request body (no auth middleware — plan §6).
 */
import type { Request, Response } from 'express';
import type { Lead, TaggedDrug } from '../types/index.js';
import type { Paginated, SearchParams, ServiceResponse } from '../repositories/types.js';
import { repos } from '../repositories/registry.js';

/** Express 5 types route params as `string | string[]`; force-cast to string. */
const param = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '');

export async function getAllLeads(_req: Request, res: Response<ServiceResponse<Lead[]>>): Promise<void> {
  const data = await repos.lead.findAll();
  res.json({ success: true, data });
}

export async function getLeadById(req: Request, res: Response<ServiceResponse<Lead>>): Promise<void> {
  const lead = await repos.lead.findById(param(param(req.params.id)));
  if (!lead) {
    res.status(404).json({ success: false, error: 'Lead not found' });
    return;
  }
  res.json({ success: true, data: lead });
}

/**
 * Phase 2.6 — Look up a lead by phone number for inbound-call attribution.
 * Used by the incoming-call modal to show the caller's name if known. The
 * `phone` query param can be E.164 or any digit-y string; matching is by
 * trailing-10 digits (handles stored format variance).
 */
export async function lookupLeadByPhone(
  req: Request,
  res: Response<
    ServiceResponse<
      Pick<
        Lead,
        | 'leadId'
        | 'firstName'
        | 'lastName'
        | 'phone'
        | 'leadStatus'
        | 'state'
        | 'updatedAt'
      >
    >
  >,
): Promise<void> {
  const phone = stringOrUndef(req.query.phone) ?? '';
  if (!phone) {
    res.status(400).json({ success: false, error: '`phone` query parameter is required' });
    return;
  }
  const lead = await repos.lead.findByPhone(phone);
  if (!lead) {
    res.status(404).json({ success: false, error: 'No lead matches that phone number' });
    return;
  }
  // Phase 4 — return enough fields for the outbound-dial IdentifiedLeadCard
  // (name + status chip + state + last-activity timestamp). Existing callers
  // (inbound IncomingCallView) only read leadId / name and are unaffected
  // by the extra fields. Dual/LIS flags live on ExtractedEntities, not the
  // persistent Lead — they're not surfaced here.
  res.json({
    success: true,
    data: {
      leadId: lead.leadId,
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone,
      leadStatus: lead.leadStatus,
      state: lead.state,
      updatedAt: lead.updatedAt,
    },
  });
}

export async function searchLeads(
  req: Request,
  res: Response<ServiceResponse<Paginated<Lead>>>,
): Promise<void> {
  const q = req.query;
  const params: SearchParams<Lead> = {
    searchTerm: stringOrUndef(q.searchTerm) ?? stringOrUndef(q.q),
    sortBy: stringOrUndef(q.sortBy) ?? stringOrUndef(q.sortField),
    sortDir: (stringOrUndef(q.sortDir) ?? stringOrUndef(q.sortDirection)) === 'desc' ? 'desc' : 'asc',
    page: numOrUndef(q.page) ?? 1,
    pageSize: numOrUndef(q.pageSize) ?? 10,
    filters: parseFilters(q),
  };
  const result = await repos.lead.search(params);
  res.json({ success: true, data: result });
}

export async function autocompleteLeads(
  req: Request,
  res: Response<ServiceResponse<Lead[]>>,
): Promise<void> {
  const term = stringOrUndef(req.query.q) ?? '';
  const data = await repos.lead.autocomplete(term);
  res.json({ success: true, data });
}

export async function createLead(req: Request, res: Response<ServiceResponse<Lead>>): Promise<void> {
  const body = (req.body ?? {}) as Partial<Lead> & { createdBy?: string };
  if (!body.createdBy || typeof body.createdBy !== 'string') {
    res.status(400).json({ success: false, error: 'createdBy is required in request body' });
    return;
  }
  // Strip leadId if client supplied it — we generate ours.
  const input = { ...body } as Omit<Lead, 'id'>;
  const lead = await repos.lead.create(input);
  res.status(201).json({ success: true, data: lead, message: 'Lead created successfully' });
}

export async function updateLead(req: Request, res: Response<ServiceResponse<Lead>>): Promise<void> {
  const body = (req.body ?? {}) as Partial<Lead> & { updatedBy?: string };
  const updatedBy = body.updatedBy && typeof body.updatedBy === 'string' ? body.updatedBy : undefined;
  const patch = { ...body };
  if (updatedBy) patch.updatedBy = updatedBy;
  const updated = await repos.lead.update(param(req.params.id), patch);
  if (!updated) {
    res.status(404).json({ success: false, error: 'Lead not found' });
    return;
  }
  res.json({ success: true, data: updated, message: 'Lead updated successfully' });
}

export async function deleteLead(req: Request, res: Response<ServiceResponse<null>>): Promise<void> {
  const ok = await repos.lead.delete(param(req.params.id));
  if (!ok) {
    res.status(404).json({ success: false, error: 'Lead not found' });
    return;
  }
  res.json({ success: true, data: null, message: 'Lead deleted successfully' });
}

// ---------- tagging operations ----------

export async function tagPharmacy(req: Request, res: Response<ServiceResponse<Lead>>): Promise<void> {
  const { pharmacyId, updatedBy } = (req.body ?? {}) as { pharmacyId?: string; updatedBy?: string };
  if (!pharmacyId || !updatedBy) {
    res.status(400).json({ success: false, error: 'pharmacyId and updatedBy are required' });
    return;
  }
  const result = await repos.lead.tagPharmacy(param(req.params.id), pharmacyId, updatedBy);
  respondTag(res, result, 'Pharmacy tagged successfully');
}

export async function untagPharmacy(req: Request, res: Response<ServiceResponse<Lead>>): Promise<void> {
  const pharmacyId = param(req.params.pharmacyId);
  const updatedBy = stringOrUndef((req.body ?? {}).updatedBy) ?? stringOrUndef(req.query.updatedBy) ?? 'system';
  const result = await repos.lead.untagPharmacy(param(req.params.id), pharmacyId, updatedBy);
  respondTag(res, result, 'Pharmacy untagged successfully');
}

export async function tagDrug(req: Request, res: Response<ServiceResponse<Lead>>): Promise<void> {
  const body = (req.body ?? {}) as { drug?: TaggedDrug; updatedBy?: string };
  if (!body.drug || !body.drug.drugId || !body.updatedBy) {
    res.status(400).json({ success: false, error: 'drug (with drugId) and updatedBy are required' });
    return;
  }
  const result = await repos.lead.tagDrug(param(req.params.id), body.drug, body.updatedBy);
  respondTag(res, result, 'Drug tagged successfully');
}

export async function untagDrug(req: Request, res: Response<ServiceResponse<Lead>>): Promise<void> {
  const drugId = param(req.params.drugId);
  const updatedBy = stringOrUndef((req.body ?? {}).updatedBy) ?? stringOrUndef(req.query.updatedBy) ?? 'system';
  const result = await repos.lead.untagDrug(param(req.params.id), drugId, updatedBy);
  respondTag(res, result, 'Drug untagged successfully');
}

export async function tagProvider(req: Request, res: Response<ServiceResponse<Lead>>): Promise<void> {
  const { providerId, updatedBy } = (req.body ?? {}) as { providerId?: string; updatedBy?: string };
  if (!providerId || !updatedBy) {
    res.status(400).json({ success: false, error: 'providerId and updatedBy are required' });
    return;
  }
  const result = await repos.lead.tagProvider(param(req.params.id), providerId, updatedBy);
  respondTag(res, result, 'Provider tagged successfully');
}

export async function untagProvider(req: Request, res: Response<ServiceResponse<Lead>>): Promise<void> {
  const providerId = param(req.params.providerId);
  const updatedBy = stringOrUndef((req.body ?? {}).updatedBy) ?? stringOrUndef(req.query.updatedBy) ?? 'system';
  const result = await repos.lead.untagProvider(param(req.params.id), providerId, updatedBy);
  respondTag(res, result, 'Provider untagged successfully');
}

// ---------- helpers ----------

function respondTag(
  res: Response<ServiceResponse<Lead>>,
  result: Lead | { error: string },
  successMsg: string,
): void {
  if ('error' in result) {
    const status = result.error === 'Lead not found' ? 404 : 400;
    res.status(status).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result, message: successMsg });
}

function stringOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function numOrUndef(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}
function boolOrUndef(v: unknown): boolean | undefined {
  if (typeof v !== 'string') return undefined;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

/**
 * Pulls known lead filters out of the query string. Anything that isn't a
 * pagination/sort/searchTerm key gets folded in. Boolean fields are coerced.
 */
function parseFilters(q: Request['query']): Partial<Lead> {
  const RESERVED = new Set(['page', 'pageSize', 'sortBy', 'sortDir', 'sortField', 'sortDirection', 'searchTerm', 'q']);
  const filters: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(q)) {
    if (RESERVED.has(key)) continue;
    if (raw === undefined) continue;
    const val = Array.isArray(raw) ? raw[0] : raw;
    if (typeof val !== 'string' || val.length === 0) continue;

    if (key === 'permissionToContact' || key === 'existingCarrier1Member' || key === 'tobaccoUsage') {
      const b = boolOrUndef(val);
      if (b !== undefined) filters[key] = b;
    } else {
      filters[key] = val;
    }
  }
  return filters as Partial<Lead>;
}
