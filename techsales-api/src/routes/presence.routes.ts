/**
 * Phase 2.6 — `/api/presence` router.
 *
 * Single route today: `POST /heartbeat` for the FE to declare presence.
 * Dev-only snapshot lives behind the existing /_debug router gating.
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { postPresenceHeartbeat } from '../controllers/presence.controller.js';

export const presenceRouter: Router = Router();

presenceRouter.post('/heartbeat', asyncHandler(postPresenceHeartbeat));
