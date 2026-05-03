export interface Member {
  memberId: string;
  policyNumber: string;
  dateOfBirth: string; // YYYY-MM-DD format
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  planId: string;
  carrier: 'Carrier 1' | 'Carrier 2' | 'Carrier 3' | 'Carrier 4' | 'Carrier 5'; // Determines theme (only Carrier 1 and Carrier 2 are themed)
  assignedAgentId?: string; // Agent assigned to this member
  enrollmentDate: string;
  isActive: boolean;
  createdAt: string;
}

export interface MemberAppointment {
  appointmentId: string;
  memberId: string;
  agentId: string;
  agentName: string;
  appointmentType: 'Initial Consultation' | 'Follow-up' | 'Annual Review' | 'Plan Change';
  scheduledDate: string;
  scheduledTime: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'Rescheduled';
  notes?: string;
  createdAt: string;
}
