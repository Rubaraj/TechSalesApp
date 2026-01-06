import type { Plan, Benefit, Premium, StarRating, PlanCategory } from '../types';
import type { ColorTheme } from '../context/ThemeContext';
import type { ServiceResponse } from './baseService';
import plansData from '../data/lookup/planInformation.json';
import benefitsData from '../data/lookup/benefitData.json';
import premiumsData from '../data/lookup/premiumInformation.json';
import ratingsData from '../data/lookup/starRatings.json';
import { 
  delay, 
  searchByFields, 
  filterByField, 
  sortByField, 
  paginateItems,
} from './baseService';

// Load data - using unknown cast to handle JSON null vs undefined
const plans: Plan[] = (plansData as unknown) as Plan[];
const benefits: Benefit[] = benefitsData as Benefit[];
const premiums: Premium[] = premiumsData as Premium[];
const ratings: StarRating[] = ratingsData as StarRating[];

export interface PlanFilters {
  category?: PlanCategory;
  planType?: string;
  market?: string;
  region?: string;
  minAge?: number;
  maxAge?: number;
  commissionable?: boolean;
  snpType?: string;
  carrier?: string; // Filter by insurance company (e.g., "Aetna", "UnitedHealthcare", "Humana")
}

export interface PlanSearchParams {
  searchTerm?: string;
  filters?: PlanFilters;
  sortField?: keyof Plan;
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  colorTheme?: ColorTheme; // Theme-based filtering (default shows all, aetna/humana filter by carrier)
}

export interface PlanWithDetails extends Plan {
  benefits: Benefit[];
  premium: Premium | null;
  starRating: StarRating | null;
}

// Get all plans
export const getAllPlans = async (): Promise<ServiceResponse<Plan[]>> => {
  await delay();
  return { success: true, data: plans.filter(p => !p.isDeleted) };
};

// Get plan by ID
export const getPlanById = async (planId: string): Promise<ServiceResponse<Plan>> => {
  await delay();
  const plan = plans.find(p => p.planId === planId && !p.isDeleted);
  
  if (!plan) {
    return { success: false, error: 'Plan not found' };
  }
  
  return { success: true, data: plan };
};

// Get plan with full details
export const getPlanWithDetails = async (planId: string): Promise<ServiceResponse<PlanWithDetails>> => {
  await delay();
  
  const plan = plans.find(p => p.planId === planId && !p.isDeleted);
  
  if (!plan) {
    return { success: false, error: 'Plan not found' };
  }
  
  const planBenefits = benefits.filter(b => b.planId === planId && !b.isDeleted);
  const planPremium = premiums.find(p => p.planId === planId && !p.isDeleted) || null;
  const planRating = ratings.find(r => r.planId === planId) || null;
  
  const planWithDetails: PlanWithDetails = {
    ...plan,
    benefits: planBenefits,
    premium: planPremium,
    starRating: planRating
  };
  
  return { success: true, data: planWithDetails };
};

// Extended Plan type with premium and rating for list display
export interface PlanWithPremium extends Plan {
  monthlyPremium?: number;
  starRating?: number;
}

