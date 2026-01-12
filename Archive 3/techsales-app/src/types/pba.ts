export interface PBA {
  pbaId: string;
  leadId: string;
  leadName: string;
  agentId: string;
  agentName: string;
  appointmentDate: string;
  appointmentTime: string;
  duration?: number; // in minutes
  meetingType?: MeetingType;
  meetingLocation?: string;
  meetingLink?: string;
  discussedTopics: string[];
  productsToDiscuss?: ProductToDiscuss[];
  meetingSummary?: string;
  status: PBAStatus;
  notes?: string;
  sentDate?: string;
  signedDate?: string;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type MeetingType = 
  | 'In-Person'
  | 'Phone'
  | 'Video Call'
  | 'Home Visit';

export type PBAStatus = 
  | 'pending'
  | 'sent'
  | 'completed'
  | 'expired'
  | 'Scheduled'
  | 'Confirmed'
  | 'Completed'
  | 'Cancelled'
  | 'No Show'
  | 'Rescheduled';

export interface ProductToDiscuss {
  productType: string;
  selected: boolean;
}

export const PRODUCTS_TO_DISCUSS: ProductToDiscuss[] = [
  { productType: 'Medicare Advantage (HMO)', selected: false },
  { productType: 'Medicare Advantage (PPO)', selected: false },
  { productType: 'Medicare Advantage (PFFS)', selected: false },
  { productType: 'Medicare Advantage (SNP)', selected: false },
  { productType: 'Medicare Prescription Drug Plan (PDP)', selected: false },
  { productType: 'Medicare Supplement (Medigap)', selected: false },
  { productType: 'Dental/Vision/Hearing Products', selected: false },
  { productType: 'Hospital Indemnity', selected: false },
];

