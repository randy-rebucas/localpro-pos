import { AttendanceRecord } from '@/hooks/useAttendance';

interface User {
  _id: string;
  name: string;
  email: string;
}

/**
 * Get user name from attendance record or user lookup
 */
export function getUserName(
  attendance: AttendanceRecord,
  users: User[]
): string {
  if (typeof attendance.userId === 'object') {
    return attendance.userId.name;
  }
  return users.find((u) => u._id === attendance.userId)?.name || 'Unknown';
}

/**
 * Build export data from attendance records
 */
export function buildExportData(
  attendances: AttendanceRecord[],
  users: User[]
): Record<string, string | number>[] {
  return attendances.map((attendance) => {
    const userName = getUserName(attendance, users);
    const clockIn = new Date(attendance.clockIn);
    const clockOut = attendance.clockOut ? new Date(attendance.clockOut) : null;
    const breakStart = attendance.breakStart ? new Date(attendance.breakStart) : null;
    const breakEnd = attendance.breakEnd ? new Date(attendance.breakEnd) : null;

    return {
      Employee: userName,
      'Clock In': clockIn.toLocaleString(),
      'Clock Out': clockOut ? clockOut.toLocaleString() : 'Active',
      'Break Start': breakStart ? breakStart.toLocaleTimeString() : '',
      'Break End': breakEnd ? breakEnd.toLocaleTimeString() : '',
      'Total Hours': formatHours(attendance.totalHours),
      Notes: attendance.notes || '',
      Date: clockIn.toLocaleDateString(),
    };
  });
}

/**
 * Format decimal hours to readable string
 */
export function formatHours(hours?: number): string {
  if (!hours) return '-';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

/**
 * Calculate sum of total hours from attendance records
 */
export function calculateTotalHours(attendances: AttendanceRecord[]): number {
  return attendances.reduce((total, att) => total + (att.totalHours || 0), 0);
}

/**
 * Calculate average hours per record
 */
export function calculateAverageHours(
  attendances: AttendanceRecord[]
): number {
  if (attendances.length === 0) return 0;
  return calculateTotalHours(attendances) / attendances.length;
}
