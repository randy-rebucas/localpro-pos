'use client';

import React, { useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-brand hover:text-brand-hover font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.attendanceNotifications || 'Attendance Notifications'}
              </h1>
              <p className="text-gray-600">{dict.admin?.attendanceNotificationsDesc || 'View alerts for late arrivals and missing clock-outs'}</p>
            </div>
          </div>
        </div>

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
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
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
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleSaveDefaultSettings}
                disabled={savingSettings}
                className="px-4 py-2 border border-gray-300 hover:bg-gray-50 bg-white font-medium disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {savingSettings ? dict.common?.saving || 'Saving...' : dict.admin?.saveAsDefault || 'Save as Default'}
              </button>
              <button
                onClick={handleRefreshNotifications}
                className="flex-1 px-4 py-2 bg-brand text-white hover:bg-brand-hover font-medium border border-brand-hover"
              >
                {dict.common?.search || 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {/* Summary */}
        {notifications.length > 0 && (
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-white border border-gray-300 p-6">
                <div className="text-sm text-gray-600 mb-1">{dict.admin?.totalNotifications || 'Total Notifications'}</div>
                <div className="text-2xl font-bold text-gray-900">{notifications.length}</div>
              </div>
              <div className="bg-red-50 border border-red-200 p-6">
                <div className="text-sm text-red-600 mb-1">{dict.admin?.missingClockOut || 'Missing Clock Out'}</div>
                <div className="text-2xl font-bold text-red-900">{notifications.filter((n) => n.type === 'missing_clock_out').length}</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 p-6">
                <div className="text-sm text-yellow-600 mb-1">{dict.admin?.lateArrivals || 'Late Arrivals'}</div>
                <div className="text-2xl font-bold text-yellow-900">{notifications.filter((n) => n.type === 'late_arrival').length}</div>
              </div>
            </div>

            {hasNotificationsToSend(notifications) && (
              <div className="bg-brand-soft border border-teal-200 p-4 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-brand-navy-deep">
                    {dict.admin?.sendEmailNotifications || 'Send email notifications to employees'}
                  </p>
                  <p className="text-xs text-brand-hover mt-1">
                    {getNotificationsWithEmailCount(notifications)} {dict.admin?.recipientsWithEmail || 'recipients with email addresses'}
                  </p>
                </div>
                <button
                  onClick={handleSendEmails}
                  disabled={sending || !hasNotificationsToSend(notifications)}
                  className="px-4 py-2 bg-brand text-white hover:bg-brand-hover font-medium border border-brand-hover disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {sending ? dict.common?.sending || 'Sending...' : dict.admin?.sendEmails || 'Send Emails'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Notifications Table */}
        <div className="bg-white border border-gray-300 p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
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
                        <span className={`px-2 py-1 text-xs font-semibold border ${getNotificationBadgeClass(notification.type)}`}>
                          {formatNotificationType(notification.type, dict)}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {notification.userName}
                        {notification.userEmail && <div className="text-xs text-gray-500">{notification.userEmail}</div>}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatClockInTime(notification.clockInTime)}
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
