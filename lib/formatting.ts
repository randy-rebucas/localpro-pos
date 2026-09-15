import { ITenantSettings } from '@/types/tenant';

/** Extract the date/time fields of `date` as observed in `timezone`. */
function partsInTimezone(d: Date, timezone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const parts = dtf.formatToParts(d).reduce((acc: Record<string, string>, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hours: Number(parts.hour),
    minutes: Number(parts.minute),
  };
}

/**
 * Format date based on tenant settings, rendered in the tenant's configured
 * timezone (settings.timezone) rather than the browser/server's local zone.
 */
export function formatDate(date: Date | string, settings: ITenantSettings): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return '';
  }

  const format = settings.dateFormat || 'MM/DD/YYYY';
  let year: number, month: number, dayNum: number;
  try {
    ({ year, month, day: dayNum } = partsInTimezone(d, settings.timezone || 'Asia/Manila'));
  } catch {
    year = d.getFullYear();
    month = d.getMonth() + 1;
    dayNum = d.getDate();
  }
  const day = String(dayNum).padStart(2, '0');
  const monthStr = String(month).padStart(2, '0');

  switch (format) {
    case 'DD/MM/YYYY':
      return `${day}/${monthStr}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${monthStr}-${day}`;
    case 'MM/DD/YYYY':
    default:
      return `${monthStr}/${day}/${year}`;
  }
}

/**
 * Format time based on tenant settings, rendered in the tenant's configured
 * timezone (settings.timezone) rather than the browser/server's local zone.
 */
export function formatTime(date: Date | string, settings: ITenantSettings): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return '';
  }

  const format = settings.timeFormat || '12h';
  let hours: number, minutesNum: number;
  try {
    ({ hours, minutes: minutesNum } = partsInTimezone(d, settings.timezone || 'Asia/Manila'));
  } catch {
    hours = d.getHours();
    minutesNum = d.getMinutes();
  }
  const minutes = String(minutesNum).padStart(2, '0');

  if (format === '12h') {
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  } else {
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }
}

/**
 * Format date and time based on tenant settings
 */
export function formatDateTime(date: Date | string, settings: ITenantSettings): string {
  const dateStr = formatDate(date, settings);
  const timeStr = formatTime(date, settings);
  return `${dateStr} ${timeStr}`;
}

/**
 * Get formatted address string
 */
export function formatAddress(settings: ITenantSettings): string {
  const addr = settings.address;
  if (!addr) return '';

  const parts: string[] = [];
  if (addr.street) parts.push(addr.street);
  if (addr.city) parts.push(addr.city);
  if (addr.state) parts.push(addr.state);
  if (addr.zipCode) parts.push(addr.zipCode);
  if (addr.country) parts.push(addr.country);

  return parts.join(', ');
}

