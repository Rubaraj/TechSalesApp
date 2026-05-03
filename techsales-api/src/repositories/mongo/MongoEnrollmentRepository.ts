import type { Enrollment } from '../../types/index.js';
import { getEnrollmentModel } from '../../models/enrollment.model.js';
import { generateId, formatDate } from '../../utils/paginate.js';

const stripInternals = (doc: Enrollment & { _id?: unknown; __v?: unknown }): Enrollment => {
  const { _id: _i, __v: _v, ...rest } = doc as unknown as Record<string, unknown>;
  return rest as unknown as Enrollment;
};

export class MongoEnrollmentRepository {
  private model() {
    return getEnrollmentModel();
  }

  async findAll(): Promise<Enrollment[]> {
    const docs = await this.model().find().lean<Enrollment[]>().exec();
    return docs.map(stripInternals);
  }

  async findByAgent(agentId: string): Promise<Enrollment[]> {
    const docs = await this.model().find({ agentId }).lean<Enrollment[]>().exec();
    return docs.map(stripInternals);
  }

  async findByLead(leadId: string): Promise<Enrollment[]> {
    const docs = await this.model().find({ leadId }).lean<Enrollment[]>().exec();
    return docs.map(stripInternals);
  }

  async create(input: Omit<Enrollment, 'enrollmentId' | 'createdAt' | 'createdBy'>, createdBy: string): Promise<Enrollment> {
    const enrollment: Enrollment = {
      ...input,
      enrollmentId: generateId('ENROLL'),
      premium: input.premium ?? 0,
      medicaidEligible: input.medicaidEligible ?? false,
      createdAt: formatDate(),
      createdBy,
    };
    const created = await this.model().create(enrollment);
    return stripInternals(created.toJSON() as Enrollment);
  }
}
