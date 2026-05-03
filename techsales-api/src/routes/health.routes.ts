import { Router, type Request, type Response } from 'express';
import { getDbHealth, isMongoConnected } from '../config/mongo.js';
import { getMode } from '../repositories/registry.js';
import type { ServiceResponse } from '../repositories/types.js';

const PROCESS_START = Date.now();

interface HealthPayload {
  mode: 'mongo' | 'json';
  mongoUp: boolean;
  dbs: {
    app: { name: string; readyState: number };
    lookup: { name: string; readyState: number };
  };
  uptimeSec: number;
}

/**
 * GET /api/health (plan §3) — reports the mode the backend booted into.
 * `mongoUp` reflects current driver readyState, but the mode itself is fixed
 * at startup and does not flip based on liveness.
 */
export const healthRouter: Router = Router();

healthRouter.get('/', (_req: Request, res: Response<ServiceResponse<HealthPayload>>) => {
  const dbs = getDbHealth();
  const payload: HealthPayload = {
    mode: getMode(),
    mongoUp: isMongoConnected(),
    dbs,
    uptimeSec: Math.floor((Date.now() - PROCESS_START) / 1000),
  };
  res.json({ success: true, data: payload });
});
