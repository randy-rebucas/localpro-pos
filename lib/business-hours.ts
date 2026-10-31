/**
 * Business Hours Management
 * Handles business hours, special hours, and holiday checking.
 *
 * All calendar/clock checks are evaluated in the business's timezone, never
 * the server's (Vercel runs UTC). Timezone resolution order: explicit `tz`
 * argument (callers should pass getTenantTimezone(tenant.settings)), then
 * `businessHours.timezone`, then the default (Asia/Manila).
 */

import {
  addDaysToYmd,
  getTenantDayBoundaries,
  getTenantLocalParts,
  getTenantTimezone,
  tenantLocalTimeToUtc,
} from '@/lib/timezone';

export interface BusinessHours {
  timezone?: string;
  schedule?: {
    [key: string]: {
      enabled: boolean;
      openTime?: string; // HH:MM format
      closeTime?: string; // HH:MM format
      breaks?: Array<{
        start: string; // HH:MM
        end: string; // HH:MM
      }>;
    };
  };
  specialHours?: Array<{
    date: string; // YYYY-MM-DD
    enabled: boolean;
    openTime?: string;
    closeTime?: string;
    note?: string;
  }>;
}

export interface Holiday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD or pattern for recurring
  type: 'single' | 'recurring';
  recurring?: {
    pattern: 'yearly' | 'monthly' | 'weekly';
    dayOfMonth?: number;
    dayOfWeek?: number; // 0-6, Sunday = 0
    month?: number; // 1-12
  };
  isBusinessClosed: boolean;
}

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function resolveTimezone(businessHours?: BusinessHours, tz?: string): string {
  return getTenantTimezone({ timezone: tz || businessHours?.timezone });
}

type DaySchedule = NonNullable<BusinessHours['schedule']>[string];

