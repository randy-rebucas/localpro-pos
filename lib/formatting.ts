import { ITenantSettings } from '@/models/Tenant';

/**
 * Format date based on tenant settings
 */
export function formatDate(date: Date | string, settings: ITenantSettings): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) {
    return '';
  }

  const format = settings.dateFormat || 'MM/DD/YYYY';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  switch (format) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MM/DD/YYYY':
    default:
      return `${month}/${day}/${year}`;
  }
}

/**
 * Format time based on tenant settings
 */
export function formatTime(date: Date | string, settings: ITenantSettings): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) {
    return '';
  }

  const format = settings.timeFormat || '12h';
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');

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

