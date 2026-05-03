export interface Lead {
  leadId: string;
  firstName: string;
  lastName: string;
  dob: string;
  age?: number; // Deprecated: Use calculateAge(lead.dob) instead
  gender: 'Male' | 'Female';
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  zipCode: string;
  state: string;
  county: string;
  city: string;
  ethnicity?: string;
  race?: string;
  medicareNumber?: string;
  medicaidId?: string;
  stateAssistanceNumber?: string;
  partADate?: string;
  partBDate?: string;
  leadStatus: LeadStatus;
  source: LeadSource;
  permissionToContact: boolean;
  existingCarrier1Member: boolean;
  tobaccoUsage: boolean;
  taggedPharmacies: string[]; // Array of pharmacy IDs (max 3)
  taggedDrugs: TaggedDrug[];
  taggedProviders: string[]; // Array of provider IDs (max 5)
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface TaggedDrug {
  drugId: string;
  drugName?: string; // Drug name for display purposes
  dosage: string;
  quantity: number;
  frequency: string;
  daysSupply?: number; // Days supply for the medication
}

export type LeadStatus =
  | 'New Lead'
  | 'Contacted Lead'
  | 'Appointment Schedule'
  | 'Enrollment in progress'
  | 'Enrolled'
  | 'Dropped / Lost lead';

export type LeadSource = 'Web' | 'Call' | 'Event' | 'Referral' | 'Vendor';

export interface LeadFormData extends Omit<Lead, 'leadId' | 'age' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> {}

