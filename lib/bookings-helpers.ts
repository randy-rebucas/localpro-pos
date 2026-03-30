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
      return 'bg-blue-100 text-blue-800';
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
export function getStatusLabel(status: BookingStatus, dict?: any): string {
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
export function getStaffName(staffName?: string, staffId?: { _id: string; name: string; email: string }, dict?: any): string {
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
 * Get delete confirmation message
 */
export function getDeleteBookingConfirmMessage(dict?: any): string {
  return dict?.common?.deleteBookingConfirm || 'Are you sure you want to delete this booking?';
}

/**
 * Get reminder confirmation message
 */
export function getSendReminderConfirmMessage(dict?: any): string {
  return dict?.admin?.sendReminderConfirm || 'Send a reminder to the customer?';
}

/**
 * Format duration with label
 */
export function formatDuration(duration: number, dict?: any): string {
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
