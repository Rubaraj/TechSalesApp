import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  getAllRoles, getRoleById, createRole, updateRole, deleteRole, getUserCountByRole,
} from '../controllers/admin.controller.js';

export const roleRouter: Router = Router();

roleRouter.get('/', asyncHandler(getAllRoles));
roleRouter.post('/', asyncHandler(createRole));
roleRouter.get('/:id', asyncHandler(getRoleById));
roleRouter.patch('/:id', asyncHandler(updateRole));
roleRouter.delete('/:id', asyncHandler(deleteRole));
roleRouter.get('/:id/user-count', asyncHandler(getUserCountByRole));
