/**
 * Business hours (Admin → Business Hours) applied to bookings, in the store's time zone.
 *
 * A store that has not set any weekly hours gets no restriction (`null`), so bookings
 * behave as they did before hours existed. Special dates override the weekly sign.
 */
import type { ITenantSettings } from '@/types/tenant';
import { tenantWallTimeToDate, toTenantDateString } from '@/lib/timezone';

type BusinessHours = NonNullable<ITenantSettings['businessHours']>;

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface DayWindow {
  open: Date;
  /** Exclusive. On an overnight day this falls on the next calendar day. */
  close: Date;
  breaks: Array<{ start: Date; end: Date }>;
}

/** The time zone the hours are kept in: the hours' own, else the store's. */
export function hoursTimeZone(hours: BusinessHours | undefined, storeTz?: string): string | undefined {
  return hours?.timezone || storeTz || undefined;
}

function hasWeeklyHours(hours: BusinessHours | undefined): boolean {
  return !!hours?.schedule && Object.keys(hours.schedule).length > 0;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function window(day: string, openTime: string, closeTime: string, tz: string | undefined, breaks: Array<{ start: string; end: string }> = []): DayWindow | null {
  if (!HHMM.test(openTime) || !HHMM.test(closeTime)) return null;
  const overnight = closeTime <= openTime;
  const at = (d: string, t: string) => tenantWallTimeToDate(`${d}T${t}`, tz);
  const open = at(day, openTime);
  const close = at(overnight ? addDays(day, 1) : day, closeTime);
  const shaped = breaks
    .filter((b) => HHMM.test(b.start) && HHMM.test(b.end) && b.end > b.start)
    .map((b) => {
      // A break before the opening time on an overnight day belongs to the early hours of the next day.
      const d = overnight && b.start < openTime ? addDays(day, 1) : day;
      return { start: at(d, b.start), end: at(d, b.end) };
    });
  return { open, close, breaks: shaped };
}

/**
 * The bookable window for a calendar day ('YYYY-MM-DD' at the store).
 * Returns 'closed' when the store is shut that day, or null when no hours apply.
 */
export function bookableWindow(day: string, hours: BusinessHours | undefined, storeTz?: string): DayWindow | 'closed' | null {
  if (!hasWeeklyHours(hours) && !hours?.specialHours?.length) return null;
  const tz = hoursTimeZone(hours, storeTz);

  const special = hours?.specialHours?.find((s) => s.date === day);
  if (special) {
    if (!special.enabled) return 'closed';
    if (special.openTime && special.closeTime) return window(day, special.openTime, special.closeTime, tz) ?? null;
  }

  if (!hasWeeklyHours(hours)) return null;
  const weekday = DAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
  const entry = hours!.schedule![weekday];
  if (!entry || !entry.enabled) return 'closed';
  if (!entry.openTime || !entry.closeTime) return null; // open, but no times set: no limit that day
  return window(day, entry.openTime, entry.closeTime, tz, entry.breaks) ?? null;
}

export type HoursCheck = { ok: true } | { ok: false; reason: 'closedDay' | 'outsideHours' | 'break' };

/**
 * Whether a booking from `start` to `end` fits the store's hours. It must sit inside one day's
 * window (its own day's, or the previous day's when that day runs past midnight) and miss every break.
 */
export function bookingFitsHours(start: Date, end: Date, hours: BusinessHours | undefined, storeTz?: string): HoursCheck {
  const tz = hoursTimeZone(hours, storeTz);
  const day = toTenantDateString(start, tz);
  const candidates = [bookableWindow(day, hours, storeTz), bookableWindow(addDays(day, -1), hours, storeTz)];
  if (candidates[0] === null) return { ok: true };

  for (const w of candidates) {
    if (!w || w === 'closed') continue;
    if (start >= w.open && end <= w.close) {
      const hitsBreak = w.breaks.some((b) => start < b.end && end > b.start);
      return hitsBreak ? { ok: false, reason: 'break' } : { ok: true };
    }
  }
  return { ok: false, reason: candidates[0] === 'closed' ? 'closedDay' : 'outsideHours' };
}
