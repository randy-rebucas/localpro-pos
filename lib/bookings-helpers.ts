/**
 * Booking Management Utilities
 * Status rules and labels shared by the bookings page, its calendar and the API.
 */

export interface Booking {
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
}

export const BOOKING_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no-show', label: 'No Show' },
] as const;

export type BookingStatus = typeof BOOKING_STATUSES[number]['value'];

type Dict = { admin?: Record<string, string | undefined> } | null | undefined;

/** The status in the page's language. `no-show` lives under `noShow`, since keys can't hold a dash. */
export function getStatusLabel(status: BookingStatus, dict?: Dict): string {
  const labels: Record<BookingStatus, string> = {
    pending: dict?.admin?.pending || 'Pending',
    confirmed: dict?.admin?.confirmed || 'Confirmed',
    completed: dict?.admin?.completed || 'Completed',
    cancelled: dict?.admin?.cancelled || 'Cancelled',
    'no-show': dict?.admin?.noShow || 'No Show',
  };
  return labels[status] || status;
}

/**
 * Format date and time for display
 */
export function formatBookingDateTime(dateString: string, timeZone?: string, lang: 'en' | 'es' = 'en'): string {
  const date = new Date(dateString);
  return date.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get staff display name
 */
export function getStaffName(staffName?: string, staffId?: { _id: string; name: string; email: string }, dict?: Dict): string {
  if (staffName) return staffName;
  if (staffId?.name) return staffId.name;
  return dict?.admin?.unassigned || 'Unassigned';
}

/**
 * A reminder only makes sense before the appointment has happened or been called off.
 */
export function canSendReminder(status: BookingStatus): boolean {
  return status === 'pending' || status === 'confirmed';
}

/**
 * Allowed booking status transitions. completed/cancelled/no-show are terminal —
 * once set, a booking can't be moved back into an active state (that would
 * silently re-trigger confirmation notifications for a finished/cancelled booking).
 */
const ALLOWED_BOOKING_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['pending', 'confirmed', 'cancelled', 'no-show'],
  confirmed: ['confirmed', 'completed', 'cancelled', 'no-show'],
  completed: ['completed'],
  cancelled: ['cancelled'],
  'no-show': ['no-show'],
};

export function isValidBookingStatusTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_BOOKING_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Statuses selectable from the current one (includes the current status itself).
 */
export function getAllowedNextStatuses(from: BookingStatus): BookingStatus[] {
  return ALLOWED_BOOKING_STATUS_TRANSITIONS[from] ?? [from];
}

/**
 * A terminal status (completed/cancelled/no-show) has no further transitions.
 */
export function isBookingStatusEditable(status: BookingStatus): boolean {
  return getAllowedNextStatuses(status).length > 1;
}
