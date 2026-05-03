import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getMemberById, getMemberAppointments } from '../controllers/member.controller.js';

export const memberRouter: Router = Router();

memberRouter.get('/:id', asyncHandler(getMemberById));
memberRouter.get('/:id/appointments', asyncHandler(getMemberAppointments));
