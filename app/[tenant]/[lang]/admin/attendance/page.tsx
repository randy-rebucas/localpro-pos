'use client';

import React, { useEffect, useCallback } from 'react';
import AdminNavBar from '@/components/AdminNavBar';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
        <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
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
      <div className="bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50">
      <AdminNavBar />
      <div className="px-6 py-5">
        <div className="mb-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">
                {dict.admin?.attendance || 'Attendance Management'}
              </h1>
              <p className="text-gray-600">{dict.admin?.attendanceDescription || 'View and manage employee attendance records'}</p>
            </div>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        {/* Current Sessions */}
        {currentSessions.length > 0 && (
          <div className="mb-6 bg-blue-50 border-2 border-blue-300 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-4">
              {dict.admin?.currentlyClockedIn || 'Currently Clocked In'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentSessions.map((session) => {
                const userName = typeof session.userId === 'object' ? session.userId.name : getUserName(session, users);
                const clockInTime = new Date(session.clockIn);
                const hours = calculateSessionHours(session.clockIn);

                return (
                  <div key={session._id} className="bg-white border border-blue-300 p-4">
                    <div className="font-semibold text-gray-900">{userName}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {dict.admin?.clockedInAt || 'Clocked in'}: {clockInTime.toLocaleString()}
                    </div>
                    <div className="text-sm font-medium text-blue-600 mt-2">
                      {dict.admin?.currentHours || 'Current hours'}: {hours.toFixed(2)}h
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Attendance Notifications */}
        <div className="bg-white border border-yellow-300 p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">{dict.admin?.attendanceNotifications || 'Attendance Notifications'}</h2>
              <p className="text-sm text-gray-600">
                {dict.admin?.attendanceNotificationsDesc || 'View alerts for late arrivals and missing clock-outs'}
              </p>
            </div>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin/attendance/notifications`)}
              className="px-4 py-2 border border-gray-300 hover:bg-gray-50 bg-white"
            >
              {dict.admin?.viewNotifications || 'View Notifications'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {dict.admin?.employee || 'Employee'}
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={usersLoading}
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
              >
                <option value="">{dict.common?.all || 'All Employees'}</option>
                {users.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {dict.reports?.startDate || 'Start Date'}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {dict.reports?.endDate || 'End Date'}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="relative group">
                <button
                  onClick={() => handleExport('csv')}
                  className="px-4 py-2 border border-gray-300 hover:bg-gray-50 bg-white font-medium"
                >
                  {dict.admin?.export || 'Export'} ▼
                </button>
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-300 shadow-lg hidden group-hover:block z-10">
                  <button
                    onClick={() => handleExport('csv')}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    {dict.admin?.exportCSV || 'Export CSV'}
                  </button>
                  <button
                    onClick={() => handleExport('excel')}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    {dict.admin?.exportExcel || 'Export Excel'}
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    {dict.admin?.exportPDF || 'Export PDF'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-gray-200 p-5">
            <div className="text-sm text-gray-600 mb-1">{dict.admin?.totalRecords || 'Total Records'}</div>
            <div className="text-xl font-bold text-gray-900">{attendances.length}</div>
          </div>
          <div className="bg-white border border-gray-200 p-5">
            <div className="text-sm text-gray-600 mb-1">{dict.admin?.totalHours || 'Total Hours'}</div>
            <div className="text-xl font-bold text-gray-900">{formatHours(calculateTotalHours(attendances))}</div>
          </div>
          <div className="bg-white border border-gray-200 p-5">
            <div className="text-sm text-gray-600 mb-1">{dict.admin?.averageHours || 'Average Hours/Record'}</div>
            <div className="text-xl font-bold text-gray-900">
              {attendances.length > 0 ? formatHours(calculateAverageHours(attendances)) : '-'}
            </div>
          </div>
        </div>

        {/* Attendance Trends Charts */}
        {attendances.length > 0 && (
          <div className="bg-white border border-gray-200 p-5 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {dict.admin?.attendanceTrends || 'Attendance Trends'}
            </h2>
            <AttendanceTrendsCharts attendances={attendances} dict={dict} />
          </div>
        )}

        {/* Attendance Table */}
        <div className="bg-white border border-gray-200 p-5">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">{dict.common?.loading || 'Loading...'}</p>
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
                      <tr key={attendance._id}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {userName}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {clockIn.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {clockOut ? clockOut.toLocaleString() : (
                            <span className="text-green-600 font-semibold">{dict.admin?.active || 'Active'}</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {breakStart && breakEnd ? (
                            <span>
                              {breakStart.toLocaleTimeString()} - {breakEnd.toLocaleTimeString()}
                            </span>
                          ) : breakStart ? (
                            <span className="text-yellow-600">{dict.admin?.onBreak || 'On Break'}</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {formatHours(attendance.totalHours)}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          {attendance.notes ? (
                            <span title={attendance.notes}>{attendance.notes.substring(0, 30)}...</span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {attendances.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  {dict.common?.noData || 'No attendance records found'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
