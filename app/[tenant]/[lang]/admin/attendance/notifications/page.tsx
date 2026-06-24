'use client';

import React, { useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../../dictionaries-client';
import { useAttendanceNotifications } from '@/hooks/useAttendanceNotifications';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { useSendNotificationEmails } from '@/hooks/useSendNotificationEmails';
import {
  getNotificationsWithEmailCount,
  hasNotificationsToSend,
  formatNotificationType,
  getNotificationBadgeClass,
  formatClockInTime,
  confirmSendEmails,
} from '@/lib/notification-helpers';
import toast from 'react-hot-toast';

export default function AttendanceNotificationsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = React.useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const { notifications, loading, fetchNotifications } = useAttendanceNotifications();
  const { expectedStartTime, setExpectedStartTime, maxHours, setMaxHours, savingSettings, loadDefaultSettings, saveDefaultSettings } = useNotificationSettings(tenant);
  const { sending, sendEmails } = useSendNotificationEmails();

  // Load dictionary
  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Load default settings and fetch notifications
  useEffect(() => {
    if (tenant) {
      loadDefaultSettings();
    }
  }, [tenant, loadDefaultSettings]);

  // Fetch notifications when settings load or change
  useEffect(() => {
    if (dict) {
      fetchNotifications(expectedStartTime, maxHours, (error) => {
        toast.error(error);
      });
    }
  }, [expectedStartTime, maxHours, dict, fetchNotifications]);

  const handleSaveDefaultSettings = useCallback(async () => {
    const success = await saveDefaultSettings(
      () => {
        toast.success(dict?.admin?.settingsSaved || 'Settings saved as default');
      },
      (error) => {
        toast.error(error);
      }
    );
    return success;
  }, [saveDefaultSettings, dict]);

  const handleRefreshNotifications = useCallback(() => {
    fetchNotifications(expectedStartTime, maxHours, (error) => {
      toast.error(error);
    });
  }, [expectedStartTime, maxHours, fetchNotifications]);

  const handleSendEmails = useCallback(async () => {
    if (notifications.length === 0) {
      toast.error(dict?.admin?.noNotificationsToSend || 'No notifications to send');
      return;
    }

    const emailCount = getNotificationsWithEmailCount(notifications);
    if (emailCount === 0) {
      toast.error(dict?.admin?.noEmailsToSend || 'No email addresses found for notifications');
      return;
    }

    if (!confirmSendEmails(emailCount, dict)) {
      return;
    }

    const success = await sendEmails(
      notifications,
      expectedStartTime,
      maxHours,
      () => {
        toast.success(dict?.admin?.emailsSentSuccessfully || 'Emails sent successfully');
      },
      (error) => {
        toast.error(error);
      }
    );

    return success;
  }, [notifications, expectedStartTime, maxHours, dict, sendEmails]);

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {dict.admin?.attendanceNotifications || 'Attendance Notifications'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{dict.admin?.attendanceNotificationsDesc || 'View alerts for late arrivals and missing clock-outs'}</p>
      </div>

      <div className="flex gap-6 items-start">

        {/* Left — Settings sidebar */}
        <aside className="w-56 shrink-0 sticky top-6 space-y-4">
          <div className="bg-white border border-gray-300 p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">{dict.admin?.settings || 'Settings'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {dict.admin?.expectedStartTime || 'Expected Start Time'}
                </label>
                <input
                  type="time"
                  value={expectedStartTime}
                  onChange={(e) => setExpectedStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {dict.admin?.maxHoursWithoutClockOut || 'Max Hours Without Clock Out'}
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  value={maxHours}
                  onChange={(e) => setMaxHours(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 bg-white"
                />
              </div>
              <button
                onClick={handleRefreshNotifications}
                className="w-full px-3 py-2 text-sm bg-brand text-white hover:bg-brand-hover border border-brand-hover transition-colors"
              >
                {dict.common?.search || 'Refresh'}
              </button>
              <button
                onClick={handleSaveDefaultSettings}
                disabled={savingSettings}
                className="w-full px-3 py-2 text-sm border border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingSettings ? dict.common?.saving || 'Saving...' : dict.admin?.saveAsDefault || 'Save as Default'}
              </button>
            </div>
          </div>

          {/* Send emails */}
          {hasNotificationsToSend(notifications) && (
            <div className="bg-teal-50 border border-teal-300 p-4">
              <p className="text-xs font-semibold text-teal-800 uppercase tracking-wide mb-2">
                {dict.admin?.sendEmails || 'Send Emails'}
              </p>
              <p className="text-xs text-teal-700 mb-3">
                {getNotificationsWithEmailCount(notifications)} {dict.admin?.recipientsWithEmail || 'recipients with email'}
              </p>
              <button
                onClick={handleSendEmails}
                disabled={sending}
                className="w-full px-3 py-2 text-sm bg-brand text-white hover:bg-brand-hover border border-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? dict.common?.sending || 'Sending...' : dict.admin?.sendEmails || 'Send Emails'}
              </button>
            </div>
          )}
        </aside>

        {/* Right — Main content */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-gray-300 px-5 py-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{dict.admin?.totalNotifications || 'Total'}</p>
              <p className="text-2xl font-bold text-gray-900">{notifications.length}</p>
            </div>
            <div className="bg-red-50 border border-red-300 px-5 py-4">
              <p className="text-xs text-red-500 uppercase tracking-wide mb-1">{dict.admin?.missingClockOut || 'Missing Clock Out'}</p>
              <p className="text-2xl font-bold text-red-900">{notifications.filter((n) => n.type === 'missing_clock_out').length}</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-300 px-5 py-4">
              <p className="text-xs text-yellow-600 uppercase tracking-wide mb-1">{dict.admin?.lateArrivals || 'Late Arrivals'}</p>
              <p className="text-2xl font-bold text-yellow-900">{notifications.filter((n) => n.type === 'late_arrival').length}</p>
            </div>
          </div>

          {/* Notifications table */}
          <div className="bg-white border border-gray-300">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{dict.admin?.notifications || 'Notifications'}</h2>
              <span className="text-xs text-gray-400">{notifications.length} alerts</span>
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.type || 'Type'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.employee || 'Employee'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.clockIn || 'Clock In'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.details || 'Details'}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.message || 'Message'}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {notifications.map((notification) => (
                      <tr key={`${notification.attendanceId}-${notification.type}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold border ${getNotificationBadgeClass(notification.type)}`}>
                            {formatNotificationType(notification.type, dict)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-sm font-medium text-gray-900">{notification.userName}</p>
                          {notification.userEmail && <p className="text-xs text-gray-500">{notification.userEmail}</p>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatClockInTime(notification.clockInTime)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {notification.type === 'missing_clock_out' && notification.hoursSinceClockIn && (
                            <span>{notification.hoursSinceClockIn}h since clock-in</span>
                          )}
                          {notification.type === 'late_arrival' && (
                            <div>
                              <span>{notification.minutesLate} min late</span>
                              {notification.expectedTime && (
                                <p className="text-xs text-gray-400">
                                  {dict.admin?.expectedTime || 'Expected'}: {new Date(notification.expectedTime).toLocaleTimeString()}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{notification.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {notifications.length === 0 && (
                  <div className="text-center py-12 text-sm text-gray-400">
                    {dict.admin?.noNotifications || 'No notifications found'}
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
