/**
 * MongoDB-backed lead repository — implements `IRepository<Lead>` from
 * `repositories/types.ts` plus the lead-specific tagging operations.
 *
 * - Returned documents are passed through `.toJSON()` so the response shape
 *   matches the FE `Lead` type exactly (no `_id`, no `__v`).
 * - `delete` is a HARD delete to match the existing FE behavior (plan §15
 *   prefers soft-deletes globally, but `Lead` has no `isDeleted` field and
 *   the FE's leadService.deleteLead is a hard delete).
 * - Tag operations enforce: max 3 pharmacies, max 5 providers, drug upsert.
 */
import type { Lead, TaggedDrug } from '../../types/index.js';
import type { IRepository, Paginated, SearchParams } from '../types.js';
import { getLeadModel } from '../../models/lead.model.js';
import { generateId, calculateAge, formatDate } from '../../utils/paginate.js';

export class MongoLeadRepository implements IRepository<Lead> {
  private model() {
    return getLeadModel();
  }

  async findAll(): Promise<Lead[]> {
    const docs = await this.model().find().lean<Lead[]>().exec();
    return docs.map(this.stripInternals);
  }

  async findById(leadId: string): Promise<Lead | null> {
    const doc = await this.model().findOne({ leadId }).lean<Lead | null>().exec();
    return doc ? this.stripInternals(doc) : null;
  }

