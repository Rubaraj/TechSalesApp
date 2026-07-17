/**
 * JSON-file-backed lead repository — implements the same interface as
 * `MongoLeadRepository`. Backed by `JsonStore` reading/writing
 * `techsales-api/data/runtime/leads.json`.
 *
 * Reuses `utils/search.ts` and `utils/paginate.ts` so semantics match the
 * FE's old in-memory baseService logic exactly (plan §11 reuse note).
 */
import path from 'node:path';
import type { Lead, TaggedDrug } from '../../types/index.js';
import type { IRepository, Paginated, SearchParams } from '../types.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';
import { filterByField, searchByFields, sortByField } from '../../utils/search.js';
import { paginateItems, generateId, calculateAge, formatDate } from '../../utils/paginate.js';

export class JsonLeadRepository implements IRepository<Lead> {
  private readonly filePath = path.join(BOOTSTRAP_PATHS.runtimeDir, 'leads.json');
  private store: JsonStore<Lead[]> | null = null;

  /** Lazy-load on first access — bootstrap copies the seed file into place at startup. */
  private async getStore(): Promise<JsonStore<Lead[]>> {
    if (this.store) return this.store;
    this.store = await JsonStore.load<Lead[]>(this.filePath, [], {
      persist: env.JSON_PERSIST,
    });
    return this.store;
  }

  async findAll(): Promise<Lead[]> {
    const store = await this.getStore();
    return [...store.get()];
  }

  async findById(leadId: string): Promise<Lead | null> {
    const store = await this.getStore();
    return store.get().find((l) => l.leadId === leadId) ?? null;
  }

  /** Phase 2.6 — Match by trailing 10 digits to bridge stored format variance. */
  async findByPhone(phoneE164OrRaw: string): Promise<Lead | null> {
    const matches = await this.findAllByPhone(phoneE164OrRaw);
    return matches[0] ?? null;
  }

  /** Phase 4 (M1) — Atlas needs all phone matches for inbound routing. */
  async findAllByPhone(phoneE164OrRaw: string): Promise<Lead[]> {
    const last10 = phoneE164OrRaw.replace(/\D/g, '').slice(-10);
    if (last10.length !== 10) return [];
    const store = await this.getStore();
    return store
      .get()
      .filter((l) => (l.phone ?? '').replace(/\D/g, '').slice(-10) === last10);
  }

  /** Phase 4 (M1) — Atlas "my pipeline" agent-owned filter. */
  async findByAssignedTo(userId: string): Promise<Lead[]> {
    const store = await this.getStore();
    return store
      .get()
      .filter((l) => (l.assignedTo ?? l.createdBy) === userId);
  }

