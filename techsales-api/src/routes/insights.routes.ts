import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getProductivityDashboard } from '../controllers/insights.controller.js';

export const insightsRouter: Router = Router();

insightsRouter.get('/productivity', asyncHandler(getProductivityDashboard));
