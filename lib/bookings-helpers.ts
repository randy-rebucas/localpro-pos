/**
 * Booking Management Utilities
 * Helper functions for status formatting, date formatting, and UI helpers
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

/**
 * Get CSS classes for status badge
 */
export function getStatusColor(status: BookingStatus): string {
  switch (status) {
    case 'confirmed':
      return 'bg-green-100 text-green-800';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'completed':
      return 'bg-brand-soft text-brand-navy';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    case 'no-show':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Get status label text
 */
type Dict = Record<string, Record<string, string | undefined> | undefined>;

export function getStatusLabel(status: BookingStatus, dict?: Dict): string {
  const labels: Record<BookingStatus, string> = {
    pending: dict?.admin?.pending || 'Pending',
    confirmed: dict?.admin?.confirmed || 'Confirmed',
    completed: dict?.admin?.completed || 'Completed',
    cancelled: dict?.admin?.cancelled || 'Cancelled',
    'no-show': 'No Show',
  };
  return labels[status] || status;
}

/**
 * Format date and time for display
 */
export function formatBookingDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
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
 * Check if reminder can be sent
 */
export function canSendReminder(status: BookingStatus): boolean {
  return status === 'pending' || status === 'confirmed';
}

/**
 * Check if booking can be edited
 */
export function canEditBooking(status: BookingStatus): boolean {
  return status !== 'completed' && status !== 'cancelled';
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

/**
 * Get cancel confirmation message.
 * The "delete" action is actually a soft-cancel (status set to 'cancelled',
 * isActive: false) — the record and its history are preserved, not removed.
 */
export function getDeleteBookingConfirmMessage(dict?: Dict): string {
  return dict?.common?.cancelBookingConfirm || 'Are you sure you want to cancel this booking?';
}

/**
 * Get reminder confirmation message
 */
export function getSendReminderConfirmMessage(dict?: Dict): string {
  return dict?.admin?.sendReminderConfirm || 'Send a reminder to the customer?';
}

/**
 * Format duration with label
 */
export function formatDuration(duration: number, dict?: Dict): string {
  return `${duration} ${dict?.admin?.minutes || 'min'}`;
}

/**
 * Get customer display info
 */
export function getCustomerInfo(customerEmail?: string, customerPhone?: string): string[] {
  const info = [];
  if (customerEmail) info.push(customerEmail);
  if (customerPhone) info.push(customerPhone);
  return info;
}
