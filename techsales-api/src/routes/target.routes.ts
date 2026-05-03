import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  getAllTargets, getTargetById, getTargetsByPeriod, getTargetsByMetric, getActiveTargets,
  createTarget, updateTarget, deleteTarget, toggleTargetStatus,
} from '../controllers/target.controller.js';

export const targetRouter: Router = Router();

targetRouter.get('/active', asyncHandler(getActiveTargets));
targetRouter.get('/by-period/:period', asyncHandler(getTargetsByPeriod));
targetRouter.get('/by-metric/:metric', asyncHandler(getTargetsByMetric));
targetRouter.get('/', asyncHandler(getAllTargets));
targetRouter.post('/', asyncHandler(createTarget));
targetRouter.get('/:id', asyncHandler(getTargetById));
targetRouter.patch('/:id', asyncHandler(updateTarget));
targetRouter.delete('/:id', asyncHandler(deleteTarget));
targetRouter.post('/:id/toggle-status', asyncHandler(toggleTargetStatus));
