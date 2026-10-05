'use client';

import React, { useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import dynamic from 'next/dynamic';
import { useAttendance } from '@/hooks/useAttendance';
import { useAttendanceFilters } from '@/hooks/useAttendanceFilters';
import { useCurrentSessions } from '@/hooks/useCurrentSessions';
import { getUserName, buildExportData, formatHours, calculateTotalHours, calculateAverageHours } from '@/lib/attendance-helpers';
import { usePermissions } from '@/hooks/usePermissions';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import toast from 'react-hot-toast';

// Dynamically import charts to avoid SSR issues
const AttendanceTrendsCharts = dynamic(() => import('@/components/AttendanceTrendsCharts'), {
  ssr: false,
  loading: () => (
    <div className="h-64 flex items-center justify-center bg-white border border-gray-300">
      <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
    </div>
  ),
});

interface User {
  _id: string;
  name: string;
  email: string;
}

type ExportFormat = 'csv' | 'excel' | 'pdf';

const EXPORT_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'csv', label: 'CSV' },
  { format: 'excel', label: 'Excel' },
  { format: 'pdf', label: 'PDF' },
];

const timeOnly = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

export default function AttendancePage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = React.useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [users, setUsers] = React.useState<User[]>([]);
  const [usersLoading, setUsersLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState<ExportFormat | null>(null);

  const { attendances, loading, error, fetchAttendances } = useAttendance();
  const { selectedUserId, setSelectedUserId, startDate, setStartDate, endDate, setEndDate, initializeDateRange } = useAttendanceFilters();
  const { currentSessions, fetchCurrentSessions, calculateSessionHours } = useCurrentSessions();
  const { canAccess } = usePermissions();
  const canManage = canAccess('attendance.manage');

  // Load dictionary
  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Initialize date range on mount
  useEffect(() => {
    const { startDate, endDate } = initializeDateRange();
    setStartDate(startDate);
    setEndDate(endDate);
  }, [initializeDateRange, setStartDate, setEndDate]);

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch('/api/users', {
          credentials: 'include',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`Failed to fetch users: HTTP ${res.status}`);
        }

        const data = await res.json();
        if (data.success) {
          setUsers(data.data);
        } else {
          throw new Error(data.error || dict?.common?.failedToFetchUsers || 'Failed to fetch users');
        }
      } catch (error) {
        console.error('Error fetching users:', error);
        const errorMsg = error instanceof Error ? error.message : (dict?.admin?.failedToLoadEmployees || 'Failed to load employees');
        toast.error(errorMsg);
      } finally {
        setUsersLoading(false);
      }
    };

    fetchUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const loadAttendances = useCallback(() => {
    if (startDate && endDate) {
      // Failures surface through the hook's `error` (rendered with a Retry button).
      fetchAttendances({ userId: selectedUserId, startDate, endDate, limit: 100 });
    }
  }, [startDate, endDate, selectedUserId, fetchAttendances]);

  // Fetch attendance records when filters change
  useEffect(() => {
    loadAttendances();
  }, [loadAttendances]);

  // Fetch current sessions when users load
  useEffect(() => {
    if (users.length > 0) {
      fetchCurrentSessions(users);
    }
  }, [users, fetchCurrentSessions]);

  const handleExport = useCallback(
    async (format: ExportFormat = 'csv') => {
      const headers = [
        'Employee',
        'Clock In',
        'Clock Out',
        'Break Start',
        'Break End',
        'Total Hours',
        'Notes',
        'Date',
      ];

      const exportData = buildExportData(attendances, users);
      const baseFilename = `attendance_export_${startDate || 'all'}_to_${endDate || 'today'}`;

      setExporting(format);
      try {
        const { arrayToCSV, downloadCSV, downloadExcel, downloadPDF } = await import('@/lib/export');
        if (format === 'csv') {
          const csv = arrayToCSV(exportData, headers);
          downloadCSV(csv, `${baseFilename}.csv`);
        } else if (format === 'excel') {
          await downloadExcel(exportData, headers, baseFilename);
        } else if (format === 'pdf') {
          await downloadPDF(exportData, headers, baseFilename, dict.admin?.attendance || 'Attendance Records');
        }
        toast.success((dict?.admin?.exportedSuccessfully || 'Successfully exported as {format}').replace('{format}', format.toUpperCase()));
      } catch (error) {
        console.error('Error exporting:', error);
        const errorMsg = error instanceof Error ? error.message : (dict?.admin?.failedToExport || 'Failed to export {format}').replace('{format}', format);
        toast.error(errorMsg);
      } finally {
        setExporting(null);
      }
    },
    [attendances, users, startDate, endDate, dict]
  );

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="bg-white border border-win8-danger p-6" role="alert">
          <h2 className="text-base font-bold text-win8-danger mb-1">{dict?.admin?.accessRestricted || 'Access Restricted'}</h2>
          <p className="text-sm text-gray-700">
            {dict?.admin?.accessRestrictedAttendance || "You don't have permission to view the attendance dashboard. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  // Dates are initialized in an effect, so treat the pre-init render as loading too.
  const showLoading = loading || !startDate || !endDate;
  const hasFilters = !!selectedUserId;

  const renderRecords = () => {
    if (showLoading) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingAttendance || 'Loading attendance records…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={loadAttendances}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (attendances.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {hasFilters
            ? (dict.admin?.noAttendanceMatch || 'No attendance records match your filters.')
            : (dict.admin?.noAttendanceInRange || 'No attendance records in this date range.')}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.employee || 'Employee'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.clockIn || 'Clock In'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.clockOut || 'Clock Out'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.break || 'Break'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.admin?.totalHours || 'Total Hours'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.notes || 'Notes'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {attendances.map((attendance) => {
              const userName = getUserName(attendance, users);
              const clockIn = new Date(attendance.clockIn);
              const clockOut = attendance.clockOut ? new Date(attendance.clockOut) : null;
              const breakStart = attendance.breakStart ? new Date(attendance.breakStart) : null;
              const breakEnd = attendance.breakEnd ? new Date(attendance.breakEnd) : null;

              return (
                <tr key={attendance._id} className="hover:bg-gray-100 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{userName}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700 tabular-nums">{clockIn.toLocaleString(undefined, { hour12: true })}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700 tabular-nums">
                    {clockOut ? clockOut.toLocaleString(undefined, { hour12: true }) : (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-win8-success text-white">
                        {dict.admin?.active || 'Active'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700 tabular-nums">
                    {breakStart && breakEnd ? (
                      <span>{timeOnly(breakStart)} – {timeOnly(breakEnd)}</span>
                    ) : breakStart ? (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-win8-warning text-white">{dict.admin?.onBreak || 'On Break'}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-semibold text-gray-900">
                    {attendance.totalHours ? formatHours(attendance.totalHours) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate" title={attendance.notes || undefined}>
                    {attendance.notes || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict.admin?.attendance || 'Attendance Management'}
        description={dict.admin?.attendanceDescription || 'View and manage employee attendance records'}
        actions={
          <button
            type="button"
            onClick={() => router.push(`/${tenant}/${lang}/admin/attendance/notifications`)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4 text-win8-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="hidden sm:inline">{dict.admin?.viewNotifications || 'View Notifications'}</span>
          </button>
        }
      />

      <div className="space-y-4">
        {/* Filter bar */}
        <div className="bg-white border border-gray-300 p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label htmlFor="attendance-employee" className="block text-xs font-medium text-gray-600 mb-1">{dict.admin?.employee || 'Employee'}</label>
            <select
              id="attendance-employee"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              disabled={usersLoading}
              className="px-3 py-2 text-sm border border-gray-300 bg-white w-48 disabled:opacity-50"
            >
              <option value="">{dict.common?.all || 'All Employees'}</option>
              {users.map((user) => (
                <option key={user._id} value={user._id}>{user.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="attendance-start" className="block text-xs font-medium text-gray-600 mb-1">{dict.reports?.startDate || 'Start Date'}</label>
            <input
              id="attendance-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 bg-white"
            />
          </div>
          <div>
            <label htmlFor="attendance-end" className="block text-xs font-medium text-gray-600 mb-1">{dict.reports?.endDate || 'End Date'}</label>
            <input
              id="attendance-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 bg-white"
            />
          </div>
          <div className="ml-auto">
            <p className="text-xs font-medium text-gray-600 mb-1">{dict.admin?.exportSectionTitle || 'Export'}</p>
            <div className="flex gap-1.5">
              {EXPORT_FORMATS.map(({ format, label }) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => handleExport(format)}
                  disabled={exporting !== null || showLoading || attendances.length === 0}
                  className="px-3 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors"
                >
                  {exporting === format ? (dict.admin?.exporting || 'Exporting…') : label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Currently clocked in */}
        {currentSessions.length > 0 && (
          <section className="bg-white border border-gray-300">
            <div className="px-5 py-3 border-b border-gray-300 flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 bg-win8-success" aria-hidden="true" />
              <h2 className="text-sm font-bold text-gray-900">
                {dict.admin?.currentlyClockedIn || 'Clocked In'}
              </h2>
              <span className="text-xs font-semibold px-1.5 py-0.5 bg-win8-success text-white tabular-nums">{currentSessions.length}</span>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {currentSessions.map((session) => {
                const userName = typeof session.userId === 'object' ? session.userId.name : getUserName(session, users);
                const hours = calculateSessionHours(session.clockIn);
                return (
                  <div key={session._id} className="border border-gray-300 px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate" title={userName}>{userName}</p>
                      <p className="text-xs text-gray-500 tabular-nums">{timeOnly(new Date(session.clockIn))}</p>
                    </div>
                    <span className="text-sm font-bold text-win8-success tabular-nums shrink-0">{hours.toFixed(1)}h</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-300 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{dict.admin?.totalRecords || 'Total Records'}</p>
            <p className="text-3xl font-bold tabular-nums text-gray-900 mt-1.5">{showLoading ? '—' : attendances.length.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-gray-300 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{dict.admin?.totalHours || 'Total Hours'}</p>
            <p className="text-3xl font-bold tabular-nums text-brand mt-1.5">
              {showLoading || attendances.length === 0 ? '—' : formatHours(calculateTotalHours(attendances))}
            </p>
          </div>
          <div className="bg-white border border-gray-300 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{dict.admin?.averageHours || 'Avg Hours/Record'}</p>
            <p className="text-3xl font-bold tabular-nums text-gray-900 mt-1.5">
              {showLoading || attendances.length === 0 ? '—' : formatHours(calculateAverageHours(attendances))}
            </p>
          </div>
        </div>

        {/* Trends charts */}
        {!showLoading && !error && attendances.length > 0 && (
          <AttendanceTrendsCharts attendances={attendances} dict={dict} />
        )}

        {/* Records */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-900">{dict.admin?.attendanceRecords || 'Attendance Records'}</h2>
            {!showLoading && !error && (
              <span className="text-xs text-gray-500 tabular-nums">
                {(dict.admin?.recordsCount || '{count} records').replace('{count}', attendances.length.toLocaleString())}
              </span>
            )}
          </div>
          {renderRecords()}
        </div>
      </div>
    </div>
  );
}
