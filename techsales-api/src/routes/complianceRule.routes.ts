import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  listComplianceRules,
  createComplianceRule,
  updateComplianceRule,
  deleteComplianceRule,
} from '../controllers/complianceRule.controller.js';

export const complianceRuleRouter = Router();

complianceRuleRouter.get('/', asyncHandler(listComplianceRules));
complianceRuleRouter.post('/', asyncHandler(createComplianceRule));
complianceRuleRouter.patch('/:id', asyncHandler(updateComplianceRule));
complianceRuleRouter.delete('/:id', asyncHandler(deleteComplianceRule));
