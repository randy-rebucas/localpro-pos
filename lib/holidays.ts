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
 */
export function getClosedHolidayForDate(holidays: Holiday[] | undefined, date: Date): Holiday | null {
  if (!holidays?.length) return null;

  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();
  const dayOfWeek = date.getDay(); // 0-6, Sunday = 0
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
