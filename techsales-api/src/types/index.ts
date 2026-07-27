// Lead types
export * from './lead.js';

// Plan types
export * from './plan.js';

// Pharmacy types
export * from './pharmacy.js';

// Provider types
export * from './provider.js';

// Drug types
export * from './drug.js';

// User types
export * from './user.js';

// Location types
export * from './location.js';

// Eligibility types
export * from './eligibility.js';

// PBA types (Scope of Appointments - SOA)
export * from './pba.js';

// PBKit types (Plan Electronic Kit - P-EKIT)
export * from './pbkit.js';

// Enrollment types
export * from './enrollment.js';

// Member types
export * from './member.js';

// Target types
export * from './target.js';

// Enrollment Form types
export * from './enrollmentForm.js';

export * from './complianceRule.js';

export * from './coachingRule.js';

export * from './qaRubricItem.js';

export * from './simulatorPersona.js';
export * from './screeningPersona.js';

// Common types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: string;
  direction: SortDirection;
}

export interface FilterConfig {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith';
  value: string | number | boolean;
}
