/**
 * BIR Compliance Utilities
 * Helper functions for PTU validation, date formatting, and feature detection
 */
import { DEFAULT_TENANT_TIMEZONE, addDaysToYmd, getTenantYmd } from '@/lib/timezone';

/**
 * Check if PTU expiry date is within 30 days (or already past).
 *
 * Compares tenant-local calendar days ('YYYY-MM-DD') rather than raw instants
 * or the runtime's local clock: `new Date() + 30 days` keeps the time-of-day,
 * and getFullYear()/getDate() follow whatever timezone the server (UTC on
 * Vercel) or browser happens to run in.
 */
export function ptuExpiringSoon(expiryDate: string, tz: string = DEFAULT_TENANT_TIMEZONE): boolean {
  if (!expiryDate) return false;
  let expiryYmd: string;
  // Date-only values are stored as UTC midnight of the entered day ('YYYY-MM-DD' -> new Date()),
  // so take that calendar day as-is; any other instant is judged in the tenant's timezone.
  if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(expiryDate)) {
    expiryYmd = expiryDate.slice(0, 10);
  } else {
    const expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime())) return false;
    expiryYmd = getTenantYmd(expiry, tz);
  }
  const thirtyDaysOut = addDaysToYmd(getTenantYmd(new Date(), tz), 30);
  return expiryYmd <= thirtyDaysOut;
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
