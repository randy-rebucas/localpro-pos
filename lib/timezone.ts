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

/**
 * The calendar day `daysBack` days before today in `tz`, as 'YYYY-MM-DD'.
 * Falls back to the default timezone if `tz` isn't one the runtime recognises.
 */
export function getTenantDateString(tz: string = DEFAULT_TENANT_TIMEZONE, daysBack = 0): string {
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let today: string;
  try {
    today = format(tz);
  } catch {
    today = format(DEFAULT_TENANT_TIMEZONE);
  }
  const day = new Date(`${today}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - daysBack);
  return day.toISOString().slice(0, 10);
}

/**
 * The calendar day of `date` as observed in `tz`, as 'YYYY-MM-DD'.
 * Falls back to the default timezone if `tz` isn't one the runtime recognises.
 */
export function toTenantDateString(date: Date | string, tz: string = DEFAULT_TENANT_TIMEZONE): string {
  const d = new Date(date);
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  try {
    return format(tz);
  } catch {
    return format(DEFAULT_TENANT_TIMEZONE);
  }
}

/**
 * The calendar month containing `now`, as observed in `tz`: `start` is 00:00 on the 1st
 * at the store and `end` is 00:00 on the 1st of the next month (exclusive).
 * Falls back to the default timezone if `tz` isn't one the runtime recognises.
 */
export function getTenantMonthRange(tz: string = DEFAULT_TENANT_TIMEZONE, now: Date = new Date()): { start: Date; end: Date } {
  let zone = tz;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
  } catch {
    zone = DEFAULT_TENANT_TIMEZONE;
  }
  const [y, m] = toTenantDateString(now, zone).split('-').map(Number);
  const first = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}-01`;
  const next = m === 12 ? first(y + 1, 1) : first(y, m + 1);
  return {
    start: getTenantDayBoundaries(first(y, m), zone).start,
    end: getTenantDayBoundaries(next, zone).start,
  };
}

/**
 * Turn a date picked in a form into the instant a validity window opens or closes.
 * A plain 'YYYY-MM-DD' day means the start (or, with `edge: 'end'`, the last
 * millisecond) of that day in `tz`, so "valid until Nov 8" lasts all of Nov 8 at
 * the store. Any other value is read as a full date and time and kept as is.
 */
export function tenantDayEdge(value: string | Date, edge: 'start' | 'end', tz: string = DEFAULT_TENANT_TIMEZONE): Date {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    let bounds;
    try {
      bounds = getTenantDayBoundaries(value, tz);
    } catch {
      bounds = getTenantDayBoundaries(value, DEFAULT_TENANT_TIMEZONE);
    }
    return edge === 'start' ? bounds.start : bounds.end;
  }
  return new Date(value);
}

/**
 * Read a wall-clock time picked in a form ('YYYY-MM-DDTHH:mm', as a
 * datetime-local input gives it) as that time at the store, and return the
 * instant. Without this the server reads it in its own zone (UTC on Vercel),
 * so a 10:00 booking in Manila would land at 18:00. Any other value is read
 * as a full date and time and kept as is.
 */
export function tenantWallTimeToDate(value: string, tz: string = DEFAULT_TENANT_TIMEZONE): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return new Date(value);
  const asUTC = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
  let zone = tz;
  try {
    tzOffsetMinutes(new Date(asUTC), zone);
  } catch {
    zone = DEFAULT_TENANT_TIMEZONE;
  }
  // Second pass settles times near a clock change, where the offset differs either side.
  const first = asUTC - tzOffsetMinutes(new Date(asUTC), zone) * 60000;
  return new Date(asUTC - tzOffsetMinutes(new Date(first), zone) * 60000);
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
