/**
 * /api/ai/call/* router — Phase 2 Live Call Copilot.
 *
 *   POST /token   → mints a Twilio Voice Access Token (1h TTL).
 *   GET  /analyze → SSE bridge for diarized transcript + (Phase 3+) AI events.
 *
 * Mounted inside the AI guard chain (`AI_ENABLED` → rate-limit → token cap),
 * with the additional per-user call-minute cap layered on top.
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { callMinuteCap } from '../middleware/callMinuteCap.js';
import { postCallToken, getCallAnalyzeStream } from '../controllers/call.controller.js';

export const callRouter: Router = Router();

callRouter.post('/token', callMinuteCap, asyncHandler(postCallToken));
callRouter.get('/analyze', callMinuteCap, asyncHandler(getCallAnalyzeStream));
