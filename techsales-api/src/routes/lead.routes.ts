/**
 * Lead routes — matches plan §6 endpoint table.
 *
 * Order matters: `/search` and `/autocomplete` must be declared BEFORE
 * `/:id` to avoid being captured by the param route.
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  getAllLeads,
  getLeadById,
  searchLeads,
  autocompleteLeads,
  createLead,
  updateLead,
  deleteLead,
  tagPharmacy,
  untagPharmacy,
  tagDrug,
  untagDrug,
  tagProvider,
  untagProvider,
  lookupLeadByPhone,
} from '../controllers/lead.controller.js';

export const leadRouter: Router = Router();

leadRouter.get('/search', asyncHandler(searchLeads));
leadRouter.get('/autocomplete', asyncHandler(autocompleteLeads));
leadRouter.get('/lookup-by-phone', asyncHandler(lookupLeadByPhone));
leadRouter.get('/', asyncHandler(getAllLeads));
leadRouter.post('/', asyncHandler(createLead));
leadRouter.get('/:id', asyncHandler(getLeadById));
leadRouter.patch('/:id', asyncHandler(updateLead));
leadRouter.delete('/:id', asyncHandler(deleteLead));

// Tagging — pharmacies (max 3)
leadRouter.post('/:id/pharmacies', asyncHandler(tagPharmacy));
leadRouter.delete('/:id/pharmacies/:pharmacyId', asyncHandler(untagPharmacy));

// Tagging — drugs (upsert by drugId)
leadRouter.post('/:id/drugs', asyncHandler(tagDrug));
leadRouter.delete('/:id/drugs/:drugId', asyncHandler(untagDrug));

// Tagging — providers (max 5)
leadRouter.post('/:id/providers', asyncHandler(tagProvider));
leadRouter.delete('/:id/providers/:providerId', asyncHandler(untagProvider));
