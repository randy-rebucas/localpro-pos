'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { BellRing, Clock, Download } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  ICON, DARK_FIELD, DARK_KEY, DARK_LABEL,
  LedReadout, RegisterPage, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import { useAttendance, type AttendanceRecord } from '@/hooks/useAttendance';
import { useAttendanceFilters } from '@/hooks/useAttendanceFilters';
import { useCurrentSessions } from '@/hooks/useCurrentSessions';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDate, formatTime } from '@/lib/formatting';
import {
  getUserName, buildExportData, exportHeaders, formatHours, calculateTotalHours, calculateAverageFinishedHours,
  type ExportLabels,
} from '@/lib/attendance-helpers';

const AttendanceTrendsCharts = dynamic(() => import('@/components/AttendanceTrendsCharts'), {
  ssr: false,
  loading: () => (
    <div className="flex h-60 items-center justify-center">
      <LoadingSpinner size="md" color="#2d868a" />
    </div>
  ),
});

/** The API returns at most this many records; fewer than this means the range is complete. */
const RECORD_LIMIT = 200;

const TH = 'px-3 py-2 align-bottom font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60';
const TD = 'px-3 py-3 font-receipt text-sm';

interface User {
  _id: string;
  name: string;
  email: string;
}

export default function AttendancePage() {
  const { settings: tenantSettings } = useTenantSettings();
  const dateSettings = tenantSettings || getDefaultTenantSettings();
  const timeZone = dateSettings.timezone || 'Asia/Manila';
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const dictRef = useRef<TranslationDict | null>(null);
  dictRef.current = dict;
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const { attendances, loading, fetchAttendances } = useAttendance();
  const { selectedUserId, setSelectedUserId, startDate, setStartDate, endDate, setEndDate, initializeDateRange } = useAttendanceFilters(timeZone);
  const { currentSessions, fetchCurrentSessions, calculateSessionHours } = useCurrentSessions();
  const { canAccess } = usePermissions();
  const canManage = canAccess('attendance.manage');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    const { startDate, endDate } = initializeDateRange();
    setStartDate(startDate);
    setEndDate(endDate);
  }, [initializeDateRange, setStartDate, setEndDate]);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    fetch('/api/users', { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (data.success) setUsers(data.data);
        else throw new Error(data.error || 'Failed to load employees');
      })
      .catch((error) => {
        // Unmounting (or React re-running the effect) aborts on purpose; that is not a failure.
        if (cancelled) return;
        setMessage(error instanceof Error && error.name !== 'AbortError' ? error.message : (dictRef.current?.admin?.failedToLoadEmployees || 'Failed to load employees'));
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tenant, canManage]);

  useEffect(() => {
    if (canManage && startDate && endDate) {
      fetchAttendances({ userId: selectedUserId, startDate, endDate, limit: RECORD_LIMIT }, (error) => setMessage(error));
    }
  }, [canManage, startDate, endDate, selectedUserId, fetchAttendances]);

  useEffect(() => {
    if (canManage) fetchCurrentSessions();
  }, [canManage, fetchCurrentSessions]);

  const exportLabels = useCallback((): ExportLabels => ({
    employee: dict?.admin?.employee || 'Employee',
    clockIn: dict?.admin?.clockIn || 'Clock In',
    clockOut: dict?.admin?.clockOut || 'Clock Out',
    breakStart: dict?.admin?.breakStart || 'Break Start',
    breakEnd: dict?.admin?.breakEnd || 'Break End',
    totalHours: dict?.admin?.totalHours || 'Total Hours',
    notes: dict?.admin?.notes || 'Notes',
    date: dict?.admin?.date || 'Date',
    active: dict?.admin?.active || 'Active',
  }), [dict]);

  const handleExport = useCallback(
    async (format: 'csv' | 'excel' | 'pdf') => {
      const labels = exportLabels();
      const headers = exportHeaders(labels);
      const exportData = buildExportData(attendances, users, dateSettings, labels);
      const baseFilename = `attendance_export_${startDate || 'all'}_to_${endDate || 'today'}`;
      try {
        const { arrayToCSV, downloadCSV, downloadExcel, downloadPDF } = await import('@/lib/export');
        if (format === 'csv') downloadCSV(arrayToCSV(exportData, headers), `${baseFilename}.csv`);
        else if (format === 'excel') await downloadExcel(exportData, headers, baseFilename);
        else await downloadPDF(exportData, headers, baseFilename, dict?.admin?.attendance || 'Attendance Records');
        toast.success((dict?.admin?.exportedSuccessfully || 'Successfully exported as {format}').replace('{format}', format.toUpperCase()));
      } catch (error) {
        console.error('Error exporting:', error);
        toast.error((dict?.admin?.failedToExport || 'Failed to export {format}').replace('{format}', format.toUpperCase()));
      }
    },
    [attendances, users, startDate, endDate, dict, dateSettings, exportLabels]
  );

  if (!dict) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const title = dict.admin?.attendance || 'Attendance Management';

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

  const name = (a: AttendanceRecord) => getUserName(a, users);
  const shiftCount = (n: number) => `${n} ${n === 1 ? (dict.admin?.shift || 'shift') : (dict.admin?.shiftsLower || 'shifts')}`;
  const truncated = attendances.length >= RECORD_LIMIT;

  const breakText = (a: AttendanceRecord) =>
    a.breakStart && a.breakEnd
      ? `${formatTime(a.breakStart, dateSettings)} – ${formatTime(a.breakEnd, dateSettings)}`
      : a.breakStart ? null : '—';

  /** A still-open shift: on break, or simply on the clock (`ignoreBreak` for the clock-out column, where the break column says it). */
  const openTag = (a: AttendanceRecord, ignoreBreak = false) => (
    !ignoreBreak && a.breakStart && !a.breakEnd
      ? <span className="inline-block whitespace-nowrap border border-stamp px-1.5 py-0.5 font-receipt text-[11px] uppercase text-stamp">{dict.admin?.onBreak || 'On Break'}</span>
      : <span className="inline-block whitespace-nowrap bg-brand px-1.5 py-0.5 font-receipt text-[11px] uppercase text-ink">{dict.admin?.onTheClock || 'On the clock'}</span>
  );

  return (
    <RegisterPage
      tagNo="AT"
      tag={tenantSettings?.companyName}
      title={title}
      subtitle={dict.admin?.attendanceDescription || 'View and manage employee attendance records'}
      side={<LedReadout value={currentSessions.length} label={dict.admin?.onTheClock || 'On the clock'} />}
    >
      {message && (
        <div className="mt-6"><Strip tone="error">{message}</Strip></div>
      )}

      {/* Whose time cards, over which days, and the keys to take them away */}
      <div className="mt-6 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_auto]">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="att-employee" className={DARK_LABEL}>{dict.admin?.employee || 'Employee'}</label>
          <select id="att-employee" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} disabled={usersLoading} className={`${DARK_FIELD} disabled:opacity-60`}>
            <option value="">{dict.admin?.allEmployees || 'All employees'}</option>
            {users.map((user) => (
              <option key={user._id} value={user._id}>{user.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="att-start" className={DARK_LABEL}>{dict.reports?.startDate || 'Start Date'}</label>
          <input id="att-start" type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} className={DARK_FIELD} />
        </div>
        <div>
          <label htmlFor="att-end" className={DARK_LABEL}>{dict.reports?.endDate || 'End Date'}</label>
          <input id="att-end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={DARK_FIELD} />
        </div>
        <Link href={`/${tenant}/${lang}/admin/attendance/notifications`} className={`${DARK_KEY} sm:col-span-2 lg:col-span-1`}>
          <BellRing className={ICON} strokeWidth={1.75} aria-hidden />
          {dict.admin?.viewNotifications || 'View Notifications'}
        </Link>
      </div>

      {/* Who is on the clock right now */}
      {currentSessions.length > 0 && (
        <section className="mt-6" aria-labelledby="att-now">
          <p id="att-now" className={DARK_LABEL}>{dict.admin?.currentlyClockedIn || 'Clocked In'}</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {currentSessions.map((session) => (
              <li key={session._id} className="flex items-center justify-between gap-3 border border-white/10 bg-black/30 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-paper-white">{name(session)}</p>
                  <p className="flex items-center gap-1 font-receipt text-xs text-white/60">
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                    {formatTime(session.clockIn, dateSettings)}
                    {session.breakStart && !session.breakEnd && <span className="ml-1 text-[#8fe3d0]">· {dict.admin?.onBreak || 'On Break'}</span>}
                  </p>
                </div>
                <span className="flex shrink-0 items-baseline gap-1" aria-label={formatHours(calculateSessionHours(session.clockIn))}>
                  <span className="mk-led-glow font-led text-3xl leading-none text-[#7df0d6]" aria-hidden>{calculateSessionHours(session.clockIn).toFixed(1)}</span>
                  <span className="font-receipt text-xs text-white/60" aria-hidden>h</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {truncated && (
        <div className="mt-6">
          <Strip tone="error">
            {(dict.admin?.attendanceTruncated || 'Showing the latest {count} records. Narrow the dates or pick an employee to see the rest.').replace('{count}', String(RECORD_LIMIT))}
          </Strip>
        </div>
      )}

      {/* The period's totals, printed like an end-of-day reading */}
      <section className="mt-6" aria-busy={loading}>
        <div className={`bg-paper-white text-ink transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <dl className="grid grid-cols-1 divide-y divide-dashed divide-ink/25 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-4 py-4 sm:px-5">
              <dt className="font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">{dict.admin?.totalRecords || 'Total Records'}</dt>
              <dd className="mt-1 font-led text-4xl leading-none">{attendances.length}</dd>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <dt className="font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">{dict.admin?.totalHours || 'Total Hours'}</dt>
              <dd className="mt-1 font-receipt text-2xl font-semibold">{formatHours(calculateTotalHours(attendances))}</dd>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <dt className="font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">{dict.admin?.avgPerFinishedShift || 'Avg per finished shift'}</dt>
              <dd className="mt-1 font-receipt text-2xl font-semibold">{formatHours(calculateAverageFinishedHours(attendances))}</dd>
            </div>
          </dl>
          {attendances.some((a) => a.totalHours) && (
            <div className="border-t border-dashed border-ink/30">
              <AttendanceTrendsCharts attendances={attendances} dict={dict} lang={lang} />
            </div>
          )}
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </section>

      {/* The time cards */}
      <section className="mt-6" aria-busy={loading} aria-labelledby="att-records">
        <div className={`bg-paper-white text-ink transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-ink/30 px-4 py-3">
            <div>
              <h2 id="att-records" className="text-2xl sm:text-3xl">{dict.admin?.attendanceRecords || 'Attendance Records'}</h2>
              <p className="font-receipt text-xs text-ink/60">{shiftCount(attendances.length)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={dict.admin?.exportSectionTitle || 'Export'}>
              <Download className="h-4 w-4 text-ink/50" strokeWidth={1.75} aria-hidden />
              {(['csv', 'excel', 'pdf'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  disabled={attendances.length === 0}
                  onClick={() => handleExport(format)}
                  className="flex min-h-[44px] items-center border border-ink/25 px-3 font-receipt text-xs font-medium uppercase transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation"
                >
                  {format === 'excel' ? 'Excel' : format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {attendances.length === 0 ? (
            <div className="px-4 py-14 text-center">
              {loading ? (
                <LoadingSpinner size="md" color="#2d868a" />
              ) : (
                <>
                  <Clock className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
                  <p className="font-receipt text-sm text-ink/60">{dict.admin?.noAttendanceRecords || 'No attendance records for these dates'}</p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Up to xl: stacked time cards */}
              <ul className="divide-y divide-dashed divide-ink/20 xl:hidden">
                {attendances.map((a) => (
                  <li key={a._id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{name(a)}</p>
                        <p className="font-receipt text-xs text-ink/60">{formatDate(a.clockIn, dateSettings)}</p>
                      </div>
                      {a.clockOut
                        ? <p className="shrink-0 font-receipt text-base font-semibold">{formatHours(a.totalHours)}</p>
                        : openTag(a)}
                    </div>
                    <p className="mt-2 font-receipt text-sm">
                      {formatTime(a.clockIn, dateSettings)}
                      <span className="text-ink/40"> → </span>
                      {a.clockOut ? formatTime(a.clockOut, dateSettings) : '…'}
                      {breakText(a) && breakText(a) !== '—' && (
                        <span className="ml-3 text-xs text-ink/60">{dict.admin?.break || 'Break'} {breakText(a)}</span>
                      )}
                    </p>
                    {a.notes && <p className="mt-1 text-sm text-ink/70">{a.notes}</p>}
                  </li>
                ))}
              </ul>

              {/* From xl: the full log */}
              <div className="relative hidden overflow-x-auto xl:block" role="region" aria-label={dict.admin?.attendanceRecords || 'Attendance Records'} tabIndex={0}>
                <table className="min-w-full">
                  <thead className="border-b border-dashed border-ink/30">
                    <tr>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.employee || 'Employee'}</th>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.date || 'Date'}</th>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.clockIn || 'Clock In'}</th>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.clockOut || 'Clock Out'}</th>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.break || 'Break'}</th>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.notes || 'Notes'}</th>
                      <th scope="col" className={`${TH} text-right`}>{dict.admin?.totalHours || 'Total Hours'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashed divide-ink/20">
                    {attendances.map((a) => (
                      <tr key={a._id} className="align-top transition-colors hover:bg-paper">
                        <td className="px-3 py-3 text-sm font-medium">{name(a)}</td>
                        <td className={`${TD} whitespace-nowrap text-ink/70`}>{formatDate(a.clockIn, dateSettings)}</td>
                        <td className={`${TD} whitespace-nowrap`}>{formatTime(a.clockIn, dateSettings)}</td>
                        <td className={`${TD} whitespace-nowrap`}>{a.clockOut ? formatTime(a.clockOut, dateSettings) : openTag(a, true)}</td>
                        <td className={`${TD} whitespace-nowrap text-ink/70`}>{breakText(a) ?? openTag(a)}</td>
                        <td className="max-w-xs px-3 py-3 text-sm text-ink/70">{a.notes || '—'}</td>
                        <td className={`${TD} whitespace-nowrap text-right font-semibold`}>{formatHours(a.totalHours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </section>
    </RegisterPage>
  );
}
