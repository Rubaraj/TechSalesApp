// Base service utilities for JSON data operations
// In a real application, these would be API calls

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Simulate async data fetching
export const delay = (ms: number = 100): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Generate unique ID
export const generateId = (prefix: string): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`.toUpperCase();
};

// Format date to ISO string
export const formatDate = (date: Date = new Date()): string => {
  return date.toISOString();
};

// Calculate age from date of birth
export const calculateAge = (dob: string): number => {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

// Filter helper
export const filterByField = <T extends object>(
  items: T[],
  field: keyof T,
  value: unknown
): T[] => {
  return items.filter(item => item[field] === value);
};

// Search helper (case-insensitive)
export const searchByFields = <T extends object>(
  items: T[],
  searchTerm: string,
  fields: (keyof T)[]
): T[] => {
  const lowerSearch = searchTerm.toLowerCase();
  return items.filter(item => 
    fields.some(field => {
      const value = item[field];
      if (typeof value === 'string') {
        return value.toLowerCase().includes(lowerSearch);
      }
      return false;
    })
  );
};

// Sort helper
export const sortByField = <T extends object>(
  items: T[],
  field: keyof T,
  direction: 'asc' | 'desc' = 'asc'
): T[] => {
  return [...items].sort((a, b) => {
    const aVal = a[field] as unknown;
    const bVal = b[field] as unknown;
    
    if (aVal === null || aVal === undefined) return direction === 'asc' ? 1 : -1;
    if (bVal === null || bVal === undefined) return direction === 'asc' ? -1 : 1;
    
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return direction === 'asc' 
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    }
    
    return 0;
  });
};

// Pagination helper
export const paginateItems = <T>(
  items: T[],
  page: number,
  pageSize: number
): { data: T[]; total: number; totalPages: number } => {
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const data = items.slice(startIndex, startIndex + pageSize);
  
  return { data, total, totalPages };
};

