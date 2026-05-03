export interface StateAssistanceEligibility {
  id: string;
  eligibilityId?: string;
  leadId: string;
  leadName: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  gender?: 'Male' | 'Female';
  medicareNumber?: string;
  stateAssistanceNumber: string;
  stateAssistanceId?: string;
  ssn?: string;
  state: string;
  stateAssistanceState?: string;
  isEligible: boolean;
  eligibilityType?: string;
  eligibilityDate?: string;
  verificationDate: string;
  expirationDate?: string;
  benefitType?: string;
  createdAt: string;
}

export interface PlanSubsidyEligibility {
  id: string;
  eligibilityId?: string;
  leadId: string;
  leadName: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  gender?: 'Male' | 'Female';
  medicareNumber: string;
  isEligible: boolean;
  subsidyLevel?: SubsidyLevel;
  copayLevel?: string;
  eligibilityDate?: string;
  verificationDate: string;
  effectiveDate?: string;
  expirationDate?: string;
  createdAt: string;
}

export type SubsidyLevel = 1 | 2 | 3 | 4;

export interface EligibilityCheckRequest {
  firstName: string;
  lastName: string;
  dob: string;
  gender: 'Male' | 'Female';
  medicareNumber: string;
  stateAssistanceId?: string;
  ssn?: string;
  stateAssistanceState?: string;
}

export interface EligibilityCheckResponse {
  isEligible: boolean;
  eligibilityType: 'stateAssistance' | 'planSubsidy';
  level?: SubsidyLevel;
  message?: string;
}

// Backwards compatibility aliases
export type MedicaidEligibility = StateAssistanceEligibility;
export type LISEligibility = PlanSubsidyEligibility;
export type LISLevel = SubsidyLevel;
