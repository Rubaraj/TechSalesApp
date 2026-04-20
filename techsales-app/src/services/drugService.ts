import type { Drug, DrugSearchParams, DosageForm } from '../types';
export type { DrugSearchParams } from '../types';
import type { ServiceResponse } from './baseService';
import drugData from '../data/lookup/drugData.json';
import { 
  delay, 
  searchByFields, 
  sortByField, 
  paginateItems,
} from './baseService';

// Load data
const drugs: Drug[] = drugData as Drug[];

// Get all drugs
export const getAllDrugs = async (): Promise<ServiceResponse<Drug[]>> => {
  await delay();
  return { success: true, data: drugs };
};

// Get drug by ID
export const getDrugById = async (drugId: string): Promise<ServiceResponse<Drug>> => {
  await delay();
  const drug = drugs.find(d => d.drugId === drugId);
  
  if (!drug) {
    return { success: false, error: 'Drug not found' };
  }
  
  return { success: true, data: drug };
};

// Search drugs with autocomplete
export const searchDrugs = async (
  params: DrugSearchParams & {
    page?: number;
    pageSize?: number;
    sortField?: keyof Drug;
    sortDirection?: 'asc' | 'desc';
  }
): Promise<ServiceResponse<{
  data: Drug[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}>> => {
  await delay();
  
  let filteredDrugs = [...drugs];
  
  // Apply search term
  if (params.searchTerm) {
    filteredDrugs = searchByFields(filteredDrugs, params.searchTerm, [
      'brandName', 'genericName', 'drugLabelName', 'drugClass'
    ]);
  }
  
  // Apply brand name filter
  if (params.brandName) {
    filteredDrugs = filteredDrugs.filter(d => 
      d.brandName.toLowerCase().includes(params.brandName!.toLowerCase())
    );
  }
  
  // Apply generic name filter
  if (params.genericName) {
    filteredDrugs = filteredDrugs.filter(d => 
      d.genericName.toLowerCase().includes(params.genericName!.toLowerCase())
    );
  }
  
  // Apply drug class filter
  if (params.drugClass) {
    filteredDrugs = filteredDrugs.filter(d => 
      d.drugClass.toLowerCase().includes(params.drugClass!.toLowerCase())
    );
  }
  
  // Apply dosage form filter
  if (params.dosageForm) {
    filteredDrugs = filteredDrugs.filter(d => d.dosageForm === params.dosageForm);
  }
  
  // Apply brand/generic filter
  if (params.isBrand !== undefined) {
    filteredDrugs = filteredDrugs.filter(d => d.isBrand === params.isBrand);
  }
  if (params.isGeneric !== undefined) {
    filteredDrugs = filteredDrugs.filter(d => d.isGeneric === params.isGeneric);
  }
  
  // Apply sorting
  if (params.sortField) {
    filteredDrugs = sortByField(filteredDrugs, params.sortField, params.sortDirection || 'asc');
  } else {
    // Default sort by brand name
    filteredDrugs = sortByField(filteredDrugs, 'brandName', 'asc');
  }
  
  // Apply pagination
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  const { data, total, totalPages } = paginateItems(filteredDrugs, page, pageSize);
  
  return {
    success: true,
    data: { data, total, page, pageSize, totalPages }
  };
};

// Autocomplete drug search (returns top 10 matches)
export const autocompleteDrugs = async (searchTerm: string): Promise<ServiceResponse<Drug[]>> => {
  await delay(50); // Faster for autocomplete
  
  if (!searchTerm || searchTerm.length < 2) {
    return { success: true, data: [] };
  }
  
  const lowerSearch = searchTerm.toLowerCase();
  
  const matches = drugs
    .filter(d => 
      d.brandName.toLowerCase().includes(lowerSearch) ||
      d.genericName.toLowerCase().includes(lowerSearch) ||
      d.drugLabelName.toLowerCase().includes(lowerSearch)
    )
    .slice(0, 10);
  
  return { success: true, data: matches };
};

// Get drug classes
export const getDrugClasses = async (): Promise<ServiceResponse<string[]>> => {
  await delay();
  const classes = [...new Set(drugs.map(d => d.drugClass))].sort();
  return { success: true, data: classes };
};

// Get dosage forms
export const getDosageForms = async (): Promise<ServiceResponse<DosageForm[]>> => {
  await delay();
  const forms = [...new Set(drugs.map(d => d.dosageForm))].sort() as DosageForm[];
  return { success: true, data: forms };
};

// Get drugs by class
export const getDrugsByClass = async (drugClass: string): Promise<ServiceResponse<Drug[]>> => {
  await delay();
  const classDrugs = drugs.filter(d => 
    d.drugClass.toLowerCase() === drugClass.toLowerCase()
  );
  return { success: true, data: classDrugs };
};

// Get drug strengths (for a specific drug by generic name)
export const getDrugStrengths = async (genericName: string): Promise<ServiceResponse<Drug[]>> => {
  await delay();
  const strengthOptions = drugs.filter(d => 
    d.genericName.toLowerCase() === genericName.toLowerCase()
  );
  return { success: true, data: strengthOptions };
};

