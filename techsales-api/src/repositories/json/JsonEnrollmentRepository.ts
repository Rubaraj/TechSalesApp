import path from 'node:path';
import type { Enrollment } from '../../types/index.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';
import { generateId, formatDate } from '../../utils/paginate.js';

export class JsonEnrollmentRepository {
  private readonly filePath = path.join(BOOTSTRAP_PATHS.runtimeDir, 'enrollments.json');
  private store: JsonStore<Enrollment[]> | null = null;

  private async getStore(): Promise<JsonStore<Enrollment[]>> {
    if (this.store) return this.store;
    this.store = await JsonStore.load<Enrollment[]>(this.filePath, [], { persist: env.JSON_PERSIST });
    return this.store;
  }

  async findAll(): Promise<Enrollment[]> {
    const s = await this.getStore();
    return [...s.get()];
  }

  async findByAgent(agentId: string): Promise<Enrollment[]> {
    const s = await this.getStore();
    return s.get().filter((e) => e.agentId === agentId);
  }

  async findByLead(leadId: string): Promise<Enrollment[]> {
    const s = await this.getStore();
    return s.get().filter((e) => e.leadId === leadId);
  }

  async create(input: Omit<Enrollment, 'enrollmentId' | 'createdAt' | 'createdBy'>, createdBy: string): Promise<Enrollment> {
    const s = await this.getStore();
    const enrollment: Enrollment = {
      ...input,
      enrollmentId: generateId('ENROLL'),
      premium: input.premium ?? 0,
      medicaidEligible: input.medicaidEligible ?? false,
      createdAt: formatDate(),
      createdBy,
    };
    s.update((prev) => [...prev, enrollment]);
    return enrollment;
  }
}