  async search(params: SearchParams<Lead>): Promise<Paginated<Lead>> {
    const store = await this.getStore();
    let items = [...store.get()];

    if (params.searchTerm && params.searchTerm.trim()) {
      items = searchByFields(items, params.searchTerm, [
        'firstName',
        'lastName',
        'email',
        'phone',
        'city',
        'medicareNumber',
      ] as (keyof Lead)[]);
    }

    if (params.filters) {
      for (const [k, v] of Object.entries(params.filters)) {
        if (v === undefined || v === null || v === '') continue;
        items = filterByField(items, k as keyof Lead, v);
      }
    }

    if (params.sortBy) {
      items = sortByField(items, params.sortBy as keyof Lead, params.sortDir ?? 'asc');
    }

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 10, 100));
    return paginateItems(items, page, pageSize);
  }

  async create(input: Omit<Lead, 'id'>): Promise<Lead> {
    const store = await this.getStore();
    const now = formatDate();
    const lead: Lead = {
      ...input,
      leadId: input.leadId || generateId('LEAD'),
      age: input.dob ? calculateAge(input.dob) : input.age,
      taggedPharmacies: input.taggedPharmacies ?? [],
      taggedDrugs: input.taggedDrugs ?? [],
      taggedProviders: input.taggedProviders ?? [],
      createdAt: input.createdAt || now,
      createdBy: input.createdBy,
    };
    store.update((prev) => [...prev, lead]);
    return lead;
  }

  async update(leadId: string, patch: Partial<Lead>): Promise<Lead | null> {
    const store = await this.getStore();
    let updated: Lead | null = null;
    store.update((prev) => {
      const idx = prev.findIndex((l) => l.leadId === leadId);
      if (idx === -1) return prev;
      const next = { ...prev[idx], ...patch, updatedAt: formatDate() };
      updated = next;
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
    return updated;
  }

  async delete(leadId: string): Promise<boolean> {
    const store = await this.getStore();
    let deleted = false;
    store.update((prev) => {
      const idx = prev.findIndex((l) => l.leadId === leadId);
      if (idx === -1) return prev;
      deleted = true;
      const copy = [...prev];
      copy.splice(idx, 1);
      return copy;
    });
    return deleted;
  }

  // ----- tagging operations -----

  async tagPharmacy(leadId: string, pharmacyId: string, updatedBy: string): Promise<Lead | { error: string }> {
    const store = await this.getStore();
    const current = store.get().find((l) => l.leadId === leadId);
    if (!current) return { error: 'Lead not found' };
    if ((current.taggedPharmacies ?? []).length >= 3) {
      return { error: 'Maximum 3 pharmacies can be tagged' };
    }
    if ((current.taggedPharmacies ?? []).includes(pharmacyId)) {
      return { error: 'Pharmacy already tagged' };
    }
    return this.mutateLead(leadId, (l) => ({
      ...l,
      taggedPharmacies: [...(l.taggedPharmacies ?? []), pharmacyId],
      updatedAt: formatDate(),
      updatedBy,
    }));
  }

  async untagPharmacy(leadId: string, pharmacyId: string, updatedBy: string): Promise<Lead | { error: string }> {
    const store = await this.getStore();
    const current = store.get().find((l) => l.leadId === leadId);
    if (!current) return { error: 'Lead not found' };
    if (!(current.taggedPharmacies ?? []).includes(pharmacyId)) {
      return { error: 'Pharmacy not tagged to this lead' };
    }
    return this.mutateLead(leadId, (l) => ({
      ...l,
      taggedPharmacies: (l.taggedPharmacies ?? []).filter((p) => p !== pharmacyId),
      updatedAt: formatDate(),
      updatedBy,
    }));
  }

  async tagDrug(leadId: string, drug: TaggedDrug, updatedBy: string): Promise<Lead | { error: string }> {
    const store = await this.getStore();
    const current = store.get().find((l) => l.leadId === leadId);
    if (!current) return { error: 'Lead not found' };
    return this.mutateLead(leadId, (l) => {
      const drugs = [...(l.taggedDrugs ?? [])];
      const i = drugs.findIndex((d) => d.drugId === drug.drugId);
      if (i >= 0) drugs[i] = { ...drugs[i], ...drug };
      else drugs.push(drug);
      return { ...l, taggedDrugs: drugs, updatedAt: formatDate(), updatedBy };
    });
  }

  async untagDrug(leadId: string, drugId: string, updatedBy: string): Promise<Lead | { error: string }> {
    const store = await this.getStore();
    const current = store.get().find((l) => l.leadId === leadId);
    if (!current) return { error: 'Lead not found' };
    if (!(current.taggedDrugs ?? []).some((d) => d.drugId === drugId)) {
      return { error: 'Drug not tagged to this lead' };
    }
    return this.mutateLead(leadId, (l) => ({
      ...l,
      taggedDrugs: (l.taggedDrugs ?? []).filter((d) => d.drugId !== drugId),
      updatedAt: formatDate(),
      updatedBy,
    }));
  }

  async tagProvider(leadId: string, providerId: string, updatedBy: string): Promise<Lead | { error: string }> {
    const store = await this.getStore();
    const current = store.get().find((l) => l.leadId === leadId);
    if (!current) return { error: 'Lead not found' };
    if ((current.taggedProviders ?? []).length >= 5) {
      return { error: 'Maximum 5 providers can be tagged' };
    }
    if ((current.taggedProviders ?? []).includes(providerId)) {
      return { error: 'Provider already tagged' };
    }
    return this.mutateLead(leadId, (l) => ({
      ...l,
      taggedProviders: [...(l.taggedProviders ?? []), providerId],
      updatedAt: formatDate(),
      updatedBy,
    }));
  }

  async untagProvider(leadId: string, providerId: string, updatedBy: string): Promise<Lead | { error: string }> {
    const store = await this.getStore();
    const current = store.get().find((l) => l.leadId === leadId);
    if (!current) return { error: 'Lead not found' };
    if (!(current.taggedProviders ?? []).includes(providerId)) {
      return { error: 'Provider not tagged to this lead' };
    }
    return this.mutateLead(leadId, (l) => ({
      ...l,
      taggedProviders: (l.taggedProviders ?? []).filter((p) => p !== providerId),
      updatedAt: formatDate(),
      updatedBy,
    }));
  }

  async autocomplete(searchTerm: string): Promise<Lead[]> {
    if (!searchTerm || searchTerm.length < 2) return [];
    const lower = searchTerm.toLowerCase();
    const store = await this.getStore();
    return store
      .get()
      .filter((l) => {
        const fullName = `${l.firstName} ${l.lastName}`.toLowerCase();
        return (
          fullName.includes(lower) ||
          l.firstName.toLowerCase().includes(lower) ||
          l.lastName.toLowerCase().includes(lower)
        );
      })
      .slice(0, 10);
  }

  private async mutateLead(leadId: string, fn: (l: Lead) => Lead): Promise<Lead | { error: string }> {
    const store = await this.getStore();
    let updated: Lead | null = null;
    store.update((prev) => {
      const idx = prev.findIndex((l) => l.leadId === leadId);
      if (idx === -1) return prev;
      const next = fn(prev[idx]);
      updated = next;
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
    return updated ?? { error: 'Lead not found' };
  }
}
