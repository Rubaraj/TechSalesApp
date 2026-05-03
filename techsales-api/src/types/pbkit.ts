export interface PBKit {
  pbkitId: string;
  leadId: string;
  leadName: string;
  leadEmail: string;
  agentId: string;
  agentName: string;
  recipientEmail?: string;
  recipientName?: string;
  subject?: string;
  planIds: string[];
  planNames: string[];
  templateType?: PBKitTemplateType;
  customMessage?: string;
  sentDate?: string;
  sentAt?: string;
  status: PBKitStatus;
  openedDate?: string;
  openedAt?: string;
  clickedAt?: string;
  createdAt: string;
  createdBy?: string;
}

export type PBKitTemplateType =
  | 'Plan Comparison'
  | 'Single Plan Details'
  | 'Welcome'
  | 'Follow Up'
  | 'Enrollment Confirmation';

export type PBKitStatus =
  | 'pending'
  | 'sent'
  | 'opened'
  | 'clicked'
  | 'Draft'
  | 'Sent'
  | 'Delivered'
  | 'Opened'
  | 'Clicked'
  | 'Bounced'
  | 'Failed';

export interface PBKitSendRequest {
  leadId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  planIds: string[];
  templateType: PBKitTemplateType;
  customMessage?: string;
}

