/**
 * Tenant-local calendar helpers for automations.
 *
 * Cron jobs run on a UTC server clock (Vercel), but tenants live in
 * `settings.timezone` (default Asia/Manila). Never use server-local Date
 * methods (setHours/getDay/getDate/toLocaleString without timeZone) in jobs;
 * use these helpers, built on lib/timezone.ts, instead.
 */

import {
  addDaysToYmd,
  getTenantDayBoundaries,
  getTenantLocalParts,
  getTenantTimezone,
} from '@/lib/timezone';

export type CalendarPeriod = 'daily' | 'weekly' | 'monthly';

export interface LocalPeriod {
  /** UTC instant of 00:00:00.000 local on startYmd */
  start: Date;
  /** UTC instant of 23:59:59.999 local on endYmd */
  end: Date;
  startYmd: string;
  endYmd: string;
}

/** The tenant's IANA timezone (settings.timezone, default Asia/Manila). */
export function tenantTimezone(settings?: { timezone?: string | null } | null): string {
  return getTenantTimezone(settings);
}

const LOCALE = 'en-PH';

/** e.g. "Oct 31, 2026, 9:05 AM" in the tenant's timezone. */
export function formatTenantDateTime(date: Date, tz: string): string {
  return date.toLocaleString(LOCALE, {
    timeZone: tz, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** e.g. "Oct 31, 2026" in the tenant's timezone. */
export function formatTenantDate(date: Date, tz: string): string {
  return date.toLocaleDateString(LOCALE, { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' });
}

/** e.g. "9:05 AM" in the tenant's timezone. */
export function formatTenantTime(date: Date, tz: string): string {
  return date.toLocaleTimeString(LOCALE, { timeZone: tz, hour: 'numeric', minute: '2-digit' });
}

/** Format a calendar date 'YYYY-MM-DD' (no timezone shift); other strings are returned as-is. */
export function formatYmd(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return formatTenantDate(new Date(`${ymd}T12:00:00Z`), 'UTC');
}

function rangeOf(startYmd: string, endYmd: string, tz: string): LocalPeriod {
  return {
    start: getTenantDayBoundaries(startYmd, tz).start,
    end: getTenantDayBoundaries(endYmd, tz).end,
    startYmd,
    endYmd,
  };
}

/** Weekday (0 = Sunday) of a calendar date 'YYYY-MM-DD'. */
export function weekdayOfYmd(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

/**
 * The local calendar period containing `ymd`: the day itself, its Monday–Sunday
 * week, or its calendar month.
 */
export function localPeriodContaining(ymd: string, period: CalendarPeriod, tz: string): LocalPeriod {
  if (period === 'daily') return rangeOf(ymd, ymd, tz);
  if (period === 'weekly') {
    const monday = addDaysToYmd(ymd, -((weekdayOfYmd(ymd) + 6) % 7));
    return rangeOf(monday, addDaysToYmd(monday, 6), tz);
  }
  const [y, m] = ymd.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return rangeOf(first, addDaysToYmd(nextFirst, -1), tz);
}

/** The local period immediately before `p` (same granularity). */
export function localPeriodBefore(p: LocalPeriod, period: CalendarPeriod, tz: string): LocalPeriod {
  return localPeriodContaining(addDaysToYmd(p.startYmd, -1), period, tz);
}

/**
 * The most recent *complete* local period as of `now`: yesterday, last
 * Monday–Sunday week, or last calendar month (in the tenant's timezone).
 */
export function previousCompleteLocalPeriod(now: Date, period: CalendarPeriod, tz: string): LocalPeriod {
  const today = getTenantLocalParts(now, tz).ymd;
  return localPeriodBefore(localPeriodContaining(today, period, tz), period, tz);
}

/** Minutes since local midnight for an 'HH:mm' string (NaN-safe → null). */
export function hhmmToMinutes(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}