/** Schedule entry for a weekday; supports plain objects (lean) and Mongoose Maps. */
function getScheduleEntry(businessHours: BusinessHours | undefined, dayName: string): DaySchedule | undefined {
  const schedule = businessHours?.schedule as unknown;
  if (!schedule) return undefined;
  if (schedule instanceof Map) return schedule.get(dayName);
  return (schedule as Record<string, DaySchedule>)[dayName];
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export interface EffectiveDayHours {
  /** Local calendar date 'YYYY-MM-DD' in the business timezone */
  ymd: string;
  /** Lower-case weekday name of that local date */
  dayName: string;
  /** false when closed all day (holiday, special closure or disabled weekday) */
  enabled: boolean;
  openTime?: string;
  closeTime?: string;
  breaks?: Array<{ start: string; end: string }>;
  reason?: string;
  /** Where the hours came from; 'none' means nothing is configured */
  source: 'holiday' | 'special' | 'schedule' | 'none';
}

/**
 * The hours that apply on the local calendar day containing `date`
 * (holidays first, then special hours, then the weekly schedule).
 */
export function getEffectiveHoursForDate(
  date: Date,
  businessHours?: BusinessHours,
  holidays?: Holiday[],
  tz?: string
): EffectiveDayHours {
  const zone = resolveTimezone(businessHours, tz);
  const local = getTenantLocalParts(date, zone);
  const dayName = DAYS_OF_WEEK[local.weekday];
  const base = { ymd: local.ymd, dayName };

  if (holidays) {
    const holiday = getHolidayForDate(date, holidays, zone);
    if (holiday && holiday.isBusinessClosed) {
      return { ...base, enabled: false, reason: `Closed for ${holiday.name}`, source: 'holiday' };
    }
  }

  const specialHour = businessHours?.specialHours?.find((sh) => sh.date === local.ymd);
  if (specialHour) {
    if (!specialHour.enabled) {
      return { ...base, enabled: false, reason: specialHour.note || 'Closed (special hours)', source: 'special' };
    }
    if (specialHour.openTime && specialHour.closeTime) {
      return { ...base, enabled: true, openTime: specialHour.openTime, closeTime: specialHour.closeTime, source: 'special' };
    }
  }

  if (businessHours?.schedule) {
    const daySchedule = getScheduleEntry(businessHours, dayName);
    if (!daySchedule || !daySchedule.enabled) {
      return { ...base, enabled: false, reason: `Closed on ${dayName}`, source: 'schedule' };
    }
    return {
      ...base,
      enabled: true,
      openTime: daySchedule.openTime,
      closeTime: daySchedule.closeTime,
      breaks: daySchedule.breaks,
      source: 'schedule',
    };
  }

  return { ...base, enabled: true, source: 'none' };
}

/**
 * Check if business is open at a given date/time (evaluated in the business timezone)
 */
export function isBusinessOpen(
  date: Date,
  businessHours?: BusinessHours,
  holidays?: Holiday[],
  tz?: string
): { isOpen: boolean; reason?: string; nextOpen?: Date } {
  const zone = resolveTimezone(businessHours, tz);
  const hours = getEffectiveHoursForDate(date, businessHours, holidays, zone);

  if (!hours.enabled) {
    return { isOpen: false, reason: hours.reason };
  }

  if (hours.openTime && hours.closeTime) {
    const timeCheck = checkTimeRange(date, hours.openTime, hours.closeTime, zone);

    // Inside a break range means closed
    if (timeCheck.isOpen && hours.breaks) {
      for (const breakTime of hours.breaks) {
        if (checkTimeRange(date, breakTime.start, breakTime.end, zone).isOpen) {
          return {
            isOpen: false,
            reason: 'Closed for break',
          };
        }
      }
    }

    return timeCheck;
  }

  // Default: assume open if no schedule is set
  return { isOpen: true };
}

/**
 * Check if the local time of `date` (in `tz`) falls within [openTime, closeTime)
 */
function checkTimeRange(
  date: Date,
  openTime: string,
  closeTime: string,
  tz: string
): { isOpen: boolean; nextOpen?: Date } {
  const local = getTenantLocalParts(date, tz);
  const currentTime = local.hour * 60 + local.minute;
  const openTimeMinutes = toMinutes(openTime);
  const closeTimeMinutes = toMinutes(closeTime);

  // Handle overnight hours (e.g., 22:00 - 02:00)
  const isOpen = closeTimeMinutes < openTimeMinutes
    ? currentTime >= openTimeMinutes || currentTime < closeTimeMinutes
    : currentTime >= openTimeMinutes && currentTime < closeTimeMinutes;

  if (isOpen) return { isOpen: true };

  // Next opening: today at openTime if still ahead, otherwise tomorrow (local wall clock)
  const nextOpen = currentTime < openTimeMinutes
    ? tenantLocalTimeToUtc(local.ymd, openTime, tz)
    : tenantLocalTimeToUtc(addDaysToYmd(local.ymd, 1), openTime, tz);
  return { isOpen: false, nextOpen };
}

/**
 * Get holiday for a specific date (the local calendar day of `date` in `tz`)
 */
export function getHolidayForDate(date: Date, holidays: Holiday[], tz?: string): Holiday | null {
  const local = getTenantLocalParts(date, getTenantTimezone({ timezone: tz }));
  const dateStr = local.ymd;
  const month = local.month;
  const day = local.day;
  const dayOfWeek = local.weekday;

  for (const holiday of holidays) {
    if (holiday.type === 'single') {
      if (holiday.date === dateStr) {
        return holiday;
      }
    } else if (holiday.type === 'recurring' && holiday.recurring) {
      const { pattern, dayOfMonth, dayOfWeek: dow, month: holidayMonth } = holiday.recurring;

      if (pattern === 'yearly') {
        if (holidayMonth && dayOfMonth) {
          if (month === holidayMonth && day === dayOfMonth) {
            return holiday;
          }
        } else if (dow !== undefined) {
          // Recurring yearly on specific day of week (e.g., Thanksgiving)
          // This is simplified - you might need more complex logic
          if (dayOfWeek === dow) {
            return holiday;
          }
        }
      } else if (pattern === 'monthly' && dayOfMonth) {
        if (day === dayOfMonth) {
          return holiday;
        }
      } else if (pattern === 'weekly' && dow !== undefined) {
        if (dayOfWeek === dow) {
          return holiday;
        }
      }
    }
  }

  return null;
}

/**
 * Get next business open time
 */
export function getNextOpenTime(
  fromDate: Date,
  businessHours?: BusinessHours,
  holidays?: Holiday[],
  tz?: string
): Date | null {
  const zone = resolveTimezone(businessHours, tz);
  let checkDate = new Date(fromDate);
  let attempts = 0;
  const maxAttempts = 365; // Prevent infinite loop

  while (attempts < maxAttempts) {
    const status = isBusinessOpen(checkDate, businessHours, holidays, zone);

    if (status.isOpen) {
      return checkDate;
    }

    if (status.nextOpen) {
      return status.nextOpen;
    }

    // Move to the start of the next local day and check again
    const ymd = getTenantLocalParts(checkDate, zone).ymd;
    checkDate = getTenantDayBoundaries(addDaysToYmd(ymd, 1), zone).start;
    attempts++;
  }

  return null;
}

/**
 * Get business hours for a specific day
 */
export function getBusinessHoursForDay(
  dayName: string,
  businessHours?: BusinessHours
): { enabled: boolean; openTime?: string; closeTime?: string; breaks?: Array<{ start: string; end: string }> } | null {
  if (!businessHours?.schedule) {
    return null;
  }

  return getScheduleEntry(businessHours, dayName.toLowerCase()) || null;
}
