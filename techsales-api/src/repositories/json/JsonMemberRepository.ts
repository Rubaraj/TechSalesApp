import path from 'node:path';
import type { Member, MemberAppointment } from '../../types/index.js';
import { JsonStore } from './JsonStore.js';
import { BOOTSTRAP_PATHS } from '../../utils/bootstrap.js';
import { env } from '../../config/env.js';

export class JsonMemberRepository {
  private readonly memberFile = path.join(BOOTSTRAP_PATHS.runtimeDir, 'members.json');
  private readonly apptFile = path.join(BOOTSTRAP_PATHS.runtimeDir, 'memberAppointments.json');
  private memberStore: JsonStore<Member[]> | null = null;
  private apptStore: JsonStore<MemberAppointment[]> | null = null;

  private async getMemberStore(): Promise<JsonStore<Member[]>> {
    if (this.memberStore) return this.memberStore;
    this.memberStore = await JsonStore.load<Member[]>(this.memberFile, [], { persist: env.JSON_PERSIST });
    return this.memberStore;
  }

  private async getApptStore(): Promise<JsonStore<MemberAppointment[]>> {
    if (this.apptStore) return this.apptStore;
    this.apptStore = await JsonStore.load<MemberAppointment[]>(this.apptFile, [], { persist: env.JSON_PERSIST });
    return this.apptStore;
  }

  async findById(memberId: string): Promise<Member | null> {
    const s = await this.getMemberStore();
    return s.get().find((m) => m.memberId === memberId && m.isActive) ?? null;
  }

  async findByPolicy(policyNumber: string, dob: string): Promise<Member | null> {
    const s = await this.getMemberStore();
    const lower = policyNumber.toLowerCase().trim();
    return (
      s.get().find((m) => m.policyNumber.toLowerCase() === lower && m.dateOfBirth === dob && m.isActive) ?? null
    );
  }

  async findAppointmentsByMember(memberId: string): Promise<MemberAppointment[]> {
    const s = await this.getApptStore();
    return s.get().filter((a) => a.memberId === memberId && a.status === 'Scheduled');
  }
}
