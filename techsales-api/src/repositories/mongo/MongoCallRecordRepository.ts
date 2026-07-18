/**
 * QA pipeline — Mongo-backed call-record repo. Write-once per call
 * (persistCallRecord) + supervisor reads + qaReview upsert. List views
 * project OUT `lines` so the review-queue endpoint stays cheap even with
 * long transcripts.
 */
import { getCallRecordModel, type CallRecord } from '../../models/callRecord.model.js';

const stripInternals = (doc: CallRecord & { _id?: unknown; __v?: unknown }): CallRecord => {
  const { _id: _i, __v: _v, ...rest } = doc as unknown as Record<string, unknown>;
  return rest as unknown as CallRecord;
};

export interface CallRecordListParams {
  flaggedOnly?: boolean;
  userId?: string;
  limit?: number;
}

export class MongoCallRecordRepository {
  private model() {
    return getCallRecordModel();
  }

  async create(record: CallRecord): Promise<CallRecord> {
    const created = await this.model().create(record);
    return stripInternals(created.toJSON() as CallRecord);
  }

  /** List for the review queue — transcript lines excluded by projection. */
  async list(params: CallRecordListParams = {}): Promise<Array<Omit<CallRecord, 'lines'>>> {
    const query: Record<string, unknown> = {};
    if (params.flaggedOnly) query.flagged = true;
    if (params.userId) query.userId = params.userId;
    const docs = await this.model()
      .find(query, { lines: 0 })
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(params.limit ?? 50, 200)))
      .lean<CallRecord[]>()
      .exec();
    return docs.map(stripInternals);
  }

  async findByCallSid(callSid: string): Promise<CallRecord | null> {
    const doc = await this.model().findOne({ callSid }).lean<CallRecord | null>().exec();
    return doc ? stripInternals(doc) : null;
  }

  async setQaReview(callSid: string, qaReview: CallRecord['qaReview']): Promise<boolean> {
    const res = await this.model().updateOne({ callSid }, { $set: { qaReview } }).exec();
    return (res.modifiedCount ?? 0) > 0 || (res.matchedCount ?? 0) > 0;
  }
}
