'use client';

import { useEffect, useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { showToast } from '@/lib/toast';
import { usePermissions } from '@/hooks/usePermissions';
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

export default function AttendanceNotificationsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const { canAccess } = usePermissions();
  const canView = canAccess('attendance.view');

  const { notifications, loading, error, fetchNotifications } = useAttendanceNotifications();
  const { expectedStartTime, setExpectedStartTime, maxHours, setMaxHours, savingSettings, loadDefaultSettings, saveDefaultSettings } = useNotificationSettings(tenant);
  const { sending, sendEmails } = useSendNotificationEmails();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (tenant && canView) {
      loadDefaultSettings();
    }
  }, [tenant, canView, loadDefaultSettings]);

  // Fetch notifications when settings load or change
  useEffect(() => {
    if (dict && canView) {
      fetchNotifications(expectedStartTime, maxHours, (err) => showToast.error(err));
    }
  }, [expectedStartTime, maxHours, dict, canView, fetchNotifications]);

  const handleSaveDefaultSettings = useCallback(async () => {
    await saveDefaultSettings(
      () => showToast.success(dict?.admin?.settingsSaved || 'Settings saved as default'),
      (err) => showToast.error(err)
    );
  }, [saveDefaultSettings, dict]);

  const handleRefresh = useCallback(() => {
    fetchNotifications(expectedStartTime, maxHours, (err) => showToast.error(err));
  }, [expectedStartTime, maxHours, fetchNotifications]);

  const handleSendEmails = useCallback(async () => {
    if (!dict) return;
    const emailCount = getNotificationsWithEmailCount(notifications);
    if (emailCount === 0) {
      showToast.error(dict.admin?.noEmailsToSend || 'No email addresses found for notifications');
      return;
    }
    if (!confirmSendEmails(emailCount, dict)) return;
    await sendEmails(
      notifications,
      expectedStartTime,
      maxHours,
      () => showToast.success(dict.admin?.emailsSentSuccessfully || 'Emails sent successfully'),
      (err) => showToast.error(err)
    );
  }, [notifications, expectedStartTime, maxHours, dict, sendEmails]);

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="bg-white border border-win8-danger p-6" role="alert">
          <h2 className="text-base font-bold text-win8-danger mb-1">{dict.admin?.accessRestricted || 'Access Restricted'}</h2>
          <p className="text-sm text-gray-700">
            {dict.admin?.accessRestrictedAttendance || "You don't have permission to view the attendance dashboard. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  const missingCount = notifications.filter((n) => n.type === 'missing_clock_out').length;
  const lateCount = notifications.filter((n) => n.type === 'late_arrival').length;
  const emailCount = getNotificationsWithEmailCount(notifications);

  const renderBody = () => {
    if (loading && notifications.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingNotifications || 'Loading notifications…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={handleRefresh}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (notifications.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {dict.admin?.noNotifications || 'No notifications found'}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.type || 'Type'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.employee || 'Employee'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.clockIn || 'Clock In'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.details || 'Details'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {notifications.map((n) => (
              <tr key={`${n.attendanceId}-${n.type}`} className="hover:bg-gray-100 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 py-0.5 text-xs font-semibold ${getNotificationBadgeClass(n.type)}`}>
                    {formatNotificationType(n.type, dict)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{n.userName}</p>
                  <p className="text-xs text-gray-500">{n.userEmail || (dict.admin?.noEmailOnFile || 'No email on file')}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700 tabular-nums">
                  {formatClockInTime(n.clockInTime)}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {n.type === 'missing_clock_out' && n.hoursSinceClockIn && (
                    <span className="tabular-nums">
                      {(dict.admin?.hoursSinceClockIn || '{hours}h since clock-in').replace('{hours}', Number(n.hoursSinceClockIn).toFixed(1))}
                    </span>
                  )}
                  {n.type === 'late_arrival' && (
                    <>
                      <span className="tabular-nums">
                        {(dict.admin?.minutesLate || '{minutes} min late').replace('{minutes}', String(n.minutesLate ?? 0))}
                      </span>
                      {n.expectedTime && (
                        <span className="block text-xs text-gray-400">
                          {dict.admin?.expectedTime || 'Expected'}: {new Date(n.expectedTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict.admin?.attendanceNotifications || 'Attendance Notifications'}
        description={dict.admin?.attendanceNotificationsDesc || 'View alerts for late arrivals and missing clock-outs'}
        actions={
          <Link
            href={`/${tenant}/${lang}/admin/attendance`}
            className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
          >
            {dict.admin?.backToAttendance || '← Attendance'}
          </Link>
        }
      />

      <div className="space-y-4">
        <div className="bg-white border border-gray-300 p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label htmlFor="notif-start" className="block text-xs font-medium text-gray-600 mb-1">
              {dict.admin?.expectedStartTime || 'Expected Start Time'}
            </label>
            <input
              id="notif-start"
              type="time"
              value={expectedStartTime}
              onChange={(e) => setExpectedStartTime(e.target.value)}
              className="px-3 py-2 border border-gray-300 text-sm bg-white"
            />
          </div>
          <div>
            <label htmlFor="notif-hours" className="block text-xs font-medium text-gray-600 mb-1">
              {dict.admin?.maxHoursWithoutClockOut || 'Max Hours Without Clock Out'}
            </label>
            <input
              id="notif-hours"
              type="number"
              step="0.5"
              min="1"
              value={maxHours}
              onChange={(e) => setMaxHours(e.target.value)}
              className="px-3 py-2 border border-gray-300 text-sm bg-white w-32 tabular-nums"
            />
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {loading ? (dict.common?.loading || 'Loading…') : (dict.common?.refresh || 'Refresh')}
          </button>
          <button
            type="button"
            onClick={handleSaveDefaultSettings}
            disabled={savingSettings}
            className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {savingSettings ? (dict.common?.saving || 'Saving…') : (dict.admin?.saveAsDefault || 'Save as Default')}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-300 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{dict.admin?.totalNotifications || 'Total'}</p>
            <p className="text-3xl font-bold tabular-nums text-gray-900 mt-1.5">{notifications.length}</p>
          </div>
          <div className="bg-white border border-gray-300 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{dict.admin?.missingClockOut || 'Missing Clock Out'}</p>
            <p className="text-3xl font-bold tabular-nums text-win8-danger mt-1.5">{missingCount}</p>
          </div>
          <div className="bg-white border border-gray-300 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{dict.admin?.lateArrivals || 'Late Arrivals'}</p>
            <p className="text-3xl font-bold tabular-nums text-win8-warning mt-1.5">{lateCount}</p>
          </div>
        </div>

        {hasNotificationsToSend(notifications) && (
          <div className="bg-brand-soft border border-brand p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-brand-navy">
              <span className="font-semibold tabular-nums">{emailCount}</span> {dict.admin?.recipientsWithEmail || 'recipients with email'}
            </p>
            <button
              type="button"
              onClick={handleSendEmails}
              disabled={sending}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {sending ? (dict.common?.sending || 'Sending…') : (dict.admin?.sendEmails || 'Send Emails')}
            </button>
          </div>
        )}

        {renderBody()}
      </div>
    </div>
  );
}
