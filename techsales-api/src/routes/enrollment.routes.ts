import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  getAllEnrollments, getEnrollmentsByAgent, getEnrollmentsByLead, createEnrollment,
} from '../controllers/enrollment.controller.js';

export const enrollmentRouter: Router = Router();

enrollmentRouter.get('/', asyncHandler(getAllEnrollments));
enrollmentRouter.post('/', asyncHandler(createEnrollment));
enrollmentRouter.get('/by-agent/:agentId', asyncHandler(getEnrollmentsByAgent));
enrollmentRouter.get('/by-lead/:leadId', asyncHandler(getEnrollmentsByLead));
