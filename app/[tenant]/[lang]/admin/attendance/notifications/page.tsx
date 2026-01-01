'use client';

import React, { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../../dictionaries-client';

interface Notification {
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

export default function AttendanceNotificationsPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expectedStartTime, setExpectedStartTime] = useState('09:00');
  const [maxHours, setMaxHours] = useState('12');
  const [sending, setSending] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    loadDefaultSettings();
    fetchNotifications();
  }, [lang, tenant]);

  const loadDefaultSettings = async () => {
    try {
      const res = await fetch(`/api/tenants/${tenant}/settings`);
      const data = await res.json();
      if (data.success && data.data.attendanceNotifications) {
        const attSettings = data.data.attendanceNotifications;
        if (attSettings.expectedStartTime) {
          setExpectedStartTime(attSettings.expectedStartTime);
        }
        if (attSettings.maxHoursWithoutClockOut) {
          setMaxHours(String(attSettings.maxHoursWithoutClockOut));
        }
      }
    } catch (error) {
      console.error('Error loading default settings:', error);
      // Continue with defaults if loading fails
    }
  };

  const handleSaveDefaultSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          settings: {
            attendanceNotifications: {
              enabled: true,
              expectedStartTime,
              maxHoursWithoutClockOut: parseFloat(maxHours),
            },
          },
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setMessage({ 
          type: 'success', 
          text: dict.admin?.settingsSaved || 'Settings saved as default' 
        });
        // Clear message after 3 seconds
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.error || dict.admin?.failedToSaveSettings || 'Failed to save settings' });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: dict.admin?.failedToSaveSettings || 'Failed to save settings' });
    } finally {
      setSavingSettings(false);
    }
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('expectedStartTime', expectedStartTime);
      params.append('maxHoursWithoutClockOut', maxHours);

      const res = await fetch(`/api/attendance/notifications?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setNotifications(data.data.notifications || []);
        setSummary(data.data.summary || null);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to fetch notifications' });
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setMessage({ type: 'error', text: 'Failed to fetch notifications' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmails = async () => {
    if (notifications.length === 0) {
      setMessage({ type: 'error', text: dict.admin?.noNotificationsToSend || 'No notifications to send' });
      return;
    }

    const notificationsWithEmail = notifications.filter(n => n.userEmail);
    if (notificationsWithEmail.length === 0) {
      setMessage({ type: 'error', text: dict.admin?.noEmailsToSend || 'No email addresses found for notifications' });
      return;
    }

    if (!confirm(dict.admin?.confirmSendEmails?.replace('{count}', notificationsWithEmail.length.toString()) || `Send emails to ${notificationsWithEmail.length} recipient(s)?`)) {
      return;
    }

    setSending(true);
    try {
      const params = new URLSearchParams();
      params.append('expectedStartTime', expectedStartTime);
      params.append('maxHoursWithoutClockOut', maxHours);

      const res = await fetch(`/api/attendance/notifications?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notifications: notificationsWithEmail }),
      });
      
      const data = await res.json();
      if (data.success) {
        setMessage({ 
          type: 'success', 
          text: data.message || dict.admin?.emailsSentSuccessfully || 'Emails sent successfully' 
        });
      } else {
        setMessage({ type: 'error', text: data.error || dict.admin?.failedToSendEmails || 'Failed to send emails' });
      }
    } catch (error) {
      console.error('Error sending emails:', error);
      setMessage({ type: 'error', text: dict.admin?.failedToSendEmails || 'Failed to send emails' });
    } finally {
      setSending(false);
    }
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
                {dict.admin?.attendanceNotifications || 'Attendance Notifications'}
              </h1>
              <p className="text-gray-600">{dict.admin?.attendanceNotificationsDesc || 'View alerts for late arrivals and missing clock-outs'}</p>
            </div>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin/attendance`)}
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

        {/* Settings */}
        <div className="bg-white border border-gray-300 p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{dict.admin?.settings || 'Settings'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {dict.admin?.expectedStartTime || 'Expected Start Time'}
              </label>
              <input
                type="time"
                value={expectedStartTime}
                onChange={(e) => setExpectedStartTime(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {dict.admin?.maxHoursWithoutClockOut || 'Max Hours Without Clock Out'}
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                value={maxHours}
                onChange={(e) => setMaxHours(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleSaveDefaultSettings}
                disabled={savingSettings}
                className="px-4 py-2 border border-gray-300 hover:bg-gray-50 bg-white font-medium disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {savingSettings ? (dict.common?.saving || 'Saving...') : (dict.admin?.saveAsDefault || 'Save as Default')}
              </button>
              <button
                onClick={fetchNotifications}
                className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium border border-blue-700"
              >
                {dict.common?.search || 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {/* Summary */}
        {summary && (
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-white border border-gray-300 p-6">
                <div className="text-sm text-gray-600 mb-1">{dict.admin?.totalNotifications || 'Total Notifications'}</div>
                <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
              </div>
              <div className="bg-red-50 border border-red-200 p-6">
                <div className="text-sm text-red-600 mb-1">{dict.admin?.missingClockOut || 'Missing Clock Out'}</div>
                <div className="text-2xl font-bold text-red-900">{summary.missingClockOut}</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 p-6">
                <div className="text-sm text-yellow-600 mb-1">{dict.admin?.lateArrivals || 'Late Arrivals'}</div>
                <div className="text-2xl font-bold text-yellow-900">{summary.lateArrivals}</div>
              </div>
            </div>
            {notifications.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    {dict.admin?.sendEmailNotifications || 'Send email notifications to employees'}
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    {notifications.filter(n => n.userEmail).length} {dict.admin?.recipientsWithEmail || 'recipients with email addresses'}
                  </p>
                </div>
                <button
                  onClick={handleSendEmails}
                  disabled={sending || notifications.filter(n => n.userEmail).length === 0}
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium border border-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {sending ? (dict.common?.sending || 'Sending...') : (dict.admin?.sendEmails || 'Send Emails')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Notifications List */}
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.type || 'Type'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.employee || 'Employee'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.clockIn || 'Clock In'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.details || 'Details'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.message || 'Message'}</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {notifications.map((notification) => (
                    <tr key={`${notification.attendanceId}-${notification.type}`}>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold border ${
                          notification.type === 'missing_clock_out'
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                        }`}>
                          {notification.type === 'missing_clock_out'
                            ? (dict.admin?.missingClockOut || 'Missing Clock Out')
                            : (dict.admin?.lateArrival || 'Late Arrival')}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {notification.userName}
                        {notification.userEmail && (
                          <div className="text-xs text-gray-500">{notification.userEmail}</div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(notification.clockInTime).toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {notification.type === 'missing_clock_out' && notification.hoursSinceClockIn && (
                          <div>
                            {dict.admin?.hoursSinceClockIn || 'Hours since clock in'}: {notification.hoursSinceClockIn}h
                          </div>
                        )}
                        {notification.type === 'late_arrival' && (
                          <div>
                            <div>{dict.admin?.minutesLate || 'Minutes late'}: {notification.minutesLate}</div>
                            {notification.expectedTime && (
                              <div className="text-xs">
                                {dict.admin?.expectedTime || 'Expected'}: {new Date(notification.expectedTime).toLocaleTimeString()}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {notification.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {notifications.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  {dict.admin?.noNotifications || 'No notifications found'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
