export interface HolidayRecurring {
  pattern: 'yearly' | 'monthly' | 'weekly';
  month?: number;
  dayOfMonth?: number;
  dayOfWeek?: number;
}

export interface Holiday {
  id: string;
  name: string;
  type: 'single' | 'recurring';
  date?: string;
  recurring?: HolidayRecurring;
  isBusinessClosed: boolean;
}

/**
 * Whether the business is marked closed on the given date per the tenant's
 * configured holiday calendar (Admin → Holidays). Only holidays with
 * isBusinessClosed: true block anything — informational holidays don't.
 * Pass the tenant's `timeZone` so the day is read at the store, not on the server
 * (a 7am Manila booking is the previous day in UTC).
 */
export function getClosedHolidayForDate(holidays: Holiday[] | undefined, date: Date, timeZone?: string): Holiday | null {
  if (!holidays?.length) return null;

  const { year, month, day, dayOfWeek } = calendarParts(date, timeZone);
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  for (const holiday of holidays) {
    if (!holiday.isBusinessClosed) continue;

    if (holiday.type === 'single') {
      if (holiday.date === isoDate) return holiday;
      continue;
    }

    const r = holiday.recurring;
    if (!r) continue;

    if (r.pattern === 'yearly' && r.month === month && r.dayOfMonth === day) return holiday;
    if (r.pattern === 'monthly' && r.dayOfMonth === day) return holiday;
    if (r.pattern === 'weekly' && r.dayOfWeek === dayOfWeek) return holiday;
  }

  return null;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The next day (on or after `today`, both 'YYYY-MM-DD' at the store) this holiday falls on,
 * or null for a single date that has passed or a pattern that cannot occur.
 */
export function nextHolidayDate(holiday: Pick<Holiday, 'type' | 'date' | 'recurring'>, today: string): string | null {
  const [ty, tm, td] = today.split('-').map(Number);
  if (!ty || !tm || !td) return null;
  if (holiday.type === 'single') return holiday.date && holiday.date >= today ? holiday.date : null;

  const r = holiday.recurring;
  if (!r) return null;
  const start = new Date(Date.UTC(ty, tm - 1, td));
  const fits = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d;

  if (r.pattern === 'weekly') {
    if (r.dayOfWeek === undefined || r.dayOfWeek < 0 || r.dayOfWeek > 6) return null;
    const ahead = (r.dayOfWeek - start.getUTCDay() + 7) % 7;
    return isoDay(new Date(start.getTime() + ahead * 86_400_000));
  }
  if (r.pattern === 'monthly' && r.dayOfMonth) {
    for (let i = 0; i < 13; i++) {
      const y = ty + Math.floor((tm - 1 + i) / 12);
      const m = ((tm - 1 + i) % 12) + 1;
      if (fits(y, m, r.dayOfMonth) && (i > 0 || r.dayOfMonth >= td)) return isoDay(new Date(Date.UTC(y, m - 1, r.dayOfMonth)));
    }
    return null;
  }
  if (r.pattern === 'yearly' && r.month && r.dayOfMonth) {
    // Up to 8 years ahead so Feb 29 finds the next leap year.
    for (let y = ty; y <= ty + 8; y++) {
      if (!fits(y, r.month, r.dayOfMonth)) continue;
      const iso = isoDay(new Date(Date.UTC(y, r.month - 1, r.dayOfMonth)));
      if (iso >= today) return iso;
    }
  }
  return null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Year, month (1-12), day and weekday (0 = Sunday) of `date`, read in `timeZone` when given, else the server's zone. */
function calendarParts(date: Date, timeZone?: string) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
      }).formatToParts(date);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
      return {
        year: Number(get('year')),
        month: Number(get('month')),
        day: Number(get('day')),
        dayOfWeek: WEEKDAYS.indexOf(get('weekday')),
      };
    } catch {
      // Unknown zone: fall through to the server's zone.
    }
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), dayOfWeek: date.getDay() };
}

/** Days in a month (1-12); February counts 29 so a leap-day holiday can be saved. */
const daysInMonth = (month: number) => (month === 2 ? 29 : new Date(Date.UTC(2001, month, 0)).getUTCDate());

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

export const HOLIDAY_NAME_MAX = 100;

export type HolidayInput = Omit<Holiday, 'id'>;

/**
 * Checks a holiday from a request body and returns only the fields its type uses,
 * so switching a holiday from recurring to a single date (or between patterns) drops the old fields.
 */
export function parseHolidayInput(body: Record<string, unknown>, now: Date = new Date()):
  { ok: true; value: HolidayInput } | { ok: false; error: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { ok: false, error: 'Name and type are required' };
  if (name.length > HOLIDAY_NAME_MAX) return { ok: false, error: `Name must be ${HOLIDAY_NAME_MAX} characters or fewer` };

  const isBusinessClosed = body.isBusinessClosed === undefined ? true : body.isBusinessClosed === true;

  if (body.type === 'single') {
    const date = typeof body.date === 'string' ? body.date : '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!date) return { ok: false, error: 'Date is required for single date holidays' };
    const valid = m && (() => {
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
      return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
    })();
    if (!valid) return { ok: false, error: 'Date must be a real day in YYYY-MM-DD form' };
    return { ok: true, value: { name, type: 'single', date, isBusinessClosed } };
  }

  if (body.type !== 'recurring') return { ok: false, error: 'Name and type are required' };

  const r = (body.recurring && typeof body.recurring === 'object' ? body.recurring : {}) as Record<string, unknown>;
  if (r.pattern === 'yearly') {
    if (!isInt(r.month, 1, 12) || !isInt(r.dayOfMonth, 1, 31)) {
      return { ok: false, error: 'Month and day of month are required for yearly recurring holidays' };
    }
    if (r.dayOfMonth > daysInMonth(r.month)) return { ok: false, error: 'That month does not have that many days' };
    const date = `${now.getFullYear()}-${String(r.month).padStart(2, '0')}-${String(r.dayOfMonth).padStart(2, '0')}`;
    return { ok: true, value: { name, type: 'recurring', date, recurring: { pattern: 'yearly', month: r.month, dayOfMonth: r.dayOfMonth }, isBusinessClosed } };
  }
  if (r.pattern === 'monthly') {
    if (!isInt(r.dayOfMonth, 1, 31)) return { ok: false, error: 'Day of month is required for monthly recurring holidays' };
    return { ok: true, value: { name, type: 'recurring', date: '', recurring: { pattern: 'monthly', dayOfMonth: r.dayOfMonth }, isBusinessClosed } };
  }
  if (r.pattern === 'weekly') {
    if (!isInt(r.dayOfWeek, 0, 6)) return { ok: false, error: 'Day of week is required for weekly recurring holidays' };
    return { ok: true, value: { name, type: 'recurring', date: '', recurring: { pattern: 'weekly', dayOfWeek: r.dayOfWeek }, isBusinessClosed } };
  }
  return { ok: false, error: 'Recurring pattern is required for recurring holidays' };
}
