/**
 * Calculate age from date of birth
 * @param dob - Date of birth in ISO format (YYYY-MM-DD) or Date object
 * @returns Age in years
 */
export function calculateAge(dob: string | Date): number {
  const birthDate = typeof dob === 'string' ? new Date(dob) : dob;
  const today = new Date();
  
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  // Adjust age if birthday hasn't occurred yet this year
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Format a date string to a readable format
 * @param dateString - Date in ISO format
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatDate(
  dateString: string,
  options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  }
): string {
  if (!dateString) return '';
  // A bare `YYYY-MM-DD` (how enrollmentDate and scheduledDate are stored) is
  // parsed by `new Date()` as UTC midnight, so west of UTC it renders as the
  // previous day — "2026-08-01" showed as "Jul 31, 2026". Read date-only values
  // as local midnight, matching how they are filtered.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(dateString);
  return date.toLocaleDateString('en-US', options);
}

/**
 * Get age with label (e.g., "67 years")
 * @param dob - Date of birth
 * @returns Formatted age string
 */
export function getAgeLabel(dob: string | Date): string {
  const age = calculateAge(dob);
  return `${age} year${age !== 1 ? 's' : ''}`;
}

/**
 * Check if someone is eligible for Medicare (65+)
 * @param dob - Date of birth
 * @returns True if 65 or older
 */
export function isMedicareEligible(dob: string | Date): boolean {
  return calculateAge(dob) >= 65;
}





