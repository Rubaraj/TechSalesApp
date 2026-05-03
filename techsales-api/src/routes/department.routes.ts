import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  getAllDepartments, getDepartmentById, createDepartment, updateDepartment, deleteDepartment, getUserCountByDepartment,
} from '../controllers/admin.controller.js';

export const departmentRouter: Router = Router();

departmentRouter.get('/', asyncHandler(getAllDepartments));
departmentRouter.post('/', asyncHandler(createDepartment));
departmentRouter.get('/:id', asyncHandler(getDepartmentById));
departmentRouter.patch('/:id', asyncHandler(updateDepartment));
departmentRouter.delete('/:id', asyncHandler(deleteDepartment));
departmentRouter.get('/:id/user-count', asyncHandler(getUserCountByDepartment));
