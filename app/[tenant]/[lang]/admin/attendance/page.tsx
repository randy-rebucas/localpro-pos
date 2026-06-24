'use client';

import React, { useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import dynamic from 'next/dynamic';
import { useAttendance } from '@/hooks/useAttendance';
import { useAttendanceFilters } from '@/hooks/useAttendanceFilters';
import { useCurrentSessions } from '@/hooks/useCurrentSessions';
import { getUserName, buildExportData, formatHours, calculateTotalHours, calculateAverageHours } from '@/lib/attendance-helpers';
import toast from 'react-hot-toast';

// Dynamically import charts to avoid SSR issues
const AttendanceTrendsCharts = dynamic(() => import('@/components/AttendanceTrendsCharts'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-64 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
        <p className="mt-4 text-gray-600">Loading chart...</p>
      </div>
    </div>
  ),
});

interface User {
  _id: string;
  name: string;
  email: string;
}

export default function AttendancePage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = React.useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [users, setUsers] = React.useState<User[]>([]);
  const [usersLoading, setUsersLoading] = React.useState(true);
  const [message, setMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { attendances, loading, fetchAttendances } = useAttendance();
  const { selectedUserId, setSelectedUserId, startDate, setStartDate, endDate, setEndDate, initializeDateRange } = useAttendanceFilters();
  const { currentSessions, fetchCurrentSessions, calculateSessionHours } = useCurrentSessions();

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
          throw new Error(data.error || 'Failed to fetch users');
        }
      } catch (error) {
        console.error('Error fetching users:', error);
        const errorMsg = error instanceof Error ? error.message : 'Failed to load employees';
        setMessage({ type: 'error', text: errorMsg });
      } finally {
        setUsersLoading(false);
      }
    };

    fetchUsers();
  }, [tenant]);

  // Fetch attendance records when filters change
  useEffect(() => {
    if (startDate && endDate) {
      fetchAttendances(
        {
          userId: selectedUserId,
          startDate,
          endDate,
          limit: 100,
        },
        (error) => {
          setMessage({ type: 'error', text: error });
        }
      );
    }
  }, [startDate, endDate, selectedUserId, fetchAttendances]);

  // Fetch current sessions when users load
  useEffect(() => {
    if (users.length > 0) {
      fetchCurrentSessions(users);
    }
  }, [users, fetchCurrentSessions]);

  const handleExport = useCallback(
    async (format: 'csv' | 'excel' | 'pdf' = 'csv') => {
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
        toast.success(`Successfully exported as ${format.toUpperCase()}`);
      } catch (error) {
        console.error('Error exporting:', error);
        const errorMsg = error instanceof Error ? error.message : `Failed to export ${format}`;
        toast.error(errorMsg);
      }
    },
    [attendances, users, startDate, endDate, dict]
  );

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {dict.admin?.attendance || 'Attendance Management'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{dict.admin?.attendanceDescription || 'View and manage employee attendance records'}</p>
        </div>
        <button
          onClick={() => router.push(`/${tenant}/${lang}/admin/attendance/notifications`)}
          className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {dict.admin?.viewNotifications || 'View Notifications'}
        </button>
      </div>

      {/* Alert message */}
      {message && (
        <div className={`mb-6 p-4 border text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
          {message.text}
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">

        {/* Left — Filters sidebar */}
        <aside className="w-56 shrink-0 sticky top-6 space-y-4">
          <div className="bg-white border border-gray-300 p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Filters</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{dict.admin?.employee || 'Employee'}</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  disabled={usersLoading}
                  className="w-full px-3 py-2 text-sm border border-gray-300 bg-white disabled:opacity-50"
                >
                  <option value="">{dict.common?.all || 'All Employees'}</option>
                  {users.map((user) => (
                    <option key={user._id} value={user._id}>{user.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{dict.reports?.startDate || 'Start Date'}</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{dict.reports?.endDate || 'End Date'}</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Export */}
          <div className="bg-white border border-gray-300 p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Export</h2>
            <div className="space-y-2">
              <button onClick={() => handleExport('csv')} className="w-full px-3 py-2 text-sm text-left border border-gray-300 bg-white hover:bg-gray-50 transition-colors">
                CSV
              </button>
              <button onClick={() => handleExport('excel')} className="w-full px-3 py-2 text-sm text-left border border-gray-300 bg-white hover:bg-gray-50 transition-colors">
                Excel
              </button>
              <button onClick={() => handleExport('pdf')} className="w-full px-3 py-2 text-sm text-left border border-gray-300 bg-white hover:bg-gray-50 transition-colors">
                PDF
              </button>
            </div>
          </div>

          {/* Currently clocked in */}
          {currentSessions.length > 0 && (
            <div className="bg-teal-50 border border-teal-300 p-4">
              <h2 className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-3">
                {dict.admin?.currentlyClockedIn || 'Clocked In'} · {currentSessions.length}
              </h2>
              <div className="space-y-2">
                {currentSessions.map((session) => {
                  const userName = typeof session.userId === 'object' ? session.userId.name : getUserName(session, users);
                  const clockInTime = new Date(session.clockIn);
                  const hours = calculateSessionHours(session.clockIn);
                  return (
                    <div key={session._id} className="bg-white border border-teal-200 px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
                        <p className="text-xs text-gray-500">{clockInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <span className="text-sm font-bold text-teal-700 flex-shrink-0">{hours.toFixed(1)}h</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* Right — Main content */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-gray-300 px-5 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{dict.admin?.totalRecords || 'Total Records'}</p>
              <p className="text-2xl font-bold text-gray-900">{attendances.length}</p>
            </div>
            <div className="bg-white border border-gray-300 px-5 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{dict.admin?.totalHours || 'Total Hours'}</p>
              <p className="text-2xl font-bold text-gray-900">{formatHours(calculateTotalHours(attendances))}</p>
            </div>
            <div className="bg-white border border-gray-300 px-5 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{dict.admin?.averageHours || 'Avg Hours/Record'}</p>
              <p className="text-2xl font-bold text-gray-900">
                {attendances.length > 0 ? formatHours(calculateAverageHours(attendances)) : '—'}
              </p>
            </div>
          </div>

          {/* Trends chart */}
          {attendances.length > 0 && (
            <div className="bg-white border border-gray-300 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                {dict.admin?.attendanceTrends || 'Attendance Trends'}
              </h2>
              <AttendanceTrendsCharts attendances={attendances} dict={dict} />
            </div>
          )}

          {/* Attendance table */}
          <div className="bg-white border border-gray-300">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{dict.admin?.attendanceRecords || 'Attendance Records'}</h2>
              <span className="text-xs text-gray-400">{attendances.length} records</span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="inline-block animate-spin h-7 w-7 border-b-2 border-brand"></div>
                  <p className="mt-3 text-sm text-gray-500">{dict.common?.loading || 'Loading...'}</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.employee || 'Employee'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.clockIn || 'Clock In'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.clockOut || 'Clock Out'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.break || 'Break'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.totalHours || 'Total Hours'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.notes || 'Notes'}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {attendances.map((attendance) => {
                      const userName = getUserName(attendance, users);
                      const clockIn = new Date(attendance.clockIn);
                      const clockOut = attendance.clockOut ? new Date(attendance.clockOut) : null;
                      const breakStart = attendance.breakStart ? new Date(attendance.breakStart) : null;
                      const breakEnd = attendance.breakEnd ? new Date(attendance.breakEnd) : null;

                      return (
                        <tr key={attendance._id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{userName}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{clockIn.toLocaleString()}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {clockOut ? clockOut.toLocaleString() : (
                              <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                {dict.admin?.active || 'Active'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {breakStart && breakEnd ? (
                              <span>{breakStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {breakEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            ) : breakStart ? (
                              <span className="text-yellow-600 font-medium">{dict.admin?.onBreak || 'On Break'}</span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">{formatHours(attendance.totalHours)}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 max-w-[180px] truncate" title={attendance.notes || undefined}>
                            {attendance.notes || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {attendances.length === 0 && (
                  <div className="text-center py-12 text-sm text-gray-400">
                    {dict.common?.noData || 'No attendance records found'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
