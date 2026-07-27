/**
 * Training simulator — persona catalog for the Training page. Returns only
 * display fields; the roleplay prompt never leaves the backend.
 */
import { Router, type Request, type Response } from 'express';
import { PERSONAS } from '../ai/simulator/personas.js';
import { simulatorEnabled } from '../config/env.js';

export const simulatorRouter = Router();

simulatorRouter.get('/personas', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      enabled: simulatorEnabled(),
      personas: PERSONAS.map(({ id, label, description }) => ({ id, label, description })),
    },
  });
});