// Search plans with filters
export const searchPlans = async (params: PlanSearchParams): Promise<ServiceResponse<{
  data: PlanWithPremium[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}>> => {
  await delay();
  
  let filteredPlans = plans.filter(p => !p.isDeleted);
  
  // Apply theme-based carrier filtering first (before other filters)
  // Default theme: show all plans
  // Aetna theme: show only Aetna plans
  // Humana theme: show only Humana plans
  if (params.colorTheme === 'aetna') {
    filteredPlans = filteredPlans.filter(p => 
      p.marketingName.toLowerCase().includes('aetna') ||
      p.legalEntity.toLowerCase().includes('aetna')
    );
  } else if (params.colorTheme === 'humana') {
    filteredPlans = filteredPlans.filter(p => 
      p.marketingName.toLowerCase().includes('humana') ||
      p.legalEntity.toLowerCase().includes('humana')
    );
  }
  // Default theme: no filtering (show all plans)
  
  // Apply search
  if (params.searchTerm) {
    filteredPlans = searchByFields(filteredPlans, params.searchTerm, [
      'planName', 'contractNumber', 'planType', 'market', 'marketingName', 'legalEntity'
    ]);
  }
  
  // Apply filters
  if (params.filters) {
    if (params.filters.category) {
      filteredPlans = filterByField(filteredPlans, 'category', params.filters.category);
    }
    if (params.filters.planType) {
      filteredPlans = filterByField(filteredPlans, 'planType', params.filters.planType);
    }
    if (params.filters.market) {
      filteredPlans = filterByField(filteredPlans, 'market', params.filters.market);
    }
    if (params.filters.region) {
      filteredPlans = filterByField(filteredPlans, 'region', params.filters.region);
    }
    if (params.filters.commissionable !== undefined) {
      filteredPlans = filterByField(filteredPlans, 'commissionable', params.filters.commissionable);
    }
    if (params.filters.snpType) {
      filteredPlans = filterByField(filteredPlans, 'snpType', params.filters.snpType);
    }
    // Carrier filter - check marketingName and legalEntity
    if (params.filters.carrier) {
      const carrierLower = params.filters.carrier.toLowerCase();
      filteredPlans = filteredPlans.filter(p => 
        p.marketingName.toLowerCase().includes(carrierLower) ||
        p.legalEntity.toLowerCase().includes(carrierLower)
      );
    }
    // Age filter
    if (params.filters.minAge !== undefined) {
      filteredPlans = filteredPlans.filter(p => 
        p.minAge === null || p.minAge === undefined || p.minAge <= params.filters!.minAge!
      );
    }
  }
  
  // Apply sorting
  if (params.sortField) {
    filteredPlans = sortByField(filteredPlans, params.sortField, params.sortDirection || 'asc');
  }
  
  // Apply pagination
  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  const { data, total, totalPages } = paginateItems(filteredPlans, page, pageSize);
  
  // Enrich plans with premium and rating data
  const enrichedPlans: PlanWithPremium[] = data.map(plan => {
    const planPremium = premiums.find(p => p.planId === plan.planId && !p.isDeleted);
    const planRating = ratings.find(r => r.planId === plan.planId);
    
    return {
      ...plan,
      monthlyPremium: planPremium?.premium ?? 0,
      starRating: planRating?.overallRating ?? 0,
    };
  });
  
  return {
    success: true,
    data: { data: enrichedPlans, total, page, pageSize, totalPages }
  };
};

// Get plans by category
export const getPlansByCategory = async (category: PlanCategory): Promise<ServiceResponse<Plan[]>> => {
  await delay();
  const categoryPlans = plans.filter(p => p.category === category && !p.isDeleted);
  return { success: true, data: categoryPlans };
};

// Get benefits for a plan
export const getPlanBenefits = async (planId: string): Promise<ServiceResponse<Benefit[]>> => {
  await delay();
  const planBenefits = benefits.filter(b => b.planId === planId && !b.isDeleted);
  return { success: true, data: planBenefits };
};

// Get premium for a plan (single)
export const getPlanPremium = async (planId: string): Promise<ServiceResponse<Premium | null>> => {
  await delay();
  const planPremium = premiums.find(p => p.planId === planId && !p.isDeleted) || null;
  return { success: true, data: planPremium };
};

// Get all premiums for a plan (multiple regions/counties)
export const getPlanPremiums = async (planId: string): Promise<ServiceResponse<Premium[]>> => {
  await delay();
  const planPremiums = premiums.filter(p => p.planId === planId && !p.isDeleted);
  return { success: true, data: planPremiums };
};

// Get star rating for a plan
export const getPlanRating = async (planId: string): Promise<ServiceResponse<StarRating | null>> => {
  await delay();
  const planRating = ratings.find(r => r.planId === planId) || null;
  return { success: true, data: planRating };
};

// Calculate adjusted premium based on eligibility
export const calculateAdjustedPremium = (
  premium: Premium,
  hasMedicaid: boolean,
  lisLevel?: number
): number => {
  if (hasMedicaid && premium.medicaidAdjustedPremium !== undefined) {
    return premium.medicaidAdjustedPremium;
  }
  
  if (lisLevel) {
    switch (lisLevel) {
      case 1:
        return premium.lisLevel1Premium ?? premium.premium;
      case 2:
        return premium.lisLevel2Premium ?? premium.premium;
      case 3:
        return premium.lisLevel3Premium ?? premium.premium;
      case 4:
        return premium.lisLevel4Premium ?? premium.premium;
    }
  }
  
  return premium.premium;
};

// Compare plans
export const comparePlans = async (planIds: string[]): Promise<ServiceResponse<PlanWithDetails[]>> => {
  await delay();
  
  const comparedPlans: PlanWithDetails[] = [];
  
  for (const planId of planIds) {
    const result = await getPlanWithDetails(planId);
    if (result.success && result.data) {
      comparedPlans.push(result.data);
    }
  }
  
  return { success: true, data: comparedPlans };
};

