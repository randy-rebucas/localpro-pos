/**
 * Notification-related helper functions
 */

export interface Notification {
  type: 'missing_clock_out' | 'late_arrival';
  userId: string;
  userName: string;
  userEmail?: string;
  attendanceId: string;
  clockInTime: string;
  hoursSinceClockIn?: string;
  minutesLate?: number;
  expectedTime?: string;
  message: string;
}

export interface NotificationSummary {
  total: number;
  missingClockOut: number;
  lateArrivals: number;
}

/**
 * Get count of notifications with email addresses
 */
export function getNotificationsWithEmailCount(notifications: Notification[]): number {
  return notifications.filter((n) => n.userEmail).length;
}

/**
 * Check if there are notifications to send
 */
export function hasNotificationsToSend(notifications: Notification[]): boolean {
  return getNotificationsWithEmailCount(notifications) > 0;
}

/**
 * Format notification type display text
 */
type Dict = Record<string, Record<string, string | undefined> | undefined>;

export function formatNotificationType(type: Notification['type'], dict: Dict): string {
  if (type === 'missing_clock_out') {
    return dict.admin?.missingClockOut || 'Missing Clock Out';
  }
  return dict.admin?.lateArrival || 'Late Arrival';
}

/**
 * Get badge styling based on notification type
 */
export function getNotificationBadgeClass(type: Notification['type']): string {
  if (type === 'missing_clock_out') {
    return 'bg-red-100 text-red-800 border-red-300';
  }
  return 'bg-yellow-100 text-yellow-800 border-yellow-300';
}

/**
 * Format clock in time with timezone
 */
export function formatClockInTime(clockInTime: string): string {
  return new Date(clockInTime).toLocaleString();
}

/**
 * Confirm before sending emails
 */
export function confirmSendEmails(count: number, dict: Dict): boolean {
  const message =
    dict.admin?.confirmSendEmails?.replace('{count}', count.toString()) ||
    `Send emails to ${count} recipient(s)?`;
  return confirm(message);
}
