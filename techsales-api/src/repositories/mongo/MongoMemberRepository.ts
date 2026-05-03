import type { Member, MemberAppointment } from '../../types/index.js';
import { getMemberModel } from '../../models/member.model.js';
import { getMemberAppointmentModel } from '../../models/memberAppointment.model.js';

const stripInternals = <T,>(doc: T & { _id?: unknown; __v?: unknown }): T => {
  const { _id: _i, __v: _v, ...rest } = doc as unknown as Record<string, unknown>;
  return rest as unknown as T;
};

export class MongoMemberRepository {
  private model() {
    return getMemberModel();
  }
  private apptModel() {
    return getMemberAppointmentModel();
  }

  async findById(memberId: string): Promise<Member | null> {
    const doc = await this.model().findOne({ memberId, isActive: true }).lean<Member | null>().exec();
    return doc ? stripInternals(doc) : null;
  }

  async findByPolicy(policyNumber: string, dob: string): Promise<Member | null> {
    const escaped = policyNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const doc = await this.model()
      .findOne({
        policyNumber: { $regex: `^${escaped}$`, $options: 'i' },
        dateOfBirth: dob,
        isActive: true,
      })
      .lean<Member | null>()
      .exec();
    return doc ? stripInternals(doc) : null;
  }

  async findAppointmentsByMember(memberId: string): Promise<MemberAppointment[]> {
    const docs = await this.apptModel()
      .find({ memberId, status: 'Scheduled' })
      .lean<MemberAppointment[]>()
      .exec();
    return docs.map(stripInternals);
  }
}
