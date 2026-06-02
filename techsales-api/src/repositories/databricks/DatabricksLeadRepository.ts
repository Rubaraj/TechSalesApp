/**
 * Databricks-backed lead repository — same surface as `MongoLeadRepository`,
 * backed by a JSON-blob Delta table.
 *
 * Storage: `medhub_app.leads` table with columns
 *   lead_id STRING, data STRING (JSON Lead), created_at TIMESTAMP, updated_at TIMESTAMP.
 *
 * Search/sort/filter happen in JavaScript after a full-table SELECT. This is
 * acceptable for the POC's volume (<1000 leads). Replace with native columns
 * + indexed SQL queries if the volume grows.
 */
import type { Lead, TaggedDrug } from '../../types/index.js';
import type { IRepository, Paginated, SearchParams } from '../types.js';
import { generateId, calculateAge, formatDate } from '../../utils/paginate.js';
import {
  APP_TABLES,
  appTable,
  selectAll,
  selectById,
  insertRow,
  updateRow,
  deleteRow,
  inMemorySearch,
} from './databricksHelpers.js';

export class DatabricksLeadRepository implements IRepository<Lead> {
  private table(): string {
    return appTable(APP_TABLES.leads);
  }

  async findAll(): Promise<Lead[]> {
    return selectAll<Lead>(this.table());
  }

  async findById(leadId: string): Promise<Lead | null> {
    return selectById<Lead>(this.table(), 'lead_id', leadId);
  }

  /** Phase 2.6 — Trailing-10 digit match. Full table scan; fine at POC volume. */
  async findByPhone(phoneE164OrRaw: string): Promise<Lead | null> {
    const matches = await this.findAllByPhone(phoneE164OrRaw);
    return matches[0] ?? null;
  }

  /** Phase 4 (M1) — Multi-match phone lookup for inbound routing. */
  async findAllByPhone(phoneE164OrRaw: string): Promise<Lead[]> {
    const last10 = phoneE164OrRaw.replace(/\D/g, '').slice(-10);
    if (last10.length !== 10) return [];
    const all = await this.findAll();
    return all.filter((l) => (l.phone ?? '').replace(/\D/g, '').slice(-10) === last10);
  }

  /** Phase 4 (M1) — Atlas "my pipeline" agent-owned filter. */
  async findByAssignedTo(userId: string): Promise<Lead[]> {
    const all = await this.findAll();
    return all.filter((l) => (l.assignedTo ?? l.createdBy) === userId);
  }

