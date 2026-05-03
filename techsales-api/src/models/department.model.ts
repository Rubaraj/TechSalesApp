import { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { Department } from '../types/index.js';
import { appConn } from '../config/mongo.js';

const stripInternals = (_doc: unknown, ret: Record<string, unknown>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const departmentSchema = new Schema<Department>(
  {
    departmentId: { type: String, required: true, unique: true, index: true },
    departmentName: { type: String, required: true },
    description: { type: String },
    managerId: { type: String },
    parentDepartmentId: { type: String },
    isActive: { type: Boolean, default: true },
    createdAt: { type: String, required: true },
    createdBy: { type: String, required: true },
  },
  {
    strict: false,
    versionKey: '__v',
    toJSON: { virtuals: false, transform: stripInternals },
    toObject: { virtuals: false, transform: stripInternals },
  },
);

export type DepartmentDoc = HydratedDocument<Department>;

let cached: Model<Department> | null = null;
export function getDepartmentModel(): Model<Department> {
  if (cached) return cached;
  if (!appConn) throw new Error('DepartmentModel requested but appConn not initialized.');
  cached = appConn.model<Department>('Department', departmentSchema, 'departments');
  return cached;
}
export const __resetDepartmentModelForTests = (): void => {
  cached = null;
};
