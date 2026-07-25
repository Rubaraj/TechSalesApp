/**
 * Server-side search/filter/sort helpers — semantic mirror of
 * `techsales-app/src/services/baseService.ts` so that the JSON repository
 * implementations behave identically to the FE's previous in-memory logic.
 *
 * Plan §11 ("Reuse from existing code") explicitly calls for this — the FE's
 * helpers ported here, not duplicated in repos.
 */

export type SortDirection = 'asc' | 'desc';

/** Filter helper — exact-match (`===`) on a single field. */
export const filterByField = <T extends object>(
  items: T[],
  field: keyof T,
  value: unknown,
): T[] => items.filter((item) => item[field] === value);

/**
 * Case-insensitive search across the named string fields. Multi-word terms
 * ("Joshua Johnson") require EVERY word to match at least one field — a
 * full name spans firstName + lastName, which whole-term matching against
 * individual fields can never satisfy. Single-word behavior is unchanged.
 */
export const searchByFields = <T extends object>(
  items: T[],
  searchTerm: string,
  fields: (keyof T)[],
): T[] => {
  const words = searchTerm.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items.filter((item) =>
    words.every((word) =>
      fields.some((field) => {
        const value = item[field];
        if (typeof value === 'string') {
          return value.toLowerCase().includes(word);
        }
        return false;
      }),
    ),
  );
};

/** Stable-ish sort by a single field; nullish values bucket to the end. */
export const sortByField = <T extends object>(
  items: T[],
  field: keyof T,
  direction: SortDirection = 'asc',
): T[] =>
  [...items].sort((a, b) => {
    const aVal = a[field] as unknown;
    const bVal = b[field] as unknown;

    if (aVal === null || aVal === undefined) return direction === 'asc' ? 1 : -1;
    if (bVal === null || bVal === undefined) return direction === 'asc' ? -1 : 1;

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    return 0;
  });
