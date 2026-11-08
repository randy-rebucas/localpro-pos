'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarOff, Pencil, Plus, Trash2 } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  ICON, CHECKBOX, CHECK_ROW, DARK_KEY_PRIMARY, HINT, INPUT, KEY, KEY_PRIMARY, LABEL, ROW_KEY,
  LedReadout, RegisterPage, Sheet, Strip,
} from '@/components/admin/register-ui';
import { useConfirm } from '@/lib/confirm';
import { HOLIDAY_NAME_MAX, nextHolidayDate, parseHolidayInput, type Holiday } from '@/lib/holidays';
import { getTenantDateString } from '@/lib/timezone';
import type { ITenantSettings } from '@/types/tenant';

type Dict = Record<string, Record<string, string | undefined> | undefined>;
type Pattern = 'yearly' | 'monthly' | 'weekly';

const PATTERNS: Pattern[] = ['yearly', 'monthly', 'weekly'];
const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** A 'YYYY-MM-DD' calendar day as a Date at UTC midnight, for formatting without a zone shift. */
const utcDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/**
 * The tenant's closed-days notice. Each holiday is a tear-off calendar leaf with its next date,
 * soonest first; single dates that have passed sit at the foot.
 */
export default function HolidaysManager({ settings, tenant, lang, dict, canManage, header }: {
  settings: ITenantSettings;
  tenant: string;
  lang: 'en' | 'es';
  dict: Dict;
  canManage: boolean;
  header: { tag?: string; title: string; subtitle?: string };
}) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sheetHoliday, setSheetHoliday] = useState<Holiday | null | undefined>(undefined); // undefined: closed, null: new
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm, Dialog } = useConfirm();

  const dictRef = useRef(dict);
  dictRef.current = dict;
  const h = (key: string, fallback: string) => dict.holidays?.[key] || fallback;
  const locale = lang === 'es' ? 'es' : 'en';

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/holidays`, { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setHolidays(data.data || []);
        setLoadError('');
      } else {
        setLoadError(dictRef.current.holidays?.failedToLoad || 'Failed to load holidays');
      }
    } catch {
      setLoadError(dictRef.current.holidays?.failedToLoad || 'Failed to load holidays');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const handleDelete = async (holiday: Holiday) => {
    const ok = await confirm(
      h('deleteTitle', 'Delete {name}?').replace('{name}', holiday.name),
      holiday.isBusinessClosed
        ? h('deleteWarningClosed', 'Bookings can be made on this day again.')
        : h('deleteWarningOpen', 'It comes off the calendar. Nothing else changes.'),
      { variant: 'danger', confirmText: dict.common?.delete || 'Delete', cancelText: dict.common?.cancel || 'Cancel' }
    );
    if (!ok) return;
    setBusyId(holiday.id);
    try {
      const res = await fetch(`/api/tenants/${tenant}/holidays?id=${encodeURIComponent(holiday.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        toast.success(h('holidayDeleted', 'Holiday deleted successfully'));
        fetchHolidays();
      } else {
        toast.error(h('failedToDelete', 'Failed to delete holiday'));
      }
    } catch {
      toast.error(h('failedToDelete', 'Failed to delete holiday'));
    } finally {
      setBusyId(null);
    }
  };

  // Spinner only before the first answer, so refetches keep the list (and an open sheet) on screen.
  const [loadedOnce, setLoadedOnce] = useState(false);
  if (!loading && !loadedOnce) setLoadedOnce(true);

  if (!loadedOnce) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const today = getTenantDateString(settings.timezone);
  const dated = holidays.map((holiday) => ({ holiday, next: nextHolidayDate(holiday, today) }));
  const upcoming = dated.filter((d) => d.next).sort((a, b) => a.next!.localeCompare(b.next!));
  const passed = dated.filter((d) => !d.next).sort((a, b) => (b.holiday.date || '').localeCompare(a.holiday.date || ''));
  const nextClosed = upcoming.find((d) => d.holiday.isBusinessClosed);

  const monthShort = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const monthLong = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
  const fullDate = new Intl.DateTimeFormat(locale, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const weekdayName = (dow: number) => dict.businessHours?.[WEEKDAY_KEYS[dow]] || WEEKDAY_KEYS[dow][0].toUpperCase() + WEEKDAY_KEYS[dow].slice(1);

  /** How the holiday repeats, in words. */
  const repeatLine = (holiday: Holiday) => {
    const r = holiday.recurring;
    if (holiday.type === 'single' || !r) return h('oneDay', 'One day');
    if (r.pattern === 'weekly' && r.dayOfWeek !== undefined) return h('everyWeekday', 'Every {day}').replace('{day}', weekdayName(r.dayOfWeek));
    if (r.pattern === 'monthly' && r.dayOfMonth) return h('everyMonthDay', 'Every month on day {day}').replace('{day}', String(r.dayOfMonth));
    if (r.pattern === 'yearly' && r.month && r.dayOfMonth) {
      return h('everyYearOn', 'Every year on {date}')
        .replace('{date}', new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, r.month - 1, r.dayOfMonth))));
    }
    return h('recurring', 'Recurring');
  };

  const editLabel = dict.common?.edit || 'Edit';
  const deleteLabel = dict.common?.delete || 'Delete';

  const row = ({ holiday, next }: { holiday: Holiday; next: string | null }) => {
    const leaf = next || holiday.date || '';
    const busy = busyId === holiday.id;
    return (
      <li key={holiday.id} className={`flex items-start gap-3 px-4 py-3 sm:gap-4 sm:px-5 ${next ? '' : 'opacity-60'}`}>
        {/* Calendar leaf: month band over the day */}
        <div className="w-14 shrink-0 text-center" aria-hidden>
          <div className={`py-0.5 font-receipt text-[10px] font-semibold uppercase tracking-[0.14em] text-paper-white ${holiday.isBusinessClosed ? 'bg-stamp' : 'bg-ink'}`}>
            {leaf ? monthShort.format(utcDay(leaf)) : '—'}
          </div>
          <div className="border border-t-0 border-ink/25 bg-white py-1 font-display text-3xl leading-none">
            {leaf ? utcDay(leaf).getUTCDate() : '·'}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{holiday.name}</p>
          <p className="mt-0.5 font-receipt text-xs text-ink/70">
            {leaf && <time dateTime={leaf}>{fullDate.format(utcDay(leaf))}</time>}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-receipt text-[11px] uppercase tracking-[0.06em] text-ink/60">
            <span>{repeatLine(holiday)}</span>
            {holiday.isBusinessClosed ? (
              <span className="border border-stamp px-1.5 py-0.5 font-semibold text-stamp">{h('closedTag', 'Closed')}</span>
            ) : (
              <span className="bg-ink/10 px-1.5 py-0.5 text-ink/70">{h('openTag', 'Open as usual')}</span>
            )}
            {!next && <span className="bg-ink/10 px-1.5 py-0.5 text-ink/70">{h('passedTag', 'Passed')}</span>}
          </div>
        </div>
        {canManage && (
          <div className="-my-1 flex shrink-0">
            <button type="button" disabled={busy} onClick={() => setSheetHoliday(holiday)} className={`${ROW_KEY} disabled:opacity-40`} aria-label={`${editLabel} ${holiday.name}`} title={editLabel}>
              <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
            </button>
            <button type="button" disabled={busy} onClick={() => handleDelete(holiday)} className={`${ROW_KEY} hover:text-stamp disabled:opacity-40`} aria-label={`${deleteLabel} ${holiday.name}`} title={deleteLabel}>
              <Trash2 className={ICON} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <RegisterPage
      tagNo="HD"
      tag={header.tag}
      title={header.title}
      subtitle={header.subtitle}
      side={<LedReadout value={holidays.filter((x) => x.isBusinessClosed).length} label={h('closedDays', 'Closed days')} />}
    >
      {Dialog}
      <div className="mt-6 grid gap-6 xl:grid-cols-12">
        <section className="min-w-0 xl:col-span-8">
          {canManage && (
            <div className="mb-3 flex justify-end">
              <button type="button" onClick={() => setSheetHoliday(null)} className={DARK_KEY_PRIMARY}>
                <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                {h('addHoliday', 'Add Holiday')}
              </button>
            </div>
          )}

          {loadError && <div className="mb-3"><Strip tone="error">{loadError}</Strip></div>}

          <div className={`bg-paper-white text-ink transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-ink/30 px-4 py-3 sm:px-5">
              <h2 className="text-3xl sm:text-4xl">{h('noticeTitle', 'Closed on')}</h2>
              <span className="font-receipt text-xs uppercase tracking-[0.08em] text-ink/60">{h('soonestFirst', 'Soonest first')}</span>
            </div>
            {holidays.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <CalendarOff className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
                <p className="font-receipt text-sm text-ink/60">{h('noHolidays', 'No holidays configured. Add holidays to mark days when your business is closed.')}</p>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-dashed divide-ink/20">{upcoming.map(row)}</ul>
                {passed.length > 0 && (
                  <>
                    <p className="border-t border-dashed border-ink/30 px-4 pb-1 pt-3 font-receipt text-xs uppercase tracking-[0.14em] text-ink/60 sm:px-5">
                      {h('passedHeading', 'Already passed')}
                    </p>
                    <ul className="divide-y divide-dashed divide-ink/20">{passed.map(row)}</ul>
                  </>
                )}
              </>
            )}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>

        <aside className="space-y-3 xl:col-span-4">
          <div className="border border-white/10 bg-black/30 px-4 py-4">
            <p className="font-receipt text-xs uppercase tracking-[0.14em] text-white/60">{h('nextClosed', 'Next closed day')}</p>
            {nextClosed ? (
              <>
                <p className="mt-2 flex items-end gap-3">
                  <span className="mk-led-glow font-led text-5xl leading-none text-[#7df0d6]">{utcDay(nextClosed.next!).getUTCDate()}</span>
                  <span className="pb-1 font-receipt text-sm uppercase tracking-[0.08em] text-paper/80">{monthLong.format(utcDay(nextClosed.next!))}</span>
                </p>
                <p className="mt-2 font-receipt text-sm text-paper/80">
                  {nextClosed.next === today ? h('todayLabel', 'Today') : fullDate.format(utcDay(nextClosed.next!))} · {nextClosed.holiday.name}
                </p>
              </>
            ) : (
              <p className="mt-2 font-receipt text-sm text-paper/70">{h('noneComing', 'None coming up')}</p>
            )}
          </div>
          <div className="border border-white/15 px-4 py-4 font-receipt text-xs leading-relaxed text-paper/80">
            <p className="mb-2 uppercase tracking-[0.14em] text-[#8fe3d0]">{h('howItWorks', 'What a closed day does')}</p>
            <ul className="list-disc space-y-1.5 pl-4">
              <li>{h('howBookings', 'No bookings can be made on a closed day.')}</li>
              <li>{h('howRegisterWarn', 'The register shows a warning but still works, so you can ring up sales if you open anyway.')}</li>
              <li>{h('howOpen', 'Days marked open are only a reminder on this calendar.')}</li>
            </ul>
          </div>
        </aside>
      </div>

      {sheetHoliday !== undefined && (
        <HolidaySheet
          holiday={sheetHoliday}
          tenant={tenant}
          lang={lang}
          dict={dict}
          weekdayName={weekdayName}
          onClose={() => setSheetHoliday(undefined)}
          onSaved={() => {
            setSheetHoliday(undefined);
            fetchHolidays();
          }}
        />
      )}
    </RegisterPage>
  );
}

const RADIO_KEY = (on: boolean) =>
  `${KEY} ${on ? 'border-ink bg-ink text-paper-white hover:bg-ink' : ''}`;

function HolidaySheet({ holiday, tenant, lang, dict, weekdayName, onClose, onSaved }: {
  holiday: Holiday | null;
  tenant: string;
  lang: 'en' | 'es';
  dict: Dict;
  weekdayName: (dow: number) => string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const h = (key: string, fallback: string) => dict.holidays?.[key] || fallback;
  const [name, setName] = useState(holiday?.name || '');
  const [type, setType] = useState<'single' | 'recurring'>(holiday?.type || 'single');
  const [date, setDate] = useState(holiday?.type === 'single' ? holiday.date || '' : '');
  const [isBusinessClosed, setIsBusinessClosed] = useState(holiday?.isBusinessClosed !== false);
  const [pattern, setPattern] = useState<Pattern>(holiday?.recurring?.pattern || 'yearly');
  const [month, setMonth] = useState(holiday?.recurring?.month?.toString() || '1');
  const [dayOfMonth, setDayOfMonth] = useState(holiday?.recurring?.dayOfMonth?.toString() || '');
  const [dayOfWeek, setDayOfWeek] = useState(holiday?.recurring?.dayOfWeek ?? 0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const monthName = new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en', { month: 'long', timeZone: 'UTC' });

  const save = async () => {
    if (saving) return;
    const body = {
      name,
      type,
      date: type === 'single' ? date : '',
      isBusinessClosed,
      recurring: type === 'recurring'
        ? {
            pattern,
            ...(pattern === 'yearly' ? { month: Number(month), dayOfMonth: Number(dayOfMonth) } : {}),
            ...(pattern === 'monthly' ? { dayOfMonth: Number(dayOfMonth) } : {}),
            ...(pattern === 'weekly' ? { dayOfWeek } : {}),
          }
        : undefined,
    };
    // Same checks as the server, said in the shop's language.
    const check = parseHolidayInput(body);
    if (!check.ok) {
      setError(!name.trim()
        ? h('nameRequired', 'Give the holiday a name.')
        : type === 'single'
          ? h('dateRequired', 'Pick the date.')
          : h('dayInvalid', 'Pick a day that exists in that month.'));
      return;
    }
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenant}/holidays`, {
        method: holiday ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(holiday ? { id: holiday.id, ...body } : body),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        toast.success(holiday ? h('holidayUpdated', 'Holiday updated successfully') : h('holidayCreated', 'Holiday created successfully'));
        onSaved();
      } else {
        setError(h('failedToSave', 'Failed to save holiday'));
      }
    } catch {
      setError(h('failedToSave', 'Failed to save holiday'));
    } finally {
      setSaving(false);
    }
  };

  const dayField = (
    <div>
      <label htmlFor="holiday-day" className={LABEL}>{h('day', 'Day')}</label>
      <input id="holiday-day" type="number" inputMode="numeric" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} className={INPUT} />
    </div>
  );

  return (
    <Sheet
      title={holiday ? h('editHoliday', 'Edit Holiday') : h('addHoliday', 'Add Holiday')}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>{dict.common?.cancel || 'Cancel'}</button>
          <button type="button" onClick={save} disabled={saving} className={KEY_PRIMARY}>
            {saving ? (dict.common?.saving || 'Saving...') : h('saveHoliday', 'Save Holiday')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Strip tone="error">{error}</Strip>}
        <div>
          <label htmlFor="holiday-name" className={LABEL}>{h('holidayName', 'Holiday Name')}</label>
          <input
            id="holiday-name"
            type="text"
            value={name}
            maxLength={HOLIDAY_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
            placeholder={h('holidayNamePlaceholder', "e.g., New Year's Day")}
          />
        </div>

        <fieldset>
          <legend className={LABEL}>{h('type', 'Type')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['single', 'recurring'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={RADIO_KEY(type === t)}>
                {t === 'single' ? h('singleDate', 'Single Date') : h('recurring', 'Recurring')}
              </button>
            ))}
          </div>
        </fieldset>

        {type === 'single' ? (
          <div>
            <label htmlFor="holiday-date" className={LABEL}>{h('date', 'Date')}</label>
            <input id="holiday-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
          </div>
        ) : (
          <>
            <fieldset>
              <legend className={LABEL}>{h('recurringPattern', 'Recurring Pattern')}</legend>
              <div className="grid grid-cols-3 gap-2">
                {PATTERNS.map((p) => (
                  <button key={p} type="button" aria-pressed={pattern === p} onClick={() => setPattern(p)} className={RADIO_KEY(pattern === p)}>
                    {h(p, p)}
                  </button>
                ))}
              </div>
            </fieldset>
            {pattern === 'yearly' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="holiday-month" className={LABEL}>{h('month', 'Month')}</label>
                  <select id="holiday-month" value={month} onChange={(e) => setMonth(e.target.value)} className={INPUT}>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={String(i + 1)}>{monthName.format(new Date(Date.UTC(2000, i, 1)))}</option>
                    ))}
                  </select>
                </div>
                {dayField}
              </div>
            )}
            {pattern === 'monthly' && dayField}
            {pattern === 'weekly' && (
              <fieldset>
                <legend className={LABEL}>{h('dayOfWeek', 'Day of Week')}</legend>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {Array.from({ length: 7 }, (_, dow) => (
                    <button key={dow} type="button" aria-pressed={dayOfWeek === dow} onClick={() => setDayOfWeek(dow)} className={`${RADIO_KEY(dayOfWeek === dow)} px-1`} title={weekdayName(dow)}>
                      {weekdayName(dow).slice(0, 3)}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </>
        )}

        <div>
          <label className={CHECK_ROW}>
            <input type="checkbox" checked={isBusinessClosed} onChange={(e) => setIsBusinessClosed(e.target.checked)} className={CHECKBOX} />
            {h('businessClosedLabel', 'Business is closed on this holiday')}
          </label>
          <p className={HINT}>{h('businessClosedHint', 'Closed days take no bookings. Leave it off to keep the day as a reminder only.')}</p>
        </div>
      </div>
    </Sheet>
  );
}
