export interface EnrollmentFormData {
  // Step 1: Election Period
  requestedEffectiveDate: string;
  electionPeriod: ElectionPeriodType;
  
  // Step 2: Contact Info
  firstName: string;
  middleInitials?: string;
  lastName: string;
  dateOfBirth: string;
  sex: 'Male' | 'Female';
  primaryPhone: string;
  email: string;
  permanentResidence?: {
    address1: string;
    address2?: string;
    city: string;
    state: string;
    zipCode: string;
  };
  
  // Step 3: Other Info
  medicaidEnrolled?: boolean;
  aetnaMember?: boolean;
  preferredLanguage: string;
  preferredWrittenLanguage: string;
  accessibleFormat?: string;
  
  // Step 4: Release of Information
  releaseOfInformation: boolean;
  relationshipToEnrollee: RelationshipType;
  assistName: string;
  assistRelationship: string;
  
  // Step 5: Submit
  agentSignature: string;
  beneficiarySignature: string;
  allowEmailContact: boolean;
  scopeOfAppointment: boolean;
  disclaimer: boolean;
}

export type ElectionPeriodType =
  | 'initial-enrollment'
  | 'part-b-recent'
  | 'notified-after-start'
  | 'turning-65'
  | 'ma-open-enrollment'
  | 'moved-outside-area'
  | 'moved-back-us';

export type RelationshipType =
  | 'self'
  | 'authorized-representative';

export interface EnrollmentStepProps {
  formData: EnrollmentFormData;
  onUpdate: (data: Partial<EnrollmentFormData>) => void;
  onNext: () => void;
  onBack: () => void;
  onSaveDraft: () => void;
}

