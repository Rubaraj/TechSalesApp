export interface Target {
  targetId: string;
  metric: TargetMetric;
  period: TargetPeriod;
  targetValue: number;
  points: number;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type TargetMetric =
  | 'New Leads'
  | 'New Enrollments'
  | 'New Appointments'
  | 'Electronic Kits Sent';

export type TargetPeriod =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

export interface TargetFormData {
  metric: TargetMetric;
  period: TargetPeriod;
  targetValue: number;
  points: number;
  isActive: boolean;
}

