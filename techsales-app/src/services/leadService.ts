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

// In-memory data store (simulating database)
// Using unknown cast to handle JSON null vs undefined
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

// Get all leads
export const getAllLeads = async (): Promise<ServiceResponse<Lead[]>> => {
  await delay();
  return { success: true, data: leads };
};

// Get lead by ID
export const getLeadById = async (leadId: string): Promise<ServiceResponse<Lead>> => {
  await delay();
  const lead = leads.find(l => l.leadId === leadId);
  
  if (!lead) {
    return { success: false, error: 'Lead not found' };
  }
  
  return { success: true, data: lead };
};

// Search leads with filters
export const searchLeads = async (params: LeadSearchParams): Promise<ServiceResponse<{
  data: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}>> => {
  await delay();
  
  let filteredLeads = [...leads];
  
  // Apply search
  if (params.searchTerm) {
    filteredLeads = searchByFields(filteredLeads, params.searchTerm, [
      'firstName', 'lastName', 'email', 'phone', 'city', 'medicareNumber'
    ]);
  }
  
  // Apply filters
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
      filteredLeads = filterByField(filteredLeads, 'existingAetnaMember', params.filters.existingMember);
    }
    if (params.filters.createdBy) {
      filteredLeads = filterByField(filteredLeads, 'createdBy', params.filters.createdBy);
    }
  }
  
  // Apply sorting
  if (params.sortField) {
    filteredLeads = sortByField(filteredLeads, params.sortField, params.sortDirection || 'asc');
  }
  
  // Apply pagination
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  const { data, total, totalPages } = paginateItems(filteredLeads, page, pageSize);
  
  return {
    success: true,
    data: { data, total, page, pageSize, totalPages }
  };
};

// Create new lead
export const createLead = async (
  leadData: Omit<Lead, 'leadId' | 'age' | 'createdAt' | 'updatedAt'>,
  createdBy: string
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
    taggedProviders: leadData.taggedProviders || []
  };
  
  leads.push(newLead);
  
  return { success: true, data: newLead, message: 'Lead created successfully' };
};

// Update lead
export const updateLead = async (
  leadId: string,
  updates: Partial<Lead>,
  updatedBy: string
): Promise<ServiceResponse<Lead>> => {
  await delay();
  
  const index = leads.findIndex(l => l.leadId === leadId);
  
  if (index === -1) {
    return { success: false, error: 'Lead not found' };
  }
  
  leads[index] = {
    ...leads[index],
    ...updates,
    updatedAt: formatDate(),
    updatedBy
  };
  
  return { success: true, data: leads[index], message: 'Lead updated successfully' };
};

// Delete lead
export const deleteLead = async (leadId: string): Promise<ServiceResponse<null>> => {
  await delay();
  
  const index = leads.findIndex(l => l.leadId === leadId);
  
  if (index === -1) {
    return { success: false, error: 'Lead not found' };
  }
  
  leads.splice(index, 1);
  
  return { success: true, data: null, message: 'Lead deleted successfully' };
};

// Tag pharmacy to lead
export const tagPharmacy = async (
  leadId: string,
  pharmacyId: string,
  updatedBy: string
): Promise<ServiceResponse<Lead>> => {
  await delay();
  
  const lead = leads.find(l => l.leadId === leadId);
  
  if (!lead) {
    return { success: false, error: 'Lead not found' };
  }
  
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

// Remove pharmacy from lead
export const untagPharmacy = async (
  leadId: string,
  pharmacyId: string,
  updatedBy: string
): Promise<ServiceResponse<Lead>> => {
  await delay();
  
  const lead = leads.find(l => l.leadId === leadId);
  
  if (!lead) {
    return { success: false, error: 'Lead not found' };
  }
  
  const index = lead.taggedPharmacies.indexOf(pharmacyId);
  if (index === -1) {
    return { success: false, error: 'Pharmacy not tagged to this lead' };
  }
  
  lead.taggedPharmacies.splice(index, 1);
  lead.updatedAt = formatDate();
  lead.updatedBy = updatedBy;
  
  return { success: true, data: lead, message: 'Pharmacy untagged successfully' };
};

// Tag drug to lead
export const tagDrug = async (
  leadId: string,
  drug: TaggedDrug,
  updatedBy: string
): Promise<ServiceResponse<Lead>> => {
  await delay();
  
  const lead = leads.find(l => l.leadId === leadId);
  
  if (!lead) {
    return { success: false, error: 'Lead not found' };
  }
  
  // Check if drug already tagged
  const existingDrug = lead.taggedDrugs.find(d => d.drugId === drug.drugId);
  if (existingDrug) {
    // Update existing drug
    Object.assign(existingDrug, drug);
  } else {
    lead.taggedDrugs.push(drug);
  }
  
  lead.updatedAt = formatDate();
  lead.updatedBy = updatedBy;
  
  return { success: true, data: lead, message: 'Drug tagged successfully' };
};

// Remove drug from lead
export const untagDrug = async (
  leadId: string,
  drugId: string,
  updatedBy: string
): Promise<ServiceResponse<Lead>> => {
  await delay();
  
  const lead = leads.find(l => l.leadId === leadId);
  
  if (!lead) {
    return { success: false, error: 'Lead not found' };
  }
  
  const index = lead.taggedDrugs.findIndex(d => d.drugId === drugId);
  if (index === -1) {
    return { success: false, error: 'Drug not tagged to this lead' };
  }
  
  lead.taggedDrugs.splice(index, 1);
  lead.updatedAt = formatDate();
  lead.updatedBy = updatedBy;
  
  return { success: true, data: lead, message: 'Drug untagged successfully' };
};

// Tag provider to lead
export const tagProvider = async (
  leadId: string,
  providerId: string,
  updatedBy: string
): Promise<ServiceResponse<Lead>> => {
  await delay();
  
  const lead = leads.find(l => l.leadId === leadId);
  
  if (!lead) {
    return { success: false, error: 'Lead not found' };
  }
  
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

// Remove provider from lead
export const untagProvider = async (
  leadId: string,
  providerId: string,
  updatedBy: string
): Promise<ServiceResponse<Lead>> => {
  await delay();
  
  const lead = leads.find(l => l.leadId === leadId);
  
  if (!lead) {
    return { success: false, error: 'Lead not found' };
  }
  
  const index = lead.taggedProviders.indexOf(providerId);
  if (index === -1) {
    return { success: false, error: 'Provider not tagged to this lead' };
  }
  
  lead.taggedProviders.splice(index, 1);
  lead.updatedAt = formatDate();
  lead.updatedBy = updatedBy;
  
  return { success: true, data: lead, message: 'Provider untagged successfully' };
};

// Autocomplete lead search by name (returns top 10 matches)
export async function autocompleteLeads(searchTerm: string): Promise<ServiceResponse<Lead[]>> {
  await delay(50); // Faster for autocomplete
  
  if (!searchTerm || searchTerm.length < 2) {
    return { success: true, data: [] };
  }
  
  const lowerSearch = searchTerm.toLowerCase();
  
  const matches = leads
    .filter(l => {
      const fullName = `${l.firstName} ${l.lastName}`.toLowerCase();
      return fullName.includes(lowerSearch) || 
             l.firstName.toLowerCase().includes(lowerSearch) ||
             l.lastName.toLowerCase().includes(lowerSearch);
    })
    .slice(0, 10);
  
  return { success: true, data: matches };
}

