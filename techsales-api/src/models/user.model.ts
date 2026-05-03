/**
 * Mongoose schema for . Bound to  per plan §3.
 * Lazy accessor —  is undefined in JSON mode; never throw at import.
 */
import { Schema, type HydratedDocument, type Model } from 'mongoose';
import type { User } from '../types/index.js';
import { appConn } from '../config/mongo.js';

const userSchema = new Schema<User>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phone: { type: String },
    roleId: { type: String, required: true, index: true },
    departmentId: { type: String },
    isActive: { type: Boolean, default: true },
    isSuperAdmin: { type: Boolean, default: false },
    accessLevel: { type: String, required: true },
    markets: { type: [String], default: [] },
    createdAt: { type: String, required: true },
    createdBy: { type: String, required: true },
    updatedAt: { type: String },
    updatedBy: { type: String },
    lastLoginAt: { type: String },
  },
  {
    strict: false,
    versionKey: '__v',
    toJSON: {
      virtuals: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export type UserDoc = HydratedDocument<User>;

let cached: Model<User> | null = null;
export function getUserModel(): Model<User> {
  if (cached) return cached;
  if (!appConn) {
    throw new Error('UserModel requested but appConn is not initialized (mongo mode required).');
  }
  cached = appConn.model<User>('User', userSchema, 'users');
  return cached;
}

export const __resetUserModelForTests = (): void => {
  cached = null;
};
