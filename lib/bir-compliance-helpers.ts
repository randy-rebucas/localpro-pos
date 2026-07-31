/**
 * BIR Compliance Utilities
 * Helper functions for PTU validation, date formatting, and feature detection
 */

/**
 * Check if PTU expiry date is within 30 days
 */
export function ptuExpiringSoon(expiryDate: string): boolean {
  if (!expiryDate) return false;
  // Compare calendar days (local midnight-to-midnight) rather than raw
  // instants — `new Date() + 30 days` retains the current time-of-day, so
  // comparing it directly against a midnight-stored expiry date would make
  // the 30-day threshold fuzzy by up to a day depending on time of day.
  const expiry = new Date(expiryDate);
  const expiryMidnight = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  const thirtyDaysOut = new Date();
  thirtyDaysOut.setHours(0, 0, 0, 0);
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
  return expiryMidnight <= thirtyDaysOut;
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
