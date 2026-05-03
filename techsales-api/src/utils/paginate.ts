/**
 * Pagination helper — pure, identical semantics to the FE's
 * `paginateItems` in `baseService.ts`.
 */

export interface PaginatedSlice<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const paginateItems = <T>(
  items: T[],
  page: number,
  pageSize: number,
): PaginatedSlice<T> => {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeSize = Math.max(1, Math.floor(pageSize) || 1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const startIndex = (safePage - 1) * safeSize;
  const data = items.slice(startIndex, startIndex + safeSize);
  return { data, total, page: safePage, pageSize: safeSize, totalPages };
};

/** Generates a unique ID with a prefix — mirrors FE `generateId`. */
export const generateId = (prefix: string): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`.toUpperCase();
};

/** Calculates age from an ISO `dob` — mirrors FE `calculateAge`. */
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

/** Formats a date as ISO — mirrors FE `formatDate`. */
export const formatDate = (date: Date = new Date()): string => date.toISOString();
