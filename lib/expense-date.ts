/**
 * Expense dates are calendar days picked in a form ('YYYY-MM-DD').
 *
 * They used to be stored as UTC midnight of that day, which reports that group
 * by the store's own day (P&L, drawer close) read as the previous day for any
 * store west of UTC. A picked day is now stored as midday *at the store*: it
 * sits inside that store day in every time zone, and its UTC date is the same
 * day for any zone within ±12h. Older UTC-midnight rows still read correctly
 * for stores east of UTC (Manila), which is where they were written.
 */
import { tenantDayEdge, toTenantDateString } from '@/lib/timezone';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The instant to store for a picked expense day (or a full timestamp, kept as is). Null when invalid. */
export function expenseDateFromInput(value: unknown, tz?: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && DAY.test(value)) {
    const start = tenantDayEdge(value, 'start', tz);
    return Number.isNaN(start.getTime()) ? null : new Date(start.getTime() + 12 * 60 * 60 * 1000);
  }
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The store day of a stored expense date, as 'YYYY-MM-DD' (for the edit form). */
export function expenseDayString(date: Date | string, tz?: string): string {
  return toTenantDateString(date, tz);
}
