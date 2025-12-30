// Lead types
export * from './lead';

// Plan types
export * from './plan';

// Pharmacy types
export * from './pharmacy';

// Drug types
export * from './drug';

// User types
export * from './user';

// Location types
export * from './location';

// Eligibility types
export * from './eligibility';

// PBA types (Plan Briefing Appointment)
export * from './pba';

// PBKit types (Plan Bundle Kit)
export * from './pbkit';

// Enrollment types
export * from './enrollment';

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
