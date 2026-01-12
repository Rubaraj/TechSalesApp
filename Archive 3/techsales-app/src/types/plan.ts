export interface PlanDocument {
  documentId: string;
  documentName: string;
  documentType: 'Summary of Benefits' | 'Evidence of Coverage' | 'Formulary' | 'Provider Directory' | 'Annual Notice of Change' | 'Other';
  documentUrl: string;
  documentDate?: string;
}

export interface Plan {
  planId: string;
  contractYear: number;
  contractNumber: string;
  pbp: string;
  segmentId?: string;
  planName: string;
  product: ProductType;
  planType: PlanType;
  category: PlanCategory;
  commissionable: boolean;
  planStatus: 'Active' | 'Inactive' | 'Renewal' | 'New Plan';
  market: string;
  region: string;
  legalEntity: string;
  marketingName: string;
  minAge?: number;
  maxAge?: number;
  snpType?: 'DSNP' | 'CSNP' | 'ISNP' | null;
  documents?: PlanDocument[];
  isDeleted: boolean;
}

export type ProductType = 'MAPD' | 'MA' | 'PDP' | 'Medsup' | 'ANC';

export type PlanType = 
  | 'HMO' 
  | 'PPO' 
  | 'POS' 
  | 'RPPO' 
  | 'PDP' 
  | 'DSNP' 
  | 'CSNP' 
  | 'ISNP'
  | 'Medigap';

export type PlanCategory = 
  | 'Medicare Advantage' 
  | 'PDP' 
  | 'Medsup' 
  | 'ANC';

export interface Benefit {
  benefitId: string;
  planId: string;
  contractYear: number;
  contractNumber: string;
  pbp: string;
  category: BenefitCategory;
  categoryData: string;
  categoryGroup: string;
  categoryOrder: number;
  isAvailable?: boolean; // Whether this benefit is available (defaults to true if not specified)
  isDeleted: boolean;
}

export type BenefitCategory = 
  | 'Plan Information'
  | 'DOCTOR SERVICES'
  | 'Facility Services'
  | 'Emergency/Urgent Care'
  | 'Diagnostic/Lab'
  | 'Ambulatory surgical center'
  | 'Diabetic Monitoring Supplies'
  | 'Durable Medical Equipment'
  | 'Dental'
  | 'Hearing'
  | 'Vision'
  | 'Preventive Benefits'
  | 'Wellness'
  | 'Home Health Care'
  | 'Additional Telehealth Services'
  | 'Mental Health'
  | 'Extra Benefits'
  | 'Prescription Drug Coverage';

export interface Premium {
  premiumId: string;
  planId: string;
  premium: number;
  medicaidAdjustedPremium?: number;
  lisLevel1Premium?: number;
  lisLevel2Premium?: number;
  lisLevel3Premium?: number;
  lisLevel4Premium?: number;
  isDeleted: boolean;
}

export interface StarRating {
  ratingId: string;
  planId: string;
  contractYear: number;
  overallRating: number;
  healthServicesRating?: number;
  drugServicesRating?: number;
  memberExperienceRating?: number;
}

export interface PlanRecommendation {
  recommendationId: string;
  leadId: string;
  opportunityType: 'CrossSell' | 'Plan Conversion' | 'Product Term ReSell' | 'MEI';
  opportunityYear: number;
  currentPlanId?: string;
  recommendedPlanId: string;
  statusId: number;
  enrollmentId?: string;
  isDeleted: boolean;
  createdAt: string;
  createdBy: string;
}

