import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  getAllUsers, getUserById, searchUsers, createUser, updateUser, deleteUser, toggleUserStatus,
} from '../controllers/admin.controller.js';

export const userRouter: Router = Router();

userRouter.get('/search', asyncHandler(searchUsers));
userRouter.get('/', asyncHandler(getAllUsers));
userRouter.post('/', asyncHandler(createUser));
userRouter.get('/:id', asyncHandler(getUserById));
userRouter.patch('/:id', asyncHandler(updateUser));
userRouter.delete('/:id', asyncHandler(deleteUser));
userRouter.post('/:id/toggle-status', asyncHandler(toggleUserStatus));
