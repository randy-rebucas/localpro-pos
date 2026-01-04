/**
 * Business Hours Management
 * Handles business hours, special hours, and holiday checking
 */

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

/**
 * Check if business is open at a given date/time
 */
export function isBusinessOpen(
  date: Date,
  businessHours?: BusinessHours,
  holidays?: Holiday[]
): { isOpen: boolean; reason?: string; nextOpen?: Date } {
  // Check if it's a holiday and business is closed
  if (holidays) {
    const holiday = getHolidayForDate(date, holidays);
    if (holiday && holiday.isBusinessClosed) {
      return {
        isOpen: false,
        reason: `Closed for ${holiday.name}`,
      };
    }
  }

  // Check special hours first
  if (businessHours?.specialHours) {
    const dateStr = formatDateString(date);
    const specialHour = businessHours.specialHours.find((sh) => sh.date === dateStr);
    if (specialHour) {
      if (!specialHour.enabled) {
        return {
          isOpen: false,
          reason: specialHour.note || 'Closed (special hours)',
        };
      }
      if (specialHour.openTime && specialHour.closeTime) {
        return checkTimeRange(date, specialHour.openTime, specialHour.closeTime);
      }
    }
  }

  // Check regular schedule
  if (businessHours?.schedule) {
    const dayName = DAYS_OF_WEEK[date.getDay()];
    const daySchedule = businessHours.schedule[dayName];
    
    if (!daySchedule || !daySchedule.enabled) {
      return {
        isOpen: false,
        reason: `Closed on ${dayName}`,
      };
    }

    if (daySchedule.openTime && daySchedule.closeTime) {
      const timeCheck = checkTimeRange(date, daySchedule.openTime, daySchedule.closeTime);
      
      // Check breaks
      if (timeCheck.isOpen && daySchedule.breaks) {
        for (const breakTime of daySchedule.breaks) {
          const breakCheck = checkTimeRange(date, breakTime.start, breakTime.end);
          if (!breakCheck.isOpen) {
            return {
              isOpen: false,
              reason: 'Closed for break',
            };
          }
        }
      }

      return timeCheck;
    }
  }

  // Default: assume open if no schedule is set
  return { isOpen: true };
}

/**
 * Check if time falls within a range
 */
function checkTimeRange(date: Date, openTime: string, closeTime: string): { isOpen: boolean; nextOpen?: Date } {
  const [openHour, openMinute] = openTime.split(':').map(Number);
  const [closeHour, closeMinute] = closeTime.split(':').map(Number);

  const currentHour = date.getHours();
  const currentMinute = date.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;
  const openTimeMinutes = openHour * 60 + openMinute;
  const closeTimeMinutes = closeHour * 60 + closeMinute;

  // Handle overnight hours (e.g., 22:00 - 02:00)
  if (closeTimeMinutes < openTimeMinutes) {
    const isOpen = currentTime >= openTimeMinutes || currentTime < closeTimeMinutes;
    if (!isOpen) {
      // Next open is today if we're before close, otherwise tomorrow
      const nextOpen = new Date(date);
      if (currentTime < openTimeMinutes) {
        nextOpen.setHours(openHour, openMinute, 0, 0);
      } else {
        nextOpen.setDate(nextOpen.getDate() + 1);
        nextOpen.setHours(openHour, openMinute, 0, 0);
      }
      return { isOpen: false, nextOpen };
    }
    return { isOpen: true };
  }

  // Normal hours
  const isOpen = currentTime >= openTimeMinutes && currentTime < closeTimeMinutes;
  if (!isOpen) {
    const nextOpen = new Date(date);
    if (currentTime < openTimeMinutes) {
      nextOpen.setHours(openHour, openMinute, 0, 0);
    } else {
      nextOpen.setDate(nextOpen.getDate() + 1);
      nextOpen.setHours(openHour, openMinute, 0, 0);
    }
    return { isOpen: false, nextOpen };
  }

  return { isOpen: true };
}

/**
 * Get holiday for a specific date
 */
export function getHolidayForDate(date: Date, holidays: Holiday[]): Holiday | null {
  const dateStr = formatDateString(date);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = date.getDay();

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
 * Format date as YYYY-MM-DD
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get next business open time
 */
export function getNextOpenTime(
  fromDate: Date,
  businessHours?: BusinessHours,
  holidays?: Holiday[]
): Date | null {
  const checkDate = new Date(fromDate);
  let attempts = 0;
  const maxAttempts = 365; // Prevent infinite loop

  while (attempts < maxAttempts) {
    const status = isBusinessOpen(checkDate, businessHours, holidays);
    
    if (status.isOpen) {
      return checkDate;
    }

    if (status.nextOpen) {
      return status.nextOpen;
    }

    // Move to next day and check opening time
    checkDate.setDate(checkDate.getDate() + 1);
    checkDate.setHours(0, 0, 0, 0);
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

  return businessHours.schedule[dayName.toLowerCase()] || null;
}
