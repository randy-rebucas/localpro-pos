/**
 * BIR Compliance Utilities
 * Helper functions for PTU validation, date formatting, and feature detection
 */

/**
 * Check if PTU expiry date is within 30 days
 */
export function ptuExpiringSoon(expiryDate: string): boolean {
  if (!expiryDate) return false;
  const expiry = new Date(expiryDate);
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);
  return expiry <= thirtyDays;
}

/**
 * Format TIN display (NNN-NNN-NNN-NNN)
 */
export function formatTin(tin: string): string {
  if (!tin) return '';
  const digits = tin.replace(/\D/g, '');
  if (digits.length !== 12) return tin;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9, 12)}`;
}

/**
 * Validate TIN format
 */
export function validateTin(tin: string): boolean {
  if (!tin) return true; // optional field
  const digits = tin.replace(/\D/g, '');
  return digits.length === 12;
}

/**
 * Validate date is not in the future
 */
export function validateDateNotFuture(date: string): boolean {
  if (!date) return true; // optional field
  const inputDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return inputDate <= today;
}

/**
 * Format date for display (YYYY-MM-DD)
 */
export function formatDateDisplay(date: string): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * Check if all required PTU fields are filled
 */
export function hasCompletePtuInfo(birSettings: {
  birTin?: string;
  birPtuNumber?: string;
  birPtuIssuedDate?: string;
  birPtuExpiryDate?: string;
}): boolean {
  return !!(
    birSettings.birTin &&
    birSettings.birPtuNumber &&
    birSettings.birPtuIssuedDate &&
    birSettings.birPtuExpiryDate
  );
}

/**
 * Check if CAS date range is valid
 */
export function isValidCasDateRange(startDate: string, endDate: string): boolean {
  if (!startDate && !endDate) return true; // both optional
  if (startDate && !endDate) return true; // only start is optional
  if (!startDate && endDate) return false; // end without start is invalid

  const start = new Date(startDate);
  const end = new Date(endDate);
  return start <= end;
}

/**
 * Get warning message for expiring PTU
 */
export function getPtuExpiryWarning(expiryDate: string, dict?: any): string {
  if (!expiryDate) return '';
  return (
    dict?.admin?.ptuExpiryWarning ||
    `Warning: Your PTU expires on ${expiryDate}. Please renew with BIR.`
  );
}
