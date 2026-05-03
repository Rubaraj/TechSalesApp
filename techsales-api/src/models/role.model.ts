import { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { Role } from '../types/index.js';
import { appConn } from '../config/mongo.js';

const stripInternals = (_doc: unknown, ret: Record<string, unknown>) => {
  delete ret._id;
  delete ret.__v;
  return ret;
};

const roleSchema = new Schema<Role>(
  {
    roleId: { type: String, required: true, unique: true, index: true },
    roleName: { type: String, required: true },
    description: { type: String },
    permissions: { type: Schema.Types.Mixed, default: [] },
    isActive: { type: Boolean, default: true },
    createdAt: { type: String, required: true },
  },
  {
    strict: false,
    versionKey: '__v',
    toJSON: { virtuals: false, transform: stripInternals },
    toObject: { virtuals: false, transform: stripInternals },
  },
);

export type RoleDoc = HydratedDocument<Role>;

let cached: Model<Role> | null = null;
export function getRoleModel(): Model<Role> {
  if (cached) return cached;
  if (!appConn) throw new Error('RoleModel requested but appConn not initialized.');
  cached = appConn.model<Role>('Role', roleSchema, 'roles');
  return cached;
}
export const __resetRoleModelForTests = (): void => {
  cached = null;
};
