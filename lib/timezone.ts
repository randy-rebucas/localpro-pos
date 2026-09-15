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

export { DEFAULT_TENANT_TIMEZONE };
