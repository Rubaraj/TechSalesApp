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
  /** Phase 3b.1 — free-form notes captured during/after the call. The AI
   *  post-call summarizer appends categorized lines here (e.g. "[concern]
   *  worried about premium"). Agent can edit freely. */
  notes?: string;
  /** Phase 4 (M1) — the agent who owns this lead. Drives Atlas's "my pipeline"
   *  tools. Backfilled from `createdBy` for legacy rows; new leads default to
   *  the creator unless explicitly reassigned. */
  assignedTo?: string;
  createdAt: string;
  createdBy: string;
  /**
   * How the lead was captured, when it wasn't typed by a human — currently
   * 'AI-SCREENING'. `createdBy` stays the owning agent so the lead lands in
   * their book (the Leads list scopes by it); this records the real source.
   */
  createdVia?: string;
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

