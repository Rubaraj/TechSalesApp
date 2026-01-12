// Lead types
export * from './lead';

// Plan types
export * from './plan';

// Pharmacy types
export * from './pharmacy';

// Provider types
export * from './provider';

// Drug types
export * from './drug';

// User types
export * from './user';

// Location types
export * from './location';

// Eligibility types
export * from './eligibility';

// PBA types (Scope of Appointments - SOA)
export * from './pba';

// PBKit types (Plan Electronic Kit - P-EKIT)
export * from './pbkit';

// Enrollment types
export * from './enrollment';

// Member types
export * from './member';

// Target types
export * from './target';

// Enrollment Form types
export * from './enrollmentForm';

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
