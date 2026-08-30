import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listAppointments } from '../controllers/insights.controller.js';

export const appointmentRouter: Router = Router();

appointmentRouter.get('/', asyncHandler(listAppointments));
