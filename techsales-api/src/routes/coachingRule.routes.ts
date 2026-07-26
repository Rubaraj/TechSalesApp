import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  listCoachingRules,
  createCoachingRule,
  updateCoachingRule,
  deleteCoachingRule,
} from '../controllers/coachingRule.controller.js';

export const coachingRuleRouter = Router();

coachingRuleRouter.get('/', asyncHandler(listCoachingRules));
coachingRuleRouter.post('/', asyncHandler(createCoachingRule));
coachingRuleRouter.patch('/:id', asyncHandler(updateCoachingRule));
coachingRuleRouter.delete('/:id', asyncHandler(deleteCoachingRule));
