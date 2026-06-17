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
type Dict = Record<string, Record<string, string | undefined> | undefined>;

export function getPtuExpiryWarning(expiryDate: string, dict?: Dict): string {
  if (!expiryDate) return '';
  return (
    dict?.admin?.ptuExpiryWarning ||
    `Warning: Your PTU expires on ${expiryDate}. Please renew with BIR.`
  );
}
