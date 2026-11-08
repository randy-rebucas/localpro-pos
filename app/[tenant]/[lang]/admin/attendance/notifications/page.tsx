'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, BellOff, Mail, RefreshCw, Save } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  ICON, DARK_FIELD, DARK_KEY, DARK_KEY_PRIMARY, DARK_LABEL,
  LedReadout, RegisterPage, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import { useAttendanceNotifications } from '@/hooks/useAttendanceNotifications';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { useSendNotificationEmails } from '@/hooks/useSendNotificationEmails';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDateTime, formatTime } from '@/lib/formatting';
import { useConfirm } from '@/lib/confirm';
import { LATE_GRACE_MINUTES } from '@/lib/attendance-alerts';
import {
  getNotificationsWithEmailCount,
  formatNotificationType,
  type Notification,
} from '@/lib/notification-helpers';

/** How each alert prints: a missed clock-out is the stamp, a late arrival an outline. */
const TYPE_TAG: Record<Notification['type'], string> = {
  missing_clock_out: 'border border-stamp bg-stamp text-paper-white',
  late_arrival: 'border border-stamp text-stamp',
};

export default function AttendanceNotificationsPage() {
  const { settings: tenantSettings } = useTenantSettings();
  const dateSettings = tenantSettings || getDefaultTenantSettings();
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [ready, setReady] = useState(false);
  const { canAccess } = usePermissions();
  const canManage = canAccess('attendance.manage');
  const { confirm, Dialog: confirmDialog } = useConfirm();

  const { notifications, loading, fetchNotifications } = useAttendanceNotifications();
  const { expectedStartTime, setExpectedStartTime, maxHours, setMaxHours, savingSettings, loadDefaultSettings, saveDefaultSettings } = useNotificationSettings(tenant);
  const { sending, sendEmails } = useSendNotificationEmails();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Load the saved thresholds first, then list against them; later edits apply on Refresh.
  useEffect(() => {
    if (tenant && canManage) loadDefaultSettings().finally(() => setReady(true));
  }, [tenant, canManage, loadDefaultSettings]);

  const refresh = useCallback(() => {
    fetchNotifications(expectedStartTime, maxHours, (error) => toast.error(error));
  }, [expectedStartTime, maxHours, fetchNotifications]);

  useEffect(() => {
    if (ready) refresh();
    // Only on first ready: threshold edits wait for the Refresh key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const handleSave = async () => {
    await saveDefaultSettings(
      () => toast.success(dict?.admin?.settingsSaved || 'Settings saved as default'),
      (error) => toast.error(error)
    );
  };

  const handleSendEmails = async () => {
    if (!dict) return;
    const emailCount = getNotificationsWithEmailCount(notifications);
    if (emailCount === 0) {
      toast.error(dict.admin?.noEmailsToSend || 'No email addresses found for notifications');
      return;
    }
    const ok = await confirm(
      dict.admin?.sendEmails || 'Send Emails',
      (dict.admin?.confirmSendEmails || 'Send emails to {count} recipient(s)?').replace('{count}', String(emailCount)),
      { confirmText: dict.admin?.sendEmails || 'Send Emails', cancelText: dict.common?.cancel || 'Cancel' }
    );
    if (!ok) return;
    await sendEmails(
      notifications,
      expectedStartTime,
      maxHours,
      (sent, failed) => {
        const text = (dict.admin?.emailsSentCount || 'Sent {sent} email(s)').replace('{sent}', String(sent));
        toast.success(failed > 0 ? `${text} · ${(dict.admin?.emailsFailedCount || '{failed} failed').replace('{failed}', String(failed))}` : text);
      },
      (error) => toast.error(error)
    );
  };

  if (!dict) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const title = dict.admin?.attendanceNotifications || 'Attendance Notifications';
  const backLink = (
    <Link href={`/${tenant}/${lang}/admin/attendance`} className={`${DARK_KEY} mt-6 w-fit`}>
      <ArrowLeft className={ICON} strokeWidth={1.75} aria-hidden />
      {dict.admin?.attendance || 'Attendance'}
    </Link>
  );

  if (!canManage) {
    return (
      <RegisterPage tagNo="AT" title={title}>
        <div className="mt-6">
          <Strip tone="error">
            {dict.admin?.accessRestrictedAttendance || "You don't have permission to view the attendance dashboard. Contact an admin or owner."}
          </Strip>
        </div>
      </RegisterPage>
    );
  }

  const missing = notifications.filter((n) => n.type === 'missing_clock_out').length;
  const late = notifications.filter((n) => n.type === 'late_arrival').length;
  const emailCount = getNotificationsWithEmailCount(notifications);

  const details = (n: Notification) => {
    if (n.type === 'missing_clock_out') {
      return (dict.admin?.hoursSinceClockInText || '{hours}h since clock-in').replace('{hours}', Number(n.hoursSinceClockIn || 0).toFixed(1));
    }
    const lateText = (dict.admin?.minutesLateText || '{minutes} min late').replace('{minutes}', String(n.minutesLate ?? 0));
    return n.expectedTime
      ? `${lateText} · ${dict.admin?.expectedTime || 'Expected'} ${formatTime(n.expectedTime, dateSettings)}`
      : lateText;
  };

  return (
    <RegisterPage
      tagNo="AT"
      tag={tenantSettings?.companyName}
      title={title}
      subtitle={dict.admin?.attendanceNotificationsDesc || 'View alerts for late arrivals and missing clock-outs'}
      side={<LedReadout value={notifications.length} label={dict.admin?.totalNotifications || 'Total'} />}
    >
      {confirmDialog}
      {backLink}

      {/* The rules alerts are checked against */}
      <div className="mt-6 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]">
        <div>
          <label htmlFor="notif-start" className={DARK_LABEL}>{dict.admin?.expectedStartTime || 'Expected Start Time'}</label>
          <input id="notif-start" type="time" value={expectedStartTime} onChange={(e) => setExpectedStartTime(e.target.value)} className={DARK_FIELD} />
        </div>
        <div>
          <label htmlFor="notif-max" className={DARK_LABEL}>{dict.admin?.maxHoursWithoutClockOut || 'Max Hours Without Clock Out'}</label>
          <input id="notif-max" type="number" inputMode="decimal" step="0.5" min="1" value={maxHours} onChange={(e) => setMaxHours(e.target.value)} className={DARK_FIELD} />
        </div>
        <button type="button" onClick={refresh} disabled={loading} className={DARK_KEY}>
          <RefreshCw className={`${ICON} ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} strokeWidth={1.75} aria-hidden />
          {dict.admin?.checkNow || 'Check now'}
        </button>
        <button type="button" onClick={handleSave} disabled={savingSettings} className={DARK_KEY}>
          <Save className={ICON} strokeWidth={1.75} aria-hidden />
          {savingSettings ? (dict.common?.saving || 'Saving...') : (dict.admin?.saveAsDefault || 'Save as Default')}
        </button>
        <button
          type="button"
          onClick={handleSendEmails}
          disabled={sending || emailCount === 0}
          className={`${DARK_KEY_PRIMARY} sm:col-span-2 lg:col-span-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand`}
        >
          <Mail className={ICON} strokeWidth={1.75} aria-hidden />
          {sending ? (dict.common?.sending || 'Sending...') : `${dict.admin?.sendEmails || 'Send Emails'} · ${emailCount}`}
        </button>
      </div>
      <p className="mt-3 font-receipt text-xs text-white/60">
        {(dict.admin?.lateGraceHint || 'Late means more than {minutes} minutes after the expected start, today at the store.').replace('{minutes}', String(LATE_GRACE_MINUTES))}
      </p>

      {/* The alert slip */}
      <section className="mt-6" aria-busy={loading} aria-labelledby="notif-list">
        <div className={`bg-paper-white text-ink transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-ink/30 px-4 py-3">
            <h2 id="notif-list" className="text-2xl sm:text-3xl">{dict.admin?.notifications || 'Notifications'}</h2>
            <ul className="flex flex-wrap gap-2 font-receipt text-xs uppercase">
              <li className={`px-1.5 py-0.5 ${TYPE_TAG.missing_clock_out}`}>{dict.admin?.missingClockOut || 'Missing Clock Out'} {missing}</li>
              <li className={`px-1.5 py-0.5 ${TYPE_TAG.late_arrival}`}>{dict.admin?.lateArrivals || 'Late Arrivals'} {late}</li>
            </ul>
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-14 text-center">
              {loading || !ready ? (
                <LoadingSpinner size="md" color="#2d868a" />
              ) : (
                <>
                  <BellOff className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
                  <p className="font-receipt text-sm text-ink/60">{dict.admin?.noNotifications || 'No notifications found'}</p>
                </>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-dashed divide-ink/20">
              {notifications.map((n) => (
                <li key={`${n.attendanceId}-${n.type}`} className="grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <span className={`inline-block whitespace-nowrap px-1.5 py-0.5 font-receipt text-[11px] uppercase ${TYPE_TAG[n.type]}`}>
                      {formatNotificationType(n.type, dict)}
                    </span>
                    <p className="mt-1 text-sm font-medium">{n.userName}</p>
                    <p className="break-all font-receipt text-xs text-ink/60">{n.userEmail || (dict.admin?.noEmailOnFile || 'No email on file')}</p>
                  </div>
                  <div className="font-receipt text-sm sm:text-right">
                    <p className="font-semibold">{details(n)}</p>
                    <p className="text-xs text-ink/60">{dict.admin?.clockIn || 'Clock In'} {formatDateTime(n.clockInTime, dateSettings)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </section>
    </RegisterPage>
  );
}
