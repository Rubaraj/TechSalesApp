/**
 * Databricks-backed enrollment repository — same surface as
 * `MongoEnrollmentRepository` (read-mostly + create only).
 */
import type { Enrollment } from '../../types/index.js';
import { generateId, formatDate } from '../../utils/paginate.js';
import {
  APP_TABLES,
  appTable,
  selectAll,
  insertRow,
} from './databricksHelpers.js';

export class DatabricksEnrollmentRepository {
  private table(): string {
    return appTable(APP_TABLES.enrollments);
  }

  async findAll(): Promise<Enrollment[]> {
    return selectAll<Enrollment>(this.table());
  }

  async findByAgent(agentId: string): Promise<Enrollment[]> {
    const all = await this.findAll();
    return all.filter((e) => e.agentId === agentId);
  }

  async findByLead(leadId: string): Promise<Enrollment[]> {
    const all = await this.findAll();
    return all.filter((e) => e.leadId === leadId);
  }

  async create(
    input: Omit<Enrollment, 'enrollmentId' | 'createdAt' | 'createdBy'>,
    createdBy: string,
  ): Promise<Enrollment> {
    const enrollment: Enrollment = {
      ...input,
      enrollmentId: generateId('ENROLL'),
      premium: input.premium ?? 0,
      medicaidEligible: input.medicaidEligible ?? false,
      createdAt: formatDate(),
      createdBy,
    };
    await insertRow(
      this.table(),
      'enrollment_id',
      enrollment.enrollmentId,
      enrollment,
      enrollment.createdAt,
      undefined,
    );
    return enrollment;
  }
}