  async search(params: SearchParams<Lead>): Promise<Paginated<Lead>> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(params.pageSize ?? 10, 100));

    const query: Record<string, unknown> = {};
    if (params.filters) {
      for (const [k, v] of Object.entries(params.filters)) {
        if (v !== undefined && v !== null && v !== '') {
          query[k] = v;
        }
      }
    }
    if (params.searchTerm && params.searchTerm.trim()) {
      const re = new RegExp(escapeRegex(params.searchTerm.trim()), 'i');
      query.$or = [
        { firstName: re },
        { lastName: re },
        { email: re },
        { phone: re },
        { city: re },
        { medicareNumber: re },
      ];
    }

    const sort: Record<string, 1 | -1> = {};
    if (params.sortBy) {
      sort[params.sortBy] = params.sortDir === 'desc' ? -1 : 1;
    }

    const total = await this.model().countDocuments(query);
    const docs = await this.model()
      .find(query)
      .sort(Object.keys(sort).length > 0 ? sort : undefined)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<Lead[]>()
      .exec();

    return {
      data: docs.map(this.stripInternals),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
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
    const created = await this.model().create(lead);
    return this.stripInternals(created.toJSON() as Lead);
  }

  async update(leadId: string, patch: Partial<Lead>): Promise<Lead | null> {
    const updated = await this.model()
      .findOneAndUpdate(
        { leadId },
        { $set: { ...patch, updatedAt: formatDate() } },
        { new: true },
      )
      .lean<Lead | null>()
      .exec();
    return updated ? this.stripInternals(updated) : null;
  }

  async delete(leadId: string): Promise<boolean> {
    const res = await this.model().deleteOne({ leadId }).exec();
    return (res.deletedCount ?? 0) > 0;
  }

  // ----- lead-specific tagging operations -----

  async tagPharmacy(leadId: string, pharmacyId: string, updatedBy: string): Promise<Lead | { error: string }> {
    const lead = await this.model().findOne({ leadId }).exec();
    if (!lead) return { error: 'Lead not found' };
    if ((lead.taggedPharmacies ?? []).length >= 3) {
      return { error: 'Maximum 3 pharmacies can be tagged' };
    }
    if ((lead.taggedPharmacies ?? []).includes(pharmacyId)) {
      return { error: 'Pharmacy already tagged' };
    }
    lead.taggedPharmacies = [...(lead.taggedPharmacies ?? []), pharmacyId];
    lead.updatedAt = formatDate();
    lead.updatedBy = updatedBy;
    await lead.save();
    return this.stripInternals(lead.toJSON() as Lead);
  }

  async untagPharmacy(leadId: string, pharmacyId: string, updatedBy: string): Promise<Lead | { error: string }> {
    const lead = await this.model().findOne({ leadId }).exec();
    if (!lead) return { error: 'Lead not found' };
    const idx = (lead.taggedPharmacies ?? []).indexOf(pharmacyId);
    if (idx === -1) return { error: 'Pharmacy not tagged to this lead' };
    lead.taggedPharmacies = (lead.taggedPharmacies ?? []).filter((p) => p !== pharmacyId);
    lead.updatedAt = formatDate();
    lead.updatedBy = updatedBy;
    await lead.save();
    return this.stripInternals(lead.toJSON() as Lead);
  }

  async tagDrug(leadId: string, drug: TaggedDrug, updatedBy: string): Promise<Lead | { error: string }> {
    const lead = await this.model().findOne({ leadId }).exec();
    if (!lead) return { error: 'Lead not found' };
    const drugs = [...(lead.taggedDrugs ?? [])];
    const i = drugs.findIndex((d) => d.drugId === drug.drugId);
    if (i >= 0) {
      drugs[i] = { ...drugs[i], ...drug };
    } else {
      drugs.push(drug);
    }
    lead.taggedDrugs = drugs;
    lead.updatedAt = formatDate();
    lead.updatedBy = updatedBy;
    await lead.save();
    return this.stripInternals(lead.toJSON() as Lead);
  }

  async untagDrug(leadId: string, drugId: string, updatedBy: string): Promise<Lead | { error: string }> {
    const lead = await this.model().findOne({ leadId }).exec();
    if (!lead) return { error: 'Lead not found' };
    const drugs = (lead.taggedDrugs ?? []).filter((d) => d.drugId !== drugId);
    if (drugs.length === (lead.taggedDrugs ?? []).length) {
      return { error: 'Drug not tagged to this lead' };
    }
    lead.taggedDrugs = drugs;
    lead.updatedAt = formatDate();
    lead.updatedBy = updatedBy;
    await lead.save();
    return this.stripInternals(lead.toJSON() as Lead);
  }

  async tagProvider(leadId: string, providerId: string, updatedBy: string): Promise<Lead | { error: string }> {
    const lead = await this.model().findOne({ leadId }).exec();
    if (!lead) return { error: 'Lead not found' };
    if ((lead.taggedProviders ?? []).length >= 5) {
      return { error: 'Maximum 5 providers can be tagged' };
    }
    if ((lead.taggedProviders ?? []).includes(providerId)) {
      return { error: 'Provider already tagged' };
    }
    lead.taggedProviders = [...(lead.taggedProviders ?? []), providerId];
    lead.updatedAt = formatDate();
    lead.updatedBy = updatedBy;
    await lead.save();
    return this.stripInternals(lead.toJSON() as Lead);
  }

  async untagProvider(leadId: string, providerId: string, updatedBy: string): Promise<Lead | { error: string }> {
    const lead = await this.model().findOne({ leadId }).exec();
    if (!lead) return { error: 'Lead not found' };
    const idx = (lead.taggedProviders ?? []).indexOf(providerId);
    if (idx === -1) return { error: 'Provider not tagged to this lead' };
    lead.taggedProviders = (lead.taggedProviders ?? []).filter((p) => p !== providerId);
    lead.updatedAt = formatDate();
    lead.updatedBy = updatedBy;
    await lead.save();
    return this.stripInternals(lead.toJSON() as Lead);
  }

  async autocomplete(searchTerm: string): Promise<Lead[]> {
    if (!searchTerm || searchTerm.length < 2) return [];
    const re = new RegExp(escapeRegex(searchTerm.trim()), 'i');
    const docs = await this.model()
      .find({ $or: [{ firstName: re }, { lastName: re }] })
      .limit(10)
      .lean<Lead[]>()
      .exec();
    return docs.map(this.stripInternals);
  }

  /** `lean()` returns plain objects but Mongoose still includes `_id`/`__v`. */
  private stripInternals = (doc: Lead & { _id?: unknown; __v?: unknown }): Lead => {
    const { _id: _ignore, __v: _ignore2, ...rest } = doc as unknown as Record<string, unknown>;
    return rest as unknown as Lead;
  };
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
