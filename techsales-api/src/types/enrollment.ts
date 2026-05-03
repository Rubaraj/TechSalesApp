export interface Enrollment {
  enrollmentId: string;
  leadId: string;
  planId: string;
  agentId: string;
  enrollmentDate: string;
  effectiveDate: string;
  enrollmentType: EnrollmentType;
  enrollmentPeriod: EnrollmentPeriod;
  status: EnrollmentStatus;
  confirmationNumber?: string;
  premium: number;
  medicaidEligible: boolean;
  lisLevel?: number;
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type EnrollmentType =
  | 'New Enrollment'
  | 'Plan Change'
  | 'Disenrollment'
  | 'Re-enrollment';

export type EnrollmentPeriod =
  | 'AEP' // Annual Enrollment Period
  | 'OEP' // Open Enrollment Period
  | 'SEP' // Special Enrollment Period
  | 'IEP' // Initial Enrollment Period
  | 'ICEP'; // Initial Coverage Election Period

export type EnrollmentStatus =
  | 'Pending'
  | 'Submitted'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled'
  | 'Active'
  | 'Terminated';

