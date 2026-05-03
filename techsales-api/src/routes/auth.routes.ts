/**
 * Auth routes — minimal demo per plan §6 "Auth — deliberately minimal".
 *
 *   POST /api/auth/login         — body: { username, password }; password ignored.
 *   POST /api/auth/member-login  — body: { policyNumber, dateOfBirth }
 *
 * No middleware, no token, no JWT. Lookup goes straight to the underlying
 * Mongo collection in mongo mode, or to the JSON file in JSON mode.
 */
import { Router, type Request, type Response } from 'express';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { appConn } from '../config/mongo.js';
import { getMode } from '../repositories/registry.js';
import { BOOTSTRAP_PATHS } from '../utils/bootstrap.js';
import type { ServiceResponse } from '../repositories/types.js';

interface UserLite {
  userId?: string;
  username: string;
  isActive?: boolean;
  [k: string]: unknown;
}

interface MemberLite {
  memberId?: string;
  policyNumber?: string;
  dateOfBirth?: string;
  [k: string]: unknown;
}

async function readUsersFromJson(): Promise<UserLite[]> {
  const file = path.join(BOOTSTRAP_PATHS.runtimeDir, 'users.json');
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw) as UserLite[];
}

async function readMembersFromJson(): Promise<MemberLite[]> {
  const file = path.join(BOOTSTRAP_PATHS.runtimeDir, 'members.json');
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw) as MemberLite[];
}

async function findUserByUsername(username: string): Promise<UserLite | null> {
  const lower = username.toLowerCase();
  if (getMode() === 'mongo' && appConn) {
    const doc = await appConn
      .collection('users')
      .findOne({ username: { $regex: `^${escapeRegex(username)}$`, $options: 'i' } });
    if (!doc) return null;
    const { _id: _ignore, __v: _ignore2, ...rest } = doc as Record<string, unknown>;
    return rest as UserLite;
  }
  const users = await readUsersFromJson();
  return users.find((u) => u.username?.toLowerCase() === lower) ?? null;
}

async function findMember(policyNumber: string, dob: string): Promise<MemberLite | null> {
  if (getMode() === 'mongo' && appConn) {
    const doc = await appConn.collection('members').findOne({
      policyNumber: { $regex: `^${escapeRegex(policyNumber)}$`, $options: 'i' },
      dateOfBirth: dob,
    });
    if (!doc) return null;
    const { _id: _ignore, __v: _ignore2, ...rest } = doc as Record<string, unknown>;
    return rest as MemberLite;
  }
  const members = await readMembersFromJson();
  return (
    members.find(
      (m) => m.policyNumber?.toLowerCase() === policyNumber.toLowerCase() && m.dateOfBirth === dob,
    ) ?? null
  );
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const authRouter: Router = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req: Request, res: Response<ServiceResponse<{ user: UserLite }>>) => {
    const { username, password: _ignore } = (req.body ?? {}) as { username?: string; password?: string };
    if (!username || typeof username !== 'string') {
      res.status(400).json({ success: false, error: 'username is required' });
      return;
    }
    const user = await findUserByUsername(username);
    if (!user || user.isActive === false) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }
    res.json({ success: true, data: { user } });
  }),
);

authRouter.post(
  '/member-login',
  asyncHandler(async (req: Request, res: Response<ServiceResponse<{ member: MemberLite }>>) => {
    const { policyNumber, dateOfBirth } = (req.body ?? {}) as {
      policyNumber?: string;
      dateOfBirth?: string;
    };
    if (!policyNumber || !dateOfBirth) {
      res.status(400).json({ success: false, error: 'policyNumber and dateOfBirth are required' });
      return;
    }
    const member = await findMember(policyNumber, dateOfBirth);
    if (!member) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }
    res.json({ success: true, data: { member } });
  }),
);
