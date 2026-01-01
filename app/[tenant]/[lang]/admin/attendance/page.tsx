'use client';

import React, { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';

interface Attendance {
  _id: string;
  userId: string | { _id: string; name: string; email: string };
  clockIn: string;
  clockOut?: string;
  breakStart?: string;
  breakEnd?: string;
  totalHours?: number;
  notes?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    address?: string;
  };
  createdAt: string;
}

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
  const [dict, setDict] = useState<any>(null);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentSessions, setCurrentSessions] = useState<Attendance[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchUsers();
    // Set default date range (last 30 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  }, [lang, tenant]);

  useEffect(() => {
    if (startDate && endDate) {
      fetchAttendances();
    }
  }, [startDate, endDate, selectedUserId]);

  useEffect(() => {
    if (users.length > 0) {
      fetchCurrentSessions();
    }
  }, [users]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchAttendances = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedUserId) params.append('userId', selectedUserId);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('limit', '100');

      const res = await fetch(`/api/attendance?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setAttendances(data.data);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.error || dict?.admin?.fetchError || 'Failed to fetch attendance records' });
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
      setMessage({ type: 'error', text: dict?.admin?.fetchError || 'Failed to fetch attendance records' });
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentSessions = async () => {
    try {
      // Fetch all users and check their current sessions
      const sessions: Attendance[] = [];
      for (const user of users) {
        try {
          const res = await fetch(`/api/attendance/current?userId=${user._id}`, { credentials: 'include' });
          const data = await res.json();
          if (data.success && data.data) {
            sessions.push({ ...data.data, userId: user });
          }
        } catch (error) {
          // Skip if error fetching for this user
        }
      }
      setCurrentSessions(sessions);
    } catch (error) {
      console.error('Error fetching current sessions:', error);
    }
  };

  const formatHours = (hours?: number) => {
    if (!hours) return '-';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const calculateTotalHours = () => {
    return attendances.reduce((total, att) => total + (att.totalHours || 0), 0);
  };

  if (!dict) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.attendance || 'Attendance Management'}
              </h1>
              <p className="text-gray-600">{dict.admin?.attendanceDescription || 'View and manage employee attendance records'}</p>
            </div>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin`)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
            >
              {dict.common?.back || 'Back'}
            </button>
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
                const userName = typeof session.userId === 'object' ? session.userId.name : users.find(u => u._id === session.userId)?.name || 'Unknown';
                const clockInTime = new Date(session.clockIn);
                const now = new Date();
                const hours = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
                
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

        {/* Filters */}
        <div className="bg-white border border-gray-300 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {dict.admin?.employee || 'Employee'}
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
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
            <div className="flex items-end">
              <button
                onClick={fetchAttendances}
                className="w-full px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium border border-blue-700"
              >
                {dict.common?.search || 'Search'}
              </button>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-gray-300 p-6">
            <div className="text-sm text-gray-600 mb-1">{dict.admin?.totalRecords || 'Total Records'}</div>
            <div className="text-2xl font-bold text-gray-900">{attendances.length}</div>
          </div>
          <div className="bg-white border border-gray-300 p-6">
            <div className="text-sm text-gray-600 mb-1">{dict.admin?.totalHours || 'Total Hours'}</div>
            <div className="text-2xl font-bold text-gray-900">{formatHours(calculateTotalHours())}</div>
          </div>
          <div className="bg-white border border-gray-300 p-6">
            <div className="text-sm text-gray-600 mb-1">{dict.admin?.averageHours || 'Average Hours/Record'}</div>
            <div className="text-2xl font-bold text-gray-900">
              {attendances.length > 0 ? formatHours(calculateTotalHours() / attendances.length) : '-'}
            </div>
          </div>
        </div>

        {/* Attendance Table */}
        <div className="bg-white border border-gray-300 p-6">
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
                    const userName = typeof attendance.userId === 'object' 
                      ? attendance.userId.name 
                      : users.find(u => u._id === attendance.userId)?.name || 'Unknown';
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
