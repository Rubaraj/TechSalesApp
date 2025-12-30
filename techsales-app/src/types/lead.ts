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
  partADate?: string;
  partBDate?: string;
  leadStatus: LeadStatus;
  permissionToContact: boolean;
  existingAetnaMember: boolean;
  tobaccoUsage: boolean;
  taggedPharmacies: string[]; // Array of pharmacy IDs (max 3)
  taggedDrugs: TaggedDrug[];
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface TaggedDrug {
  drugId: string;
  dosage: string;
  quantity: number;
  frequency: string;
}

export type LeadStatus = 
  | 'New'
  | 'Contacted'
  | 'Qualified'
  | 'Proposal'
  | 'Enrolled'
  | 'Lost'
  | 'Follow-up';

export interface LeadFormData extends Omit<Lead, 'leadId' | 'age' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> {}

