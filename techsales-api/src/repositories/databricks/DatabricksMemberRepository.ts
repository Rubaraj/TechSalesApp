/**
 * Databricks-backed member repository — same surface as
 * `MongoMemberRepository`. Backed by lookup-schema tables since members
 * are reference data in this POC.
 */
import type { Member, MemberAppointment } from '../../types/index.js';
import { LOOKUP_TABLES, lookupTable, selectAll, selectById } from './databricksHelpers.js';

export class DatabricksMemberRepository {
  private membersTable(): string {
    return lookupTable(LOOKUP_TABLES.members);
  }
  private apptsTable(): string {
    return lookupTable(LOOKUP_TABLES.memberAppointments);
  }

  async findById(memberId: string): Promise<Member | null> {
    const m = await selectById<Member>(this.membersTable(), 'member_id', memberId);
    if (!m) return null;
    if (m.isActive === false) return null;
    return m;
  }

  async findByPolicy(policyNumber: string, dob: string): Promise<Member | null> {
    const all = await selectAll<Member>(this.membersTable());
    const policyLower = policyNumber.toLowerCase();
    return (
      all.find(
        (m) =>
          m.policyNumber.toLowerCase() === policyLower &&
          m.dateOfBirth === dob &&
          m.isActive !== false,
      ) ?? null
    );
  }

  async findAppointmentsByMember(memberId: string): Promise<MemberAppointment[]> {
    const all = await selectAll<MemberAppointment>(this.apptsTable());
    return all.filter((a) => a.memberId === memberId && a.status === 'Scheduled');
  }
}
