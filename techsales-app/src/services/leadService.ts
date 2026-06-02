import type { Lead, TaggedDrug, LeadStatus } from '../types';
import type { ServiceResponse } from './baseService';
import leadsData from '../data/runtime/leads.json';
import {
  delay,
  generateId,
  formatDate,
  calculateAge,
  searchByFields,
  filterByField,
  sortByField,
  paginateItems,
} from './baseService';
import { getMode } from '../api/mode';
import { api, apiGet, apiPost, apiPatch, apiDelete } from '../api/apiClient';

// In-memory data store (simulating database) for 'local' mode
let leads: Lead[] = (leadsData as unknown) as Lead[];

export interface LeadFilters {
  status?: LeadStatus;
  state?: string;
  county?: string;
  zipCode?: string;
  existingMember?: boolean;
  createdBy?: string;
  isDualEligible?: boolean;
}

export interface LeadSearchParams {
  searchTerm?: string;
  filters?: LeadFilters;
  sortField?: keyof Lead;
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export type LeadSearchResult = {
  data: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// ============================================================================
// PUBLIC API — unchanged signatures, route by mode.
// ============================================================================

export const getAllLeads = async (): Promise<ServiceResponse<Lead[]>> => {
  if (getMode() === 'local') return _getAllLeadsLocal();
  return apiGet<Lead[]>('/leads');
};

export const getLeadById = async (leadId: string): Promise<ServiceResponse<Lead>> => {
  if (getMode() === 'local') return _getLeadByIdLocal(leadId);
  return apiGet<Lead>(`/leads/${encodeURIComponent(leadId)}`);
};

/**
 * Phase 2.6 — Look up a lead by phone number. Used by the inbound-call view
 * to render the caller's name (best-effort; the panel renders the raw number
 * if no match). Local mode falls back to a naive in-memory scan.
 */
export interface LeadPhoneLookup {
  leadId: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export const lookupLeadByPhone = async (
  phone: string,
): Promise<ServiceResponse<LeadPhoneLookup>> => {
  if (getMode() === 'local') {
    const last10 = phone.replace(/\D/g, '').slice(-10);
    const found = leads.find((l) => (l.phone ?? '').replace(/\D/g, '').slice(-10) === last10);
    if (!found) {
      return { success: false, error: 'No lead matches that phone number' };
    }
    return {
      success: true,
      data: {
        leadId: found.leadId,
        firstName: found.firstName,
        lastName: found.lastName,
        phone: found.phone,
      },
    };
  }
  return apiGet<LeadPhoneLookup>(`/leads/lookup-by-phone?phone=${encodeURIComponent(phone)}`);
};

export const searchLeads = async (
  params: LeadSearchParams,
): Promise<ServiceResponse<LeadSearchResult>> => {
  if (getMode() === 'local') return _searchLeadsLocal(params);
  const qs = buildSearchQuery(params);
  return apiGet<LeadSearchResult>(`/leads/search${qs ? `?${qs}` : ''}`);
};

export const createLead = async (
  leadData: Omit<Lead, 'leadId' | 'age' | 'createdAt' | 'updatedAt'>,
  createdBy: string,
): Promise<ServiceResponse<Lead>> => {
  if (getMode() === 'local') return _createLeadLocal(leadData, createdBy);
  return apiPost<Lead>('/leads', { ...leadData, createdBy });
};

export const updateLead = async (
  leadId: string,
  updates: Partial<Lead>,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  if (getMode() === 'local') return _updateLeadLocal(leadId, updates, updatedBy);
  return apiPatch<Lead>(`/leads/${encodeURIComponent(leadId)}`, { ...updates, updatedBy });
};

export const deleteLead = async (leadId: string): Promise<ServiceResponse<null>> => {
  if (getMode() === 'local') return _deleteLeadLocal(leadId);
  return apiDelete<null>(`/leads/${encodeURIComponent(leadId)}`);
};

export const tagPharmacy = async (
  leadId: string,
  pharmacyId: string,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  if (getMode() === 'local') return _tagPharmacyLocal(leadId, pharmacyId, updatedBy);
  return apiPost<Lead>(`/leads/${encodeURIComponent(leadId)}/pharmacies`, { pharmacyId, updatedBy });
};

export const untagPharmacy = async (
  leadId: string,
  pharmacyId: string,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  if (getMode() === 'local') return _untagPharmacyLocal(leadId, pharmacyId, updatedBy);
  return api<Lead>(
    `/leads/${encodeURIComponent(leadId)}/pharmacies/${encodeURIComponent(pharmacyId)}?updatedBy=${encodeURIComponent(updatedBy)}`,
    { method: 'DELETE' },
  );
};

export const tagDrug = async (
  leadId: string,
  drug: TaggedDrug,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  if (getMode() === 'local') return _tagDrugLocal(leadId, drug, updatedBy);
  return apiPost<Lead>(`/leads/${encodeURIComponent(leadId)}/drugs`, { drug, updatedBy });
};

export const untagDrug = async (
  leadId: string,
  drugId: string,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  if (getMode() === 'local') return _untagDrugLocal(leadId, drugId, updatedBy);
  return api<Lead>(
    `/leads/${encodeURIComponent(leadId)}/drugs/${encodeURIComponent(drugId)}?updatedBy=${encodeURIComponent(updatedBy)}`,
    { method: 'DELETE' },
  );
};

export const tagProvider = async (
  leadId: string,
  providerId: string,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  if (getMode() === 'local') return _tagProviderLocal(leadId, providerId, updatedBy);
  return apiPost<Lead>(`/leads/${encodeURIComponent(leadId)}/providers`, { providerId, updatedBy });
};

export const untagProvider = async (
  leadId: string,
  providerId: string,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  if (getMode() === 'local') return _untagProviderLocal(leadId, providerId, updatedBy);
  return api<Lead>(
    `/leads/${encodeURIComponent(leadId)}/providers/${encodeURIComponent(providerId)}?updatedBy=${encodeURIComponent(updatedBy)}`,
    { method: 'DELETE' },
  );
};

export async function autocompleteLeads(searchTerm: string): Promise<ServiceResponse<Lead[]>> {
  if (getMode() === 'local') return _autocompleteLeadsLocal(searchTerm);
  return apiGet<Lead[]>(`/leads/autocomplete?q=${encodeURIComponent(searchTerm)}`);
}

// ============================================================================
// LOCAL FALLBACK IMPLEMENTATIONS (preserve existing behavior verbatim).
// ============================================================================

const _getAllLeadsLocal = async (): Promise<ServiceResponse<Lead[]>> => {
  await delay();
  return { success: true, data: leads };
};

const _getLeadByIdLocal = async (leadId: string): Promise<ServiceResponse<Lead>> => {
  await delay();
  const lead = leads.find((l) => l.leadId === leadId);
  if (!lead) return { success: false, error: 'Lead not found' };
  return { success: true, data: lead };
};

const _searchLeadsLocal = async (
  params: LeadSearchParams,
): Promise<ServiceResponse<LeadSearchResult>> => {
  await delay();

  let filteredLeads = [...leads];

  if (params.searchTerm) {
    filteredLeads = searchByFields(filteredLeads, params.searchTerm, [
      'firstName',
      'lastName',
      'email',
      'phone',
      'city',
      'medicareNumber',
    ]);
  }

  if (params.filters) {
    if (params.filters.status) {
      filteredLeads = filterByField(filteredLeads, 'leadStatus', params.filters.status);
    }
    if (params.filters.state) {
      filteredLeads = filterByField(filteredLeads, 'state', params.filters.state);
    }
    if (params.filters.county) {
      filteredLeads = filterByField(filteredLeads, 'county', params.filters.county);
    }
    if (params.filters.zipCode) {
      filteredLeads = filterByField(filteredLeads, 'zipCode', params.filters.zipCode);
    }
    if (params.filters.existingMember !== undefined) {
      filteredLeads = filterByField(
        filteredLeads,
        'existingCarrier1Member',
        params.filters.existingMember,
      );
    }
    if (params.filters.createdBy) {
      filteredLeads = filterByField(filteredLeads, 'createdBy', params.filters.createdBy);
    }
  }

  if (params.sortField) {
    filteredLeads = sortByField(
      filteredLeads,
      params.sortField,
      params.sortDirection || 'asc',
    );
  }

  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  const { data, total, totalPages } = paginateItems(filteredLeads, page, pageSize);

  return {
    success: true,
    data: { data, total, page, pageSize, totalPages },
  };
};

const _createLeadLocal = async (
  leadData: Omit<Lead, 'leadId' | 'age' | 'createdAt' | 'updatedAt'>,
  createdBy: string,
): Promise<ServiceResponse<Lead>> => {
  await delay();

  const newLead: Lead = {
    ...leadData,
    leadId: generateId('LEAD'),
    age: calculateAge(leadData.dob),
    createdAt: formatDate(),
    createdBy,
    taggedPharmacies: leadData.taggedPharmacies || [],
    taggedDrugs: leadData.taggedDrugs || [],
    taggedProviders: leadData.taggedProviders || [],
  };

  leads.push(newLead);

  return { success: true, data: newLead, message: 'Lead created successfully' };
};

const _updateLeadLocal = async (
  leadId: string,
  updates: Partial<Lead>,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  await delay();

  const index = leads.findIndex((l) => l.leadId === leadId);
  if (index === -1) return { success: false, error: 'Lead not found' };

  leads[index] = {
    ...leads[index],
    ...updates,
    updatedAt: formatDate(),
    updatedBy,
  };

  return { success: true, data: leads[index], message: 'Lead updated successfully' };
};

const _deleteLeadLocal = async (leadId: string): Promise<ServiceResponse<null>> => {
  await delay();

  const index = leads.findIndex((l) => l.leadId === leadId);
  if (index === -1) return { success: false, error: 'Lead not found' };

  leads.splice(index, 1);
  return { success: true, data: null, message: 'Lead deleted successfully' };
};

const _tagPharmacyLocal = async (
  leadId: string,
  pharmacyId: string,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  await delay();

  const lead = leads.find((l) => l.leadId === leadId);
  if (!lead) return { success: false, error: 'Lead not found' };

  if (lead.taggedPharmacies.length >= 3) {
    return { success: false, error: 'Maximum 3 pharmacies can be tagged' };
  }
  if (lead.taggedPharmacies.includes(pharmacyId)) {
    return { success: false, error: 'Pharmacy already tagged' };
  }

  lead.taggedPharmacies.push(pharmacyId);
  lead.updatedAt = formatDate();
  lead.updatedBy = updatedBy;

  return { success: true, data: lead, message: 'Pharmacy tagged successfully' };
};

const _untagPharmacyLocal = async (
  leadId: string,
  pharmacyId: string,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  await delay();

  const lead = leads.find((l) => l.leadId === leadId);
  if (!lead) return { success: false, error: 'Lead not found' };

  const index = lead.taggedPharmacies.indexOf(pharmacyId);
  if (index === -1) return { success: false, error: 'Pharmacy not tagged to this lead' };

  lead.taggedPharmacies.splice(index, 1);
  lead.updatedAt = formatDate();
  lead.updatedBy = updatedBy;

  return { success: true, data: lead, message: 'Pharmacy untagged successfully' };
};

const _tagDrugLocal = async (
  leadId: string,
  drug: TaggedDrug,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  await delay();

  const lead = leads.find((l) => l.leadId === leadId);
  if (!lead) return { success: false, error: 'Lead not found' };

  const existingDrug = lead.taggedDrugs.find((d) => d.drugId === drug.drugId);
  if (existingDrug) {
    Object.assign(existingDrug, drug);
  } else {
    lead.taggedDrugs.push(drug);
  }

  lead.updatedAt = formatDate();
  lead.updatedBy = updatedBy;

  return { success: true, data: lead, message: 'Drug tagged successfully' };
};

const _untagDrugLocal = async (
  leadId: string,
  drugId: string,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  await delay();

  const lead = leads.find((l) => l.leadId === leadId);
  if (!lead) return { success: false, error: 'Lead not found' };

  const index = lead.taggedDrugs.findIndex((d) => d.drugId === drugId);
  if (index === -1) return { success: false, error: 'Drug not tagged to this lead' };

  lead.taggedDrugs.splice(index, 1);
  lead.updatedAt = formatDate();
  lead.updatedBy = updatedBy;

  return { success: true, data: lead, message: 'Drug untagged successfully' };
};

const _tagProviderLocal = async (
  leadId: string,
  providerId: string,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  await delay();

  const lead = leads.find((l) => l.leadId === leadId);
  if (!lead) return { success: false, error: 'Lead not found' };

  if (lead.taggedProviders.length >= 5) {
    return { success: false, error: 'Maximum 5 providers can be tagged' };
  }
  if (lead.taggedProviders.includes(providerId)) {
    return { success: false, error: 'Provider already tagged' };
  }

  lead.taggedProviders.push(providerId);
  lead.updatedAt = formatDate();
  lead.updatedBy = updatedBy;

  return { success: true, data: lead, message: 'Provider tagged successfully' };
};

const _untagProviderLocal = async (
  leadId: string,
  providerId: string,
  updatedBy: string,
): Promise<ServiceResponse<Lead>> => {
  await delay();

  const lead = leads.find((l) => l.leadId === leadId);
  if (!lead) return { success: false, error: 'Lead not found' };

  const index = lead.taggedProviders.indexOf(providerId);
  if (index === -1) return { success: false, error: 'Provider not tagged to this lead' };

  lead.taggedProviders.splice(index, 1);
  lead.updatedAt = formatDate();
  lead.updatedBy = updatedBy;

  return { success: true, data: lead, message: 'Provider untagged successfully' };
};

const _autocompleteLeadsLocal = async (
  searchTerm: string,
): Promise<ServiceResponse<Lead[]>> => {
  await delay(50);

  if (!searchTerm || searchTerm.length < 2) {
    return { success: true, data: [] };
  }

  const lowerSearch = searchTerm.toLowerCase();

  const matches = leads
    .filter((l) => {
      const fullName = `${l.firstName} ${l.lastName}`.toLowerCase();
      return (
        fullName.includes(lowerSearch) ||
        l.firstName.toLowerCase().includes(lowerSearch) ||
        l.lastName.toLowerCase().includes(lowerSearch)
      );
    })
    .slice(0, 10);

  return { success: true, data: matches };
};

// ============================================================================
// HELPERS
// ============================================================================

function buildSearchQuery(params: LeadSearchParams): string {
  const sp = new URLSearchParams();
  if (params.searchTerm) sp.set('searchTerm', params.searchTerm);
  if (params.sortField) sp.set('sortBy', String(params.sortField));
  if (params.sortDirection) sp.set('sortDir', params.sortDirection);
  if (params.page !== undefined) sp.set('page', String(params.page));
  if (params.pageSize !== undefined) sp.set('pageSize', String(params.pageSize));
  if (params.filters) {
    const f = params.filters;
    if (f.status) sp.set('leadStatus', f.status);
    if (f.state) sp.set('state', f.state);
    if (f.county) sp.set('county', f.county);
    if (f.zipCode) sp.set('zipCode', f.zipCode);
    if (f.existingMember !== undefined) sp.set('existingCarrier1Member', String(f.existingMember));
    if (f.createdBy) sp.set('createdBy', f.createdBy);
  }
  return sp.toString();
}
