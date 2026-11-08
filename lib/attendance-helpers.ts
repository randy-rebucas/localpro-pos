import type { ITenantSettings } from '@/types/tenant';
import { formatDate, formatDateTime, formatTime } from '@/lib/formatting';
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

/** Column headings for an export, in the page's language. */
export const EXPORT_LABELS = {
  employee: 'Employee',
  clockIn: 'Clock In',
  clockOut: 'Clock Out',
  breakStart: 'Break Start',
  breakEnd: 'Break End',
  totalHours: 'Total Hours',
  notes: 'Notes',
  date: 'Date',
  active: 'Active',
};

export type ExportLabels = typeof EXPORT_LABELS;

/** The headings in export order (everything but the word for a still-open shift). */
export function exportHeaders(labels: ExportLabels = EXPORT_LABELS): string[] {
  return [labels.employee, labels.clockIn, labels.clockOut, labels.breakStart, labels.breakEnd, labels.totalHours, labels.notes, labels.date];
}

/**
 * Build export data from attendance records, keyed by `labels` so the file's headings
 * match the page's language.
 */
export function buildExportData(
  attendances: AttendanceRecord[],
  users: User[],
  settings: ITenantSettings,
  labels: ExportLabels = EXPORT_LABELS
): Record<string, string | number>[] {
  return attendances.map((attendance) => {
    const userName = getUserName(attendance, users);
    const clockIn = new Date(attendance.clockIn);
    const clockOut = attendance.clockOut ? new Date(attendance.clockOut) : null;
    const breakStart = attendance.breakStart ? new Date(attendance.breakStart) : null;
    const breakEnd = attendance.breakEnd ? new Date(attendance.breakEnd) : null;

    return {
      [labels.employee]: userName,
      [labels.clockIn]: formatDateTime(clockIn, settings),
      [labels.clockOut]: clockOut ? formatDateTime(clockOut, settings) : labels.active,
      [labels.breakStart]: breakStart ? formatTime(breakStart, settings) : '',
      [labels.breakEnd]: breakEnd ? formatTime(breakEnd, settings) : '',
      [labels.totalHours]: formatHours(attendance.totalHours),
      [labels.notes]: attendance.notes || '',
      [labels.date]: formatDate(clockIn, settings),
    };
  });
}

/** Average hours over finished shifts only; an open shift has no total yet. */
export function calculateAverageFinishedHours(attendances: AttendanceRecord[]): number {
  const finished = attendances.filter((a) => a.clockOut && a.totalHours);
  if (finished.length === 0) return 0;
  return calculateTotalHours(finished) / finished.length;
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

