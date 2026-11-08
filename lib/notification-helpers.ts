/**
 * Attendance notification helpers shared by the admin notifications page.
 */

export interface Notification {
  type: 'missing_clock_out' | 'late_arrival';
  userId: string;
  userName: string;
  userEmail?: string | null;
  attendanceId: string;
  clockInTime: string;
  hoursSinceClockIn?: string;
  minutesLate?: number;
  expectedTime?: string;
  message: string;
}

/**
 * Get count of notifications with email addresses
 */
export function getNotificationsWithEmailCount(notifications: Pick<Notification, 'userEmail'>[]): number {
  return notifications.filter((n) => n.userEmail).length;
}

type Dict = { admin?: Record<string, string | undefined> } | null | undefined;

/**
 * Format notification type display text
 */
export function formatNotificationType(type: Notification['type'], dict: Dict): string {
  if (type === 'missing_clock_out') {
    return dict?.admin?.missingClockOut || 'Missing Clock Out';
  }
  return dict?.admin?.lateArrival || 'Late Arrival';
}
