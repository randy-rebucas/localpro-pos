/**
 * Tenant-timezone-aware date helpers.
 *
 * Report routes need "today"/"this week" boundaries computed in the
 * merchant's local calendar day, not the server's (Vercel runs UTC), or a
 * sale made at, say, 3am Manila time gets bucketed into the previous day's
 * report. `getTenantDayBoundaries` returns UTC instants that correspond to
 * 00:00:00.000 and 23:59:59.999 of the given calendar day *in tenantTz*.
 */

const DEFAULT_TENANT_TIMEZONE = 'Asia/Manila';

/** Offset in minutes of `tz` from UTC at the given instant (handles DST). */
function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce((acc: Record<string, string>, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

/**
 * Returns the UTC instant for 00:00:00.000 of `dateInput`'s calendar day
 * and the UTC instant for 23:59:59.999 of that same day, both as observed
 * in `tz`. `dateInput` may be a Date, a 'YYYY-MM-DD' string, or omitted
 * (defaults to "now" in tz).
 */
export function getTenantDayBoundaries(
  dateInput: Date | string | undefined,
  tz: string = DEFAULT_TENANT_TIMEZONE
): { start: Date; end: Date } {
  const ref = dateInput
    ? (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
      ? new Date(`${dateInput}T12:00:00Z`) // noon UTC avoids DST edge flipping the calendar day
      : new Date(dateInput))
    : new Date();

  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const ymd = dtf.format(ref); // YYYY-MM-DD in tz

  const offsetMin = tzOffsetMinutes(new Date(`${ymd}T00:00:00Z`), tz);
  const start = new Date(new Date(`${ymd}T00:00:00Z`).getTime() - offsetMin * 60000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

/** Resolve a startDate/endDate query-param pair to tenant-timezone-aware UTC boundaries. */
export function resolveTenantDateRange(
  startParam: string | null | undefined,
  endParam: string | null | undefined,
  tz: string = DEFAULT_TENANT_TIMEZONE,
  defaultDaysBack = 30
): { startDate: Date; endDate: Date } {
  const startDate = startParam
    ? getTenantDayBoundaries(startParam, tz).start
    : getTenantDayBoundaries(new Date(Date.now() - defaultDaysBack * 24 * 60 * 60 * 1000), tz).start;
  const endDate = endParam
    ? getTenantDayBoundaries(endParam, tz).end
    : new Date();
  return { startDate, endDate };
}

/** The tenant's configured IANA timezone, or the default (Asia/Manila). */
export function getTenantTimezone(settings?: { timezone?: string | null } | null): string {
  const tz = settings?.timezone;
  if (!tz) return DEFAULT_TENANT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TENANT_TIMEZONE; // invalid value stored in settings
  }
}

export interface TenantLocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0 = Sunday … 6 = Saturday
  ymd: string; // 'YYYY-MM-DD'
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Calendar/clock fields of `date` as observed in `tz` (replaces getHours()/getDay() etc.). */
export function getTenantLocalParts(date: Date, tz: string = DEFAULT_TENANT_TIMEZONE): TenantLocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(date).reduce((acc: Record<string, string>, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday],
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** 'YYYY-MM-DD' of `date` in `tz`. */
export function getTenantYmd(date: Date, tz: string = DEFAULT_TENANT_TIMEZONE): string {
  return getTenantLocalParts(date, tz).ymd;
}

/** Shift a 'YYYY-MM-DD' calendar date by whole days (pure calendar math, no timezone). */
export function addDaysToYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UTC instant of local wall-clock time `hhmm` ('HH:mm') on calendar day `ymd` in `tz`. */
export function tenantLocalTimeToUtc(ymd: string, hhmm: string, tz: string = DEFAULT_TENANT_TIMEZONE): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const { start } = getTenantDayBoundaries(ymd, tz);
  // Re-derive the offset at the target time so DST changes within the day are honoured.
  const guess = new Date(start.getTime() + ((h || 0) * 60 + (m || 0)) * 60000);
  const drift = tzOffsetMinutes(guess, tz) - tzOffsetMinutes(start, tz);
  return new Date(guess.getTime() - drift * 60000);
}

/** UTC boundaries of the calendar month containing `date` in `tz` (end is the last ms). */
export function getTenantMonthBoundaries(
  date: Date = new Date(),
  tz: string = DEFAULT_TENANT_TIMEZONE
): { start: Date; end: Date } {
  const { year, month } = getTenantLocalParts(date, tz);
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextFirst = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return {
    start: getTenantDayBoundaries(first, tz).start,
    end: new Date(getTenantDayBoundaries(nextFirst, tz).start.getTime() - 1),
  };
}

export { DEFAULT_TENANT_TIMEZONE };
