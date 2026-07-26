import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  listQaRubricItems,
  createQaRubricItem,
  updateQaRubricItem,
  deleteQaRubricItem,
} from '../controllers/qaRubricItem.controller.js';

export const qaRubricItemRouter = Router();

qaRubricItemRouter.get('/', asyncHandler(listQaRubricItems));
qaRubricItemRouter.post('/', asyncHandler(createQaRubricItem));
qaRubricItemRouter.patch('/:id', asyncHandler(updateQaRubricItem));
qaRubricItemRouter.delete('/:id', asyncHandler(deleteQaRubricItem));