  async search(params: SearchParams<Lead>): Promise<Paginated<Lead>> {
    const all = await this.findAll();
    return inMemorySearch<Lead>({
      rows: all,
      ...(params.searchTerm !== undefined ? { searchTerm: params.searchTerm } : {}),
      searchFields: ['firstName', 'lastName', 'email', 'phone', 'city', 'medicareNumber'] as Array<keyof Lead>,
      ...(params.filters ? { filters: params.filters } : {}),
      ...(params.sortBy ? { sortBy: params.sortBy as keyof Lead } : {}),
      ...(params.sortDir ? { sortDir: params.sortDir } : {}),
      ...(params.page !== undefined ? { page: params.page } : {}),
      ...(params.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
    });
  }

  async create(input: Omit<Lead, 'id'>): Promise<Lead> {
    const now = formatDate();
    const dob = input.dob;
    const lead: Lead = {
      ...input,
      leadId: input.leadId || generateId('LEAD'),
      age: dob ? calculateAge(dob) : input.age,
      taggedPharmacies: input.taggedPharmacies ?? [],
      taggedDrugs: input.taggedDrugs ?? [],
      taggedProviders: input.taggedProviders ?? [],
      createdAt: input.createdAt || now,
      createdBy: input.createdBy,
    };
    await insertRow(this.table(), 'lead_id', lead.leadId, lead, lead.createdAt, undefined);
    return lead;
  }

  async update(leadId: string, patch: Partial<Lead>): Promise<Lead | null> {
    const existing = await this.findById(leadId);
    if (!existing) return null;
    const updatedAt = formatDate();
    const merged: Lead = { ...existing, ...patch, leadId, updatedAt };
    await updateRow(this.table(), 'lead_id', leadId, merged, updatedAt);
    return merged;
  }

  async delete(leadId: string): Promise<boolean> {
    return deleteRow(this.table(), 'lead_id', leadId);
  }

  // ----- lead-specific tagging operations (same surface as MongoLeadRepository) -----

  async tagPharmacy(
    leadId: string,
    pharmacyId: string,
    updatedBy: string,
  ): Promise<Lead | { error: string }> {
    const lead = await this.findById(leadId);
    if (!lead) return { error: 'Lead not found' };
    const tagged = lead.taggedPharmacies ?? [];
    if (tagged.length >= 3) return { error: 'Maximum 3 pharmacies can be tagged' };
    if (tagged.includes(pharmacyId)) return { error: 'Pharmacy already tagged' };
    const next: Lead = {
      ...lead,
      taggedPharmacies: [...tagged, pharmacyId],
      updatedAt: formatDate(),
      updatedBy,
    };
    await updateRow(this.table(), 'lead_id', leadId, next, next.updatedAt);
    return next;
  }

  async untagPharmacy(
    leadId: string,
    pharmacyId: string,
    updatedBy: string,
  ): Promise<Lead | { error: string }> {
    const lead = await this.findById(leadId);
    if (!lead) return { error: 'Lead not found' };
    const tagged = lead.taggedPharmacies ?? [];
    if (!tagged.includes(pharmacyId)) return { error: 'Pharmacy not tagged to this lead' };
    const next: Lead = {
      ...lead,
      taggedPharmacies: tagged.filter((p) => p !== pharmacyId),
      updatedAt: formatDate(),
      updatedBy,
    };
    await updateRow(this.table(), 'lead_id', leadId, next, next.updatedAt);
    return next;
  }

  async tagDrug(
    leadId: string,
    drug: TaggedDrug,
    updatedBy: string,
  ): Promise<Lead | { error: string }> {
    const lead = await this.findById(leadId);
    if (!lead) return { error: 'Lead not found' };
    const drugs = [...(lead.taggedDrugs ?? [])];
    const i = drugs.findIndex((d) => d.drugId === drug.drugId);
    if (i >= 0) {
      drugs[i] = { ...drugs[i], ...drug };
    } else {
      drugs.push(drug);
    }
    const next: Lead = { ...lead, taggedDrugs: drugs, updatedAt: formatDate(), updatedBy };
    await updateRow(this.table(), 'lead_id', leadId, next, next.updatedAt);
    return next;
  }

  async untagDrug(
    leadId: string,
    drugId: string,
    updatedBy: string,
  ): Promise<Lead | { error: string }> {
    const lead = await this.findById(leadId);
    if (!lead) return { error: 'Lead not found' };
    const before = lead.taggedDrugs ?? [];
    const after = before.filter((d) => d.drugId !== drugId);
    if (after.length === before.length) return { error: 'Drug not tagged to this lead' };
    const next: Lead = { ...lead, taggedDrugs: after, updatedAt: formatDate(), updatedBy };
    await updateRow(this.table(), 'lead_id', leadId, next, next.updatedAt);
    return next;
  }

  async tagProvider(
    leadId: string,
    providerId: string,
    updatedBy: string,
  ): Promise<Lead | { error: string }> {
    const lead = await this.findById(leadId);
    if (!lead) return { error: 'Lead not found' };
    const tagged = lead.taggedProviders ?? [];
    if (tagged.length >= 5) return { error: 'Maximum 5 providers can be tagged' };
    if (tagged.includes(providerId)) return { error: 'Provider already tagged' };
    const next: Lead = {
      ...lead,
      taggedProviders: [...tagged, providerId],
      updatedAt: formatDate(),
      updatedBy,
    };
    await updateRow(this.table(), 'lead_id', leadId, next, next.updatedAt);
    return next;
  }

  async untagProvider(
    leadId: string,
    providerId: string,
    updatedBy: string,
  ): Promise<Lead | { error: string }> {
    const lead = await this.findById(leadId);
    if (!lead) return { error: 'Lead not found' };
    const tagged = lead.taggedProviders ?? [];
    if (!tagged.includes(providerId)) return { error: 'Provider not tagged to this lead' };
    const next: Lead = {
      ...lead,
      taggedProviders: tagged.filter((p) => p !== providerId),
      updatedAt: formatDate(),
      updatedBy,
    };
    await updateRow(this.table(), 'lead_id', leadId, next, next.updatedAt);
    return next;
  }

  async autocomplete(searchTerm: string): Promise<Lead[]> {
    if (!searchTerm || searchTerm.length < 2) return [];
    const all = await this.findAll();
    const term = searchTerm.trim().toLowerCase();
    return all
      .filter(
        (l) =>
          l.firstName?.toLowerCase().includes(term) ||
          l.lastName?.toLowerCase().includes(term),
      )
      .slice(0, 10);
  }
}
