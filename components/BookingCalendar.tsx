'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { formatTime } from '@/lib/formatting';
import { getDefaultTenantSettings } from '@/lib/currency';
import { getTenantDateString, toTenantDateString } from '@/lib/timezone';
import { BOOKING_STATUSES } from '@/lib/bookings-helpers';
import { type TranslationDict } from '@/types/dictionary';
import { type Booking } from '@/hooks/useBookingsList';
import BookingStatusTag, { STATUS_TONE } from '@/components/bookings/BookingStatusTag';
import { KEY, ROW_KEY } from '@/components/admin/register-ui';

type View = 'month' | 'week' | 'day';

interface BookingCalendarProps {
  bookings: Booking[];
  dict: TranslationDict;
  lang: 'en' | 'es';
  /** The day picked to narrow the list, as 'YYYY-MM-DD' in the store's zone. */
  selectedDay: string | null;
  onDaySelect: (day: string) => void;
  onBookingSelect: (booking: Booking) => void;
}

// Days are 'YYYY-MM-DD' strings in the store's zone; the arithmetic runs on UTC dates so the browser's zone never shifts them.
const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => {
  const d = asDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dayOf(d);
};
const addMonths = (day: string, n: number) => {
  const d = asDate(day);
  return dayOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12)));
};
const weekStart = (day: string) => addDays(day, -asDate(day).getUTCDay());

function monthCells(day: string): (string | null)[] {
  const d = asDate(day);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const lead = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let i = 1; i <= count; i++) cells.push(dayOf(new Date(Date.UTC(year, month, i, 12))));
  while (cells.length % 7) cells.push(null);
  return cells;
}

const byStart = (a: Booking, b: Booking) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime();

/** The appointment book: a month, week or day of bookings, read in the store's time zone. */
export default function BookingCalendar({ bookings, dict, lang, selectedDay, onDaySelect, onBookingSelect }: BookingCalendarProps) {
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const timeZone = tenantSettings.timezone || 'Asia/Manila';
  const t = dict.components?.bookingCalendar;
  const locale = lang === 'es' ? 'es-ES' : 'en-US';

  const today = getTenantDateString(timeZone);
  const [cursor, setCursor] = useState(selectedDay || today);
  const [view, setView] = useState<View>('month');

  const byDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const booking of bookings) {
      const key = toTenantDateString(booking.startTime, timeZone);
      const list = map.get(key);
      if (list) list.push(booking);
      else map.set(key, [booking]);
    }
    map.forEach((list) => list.sort(byStart));
    return map;
  }, [bookings, timeZone]);

  const format = (day: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(asDate(day));
  const time = (iso: string) => formatTime(iso, tenantSettings);
  const countLabel = (n: number) =>
    `${n} ${n === 1 ? (dict.admin?.bookingSingular || 'booking') : (dict.admin?.bookingPlural || 'bookings')}`;

  // A fixed Sunday-to-Saturday week gives the weekday names in the page's language.
  const weekdays = Array.from({ length: 7 }, (_, i) => addDays('2023-01-01', i));

  const move = (direction: 1 | -1) => {
    if (view === 'month') setCursor(addMonths(cursor, direction));
    else setCursor(addDays(cursor, direction * (view === 'week' ? 7 : 1)));
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart(cursor), i));
  const title =
    view === 'month'
      ? format(cursor, { month: 'long', year: 'numeric' })
      : view === 'week'
        ? `${format(weekDays[0], { month: 'short', day: 'numeric' })} – ${format(weekDays[6], { month: 'short', day: 'numeric', year: 'numeric' })}`
        : format(cursor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const views: { key: View; label: string }[] = [
    { key: 'month', label: t?.month || 'Month' },
    { key: 'week', label: t?.week || 'Week' },
    { key: 'day', label: t?.day || 'Day' },
  ];

  const entry = (booking: Booking, withEnd = false) => (
    <button
      key={booking._id}
      type="button"
      onClick={() => onBookingSelect(booking)}
      className={`flex min-h-[44px] w-full items-center gap-3 border-l-4 bg-paper/60 px-2 py-1.5 text-left transition-colors hover:bg-paper touch-manipulation ${STATUS_TONE[booking.status].bar}`}
    >
      <span className="shrink-0 font-receipt text-xs font-semibold">
        {time(booking.startTime)}
        {withEnd && <span className="font-normal text-ink/60"> – {time(booking.endTime)}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-medium ${booking.status === 'cancelled' ? 'line-through' : ''}`}>{booking.customerName}</span>
        <span className="block truncate text-xs text-ink/60">{booking.serviceName}</span>
      </span>
      {withEnd && <BookingStatusTag status={booking.status} dict={dict} className="shrink-0" />}
    </button>
  );

  const noBookings = <p className="py-2 font-receipt text-xs text-ink/50">{t?.noBookings || 'No bookings'}</p>;

  return (
    <div className="bg-paper-white text-ink">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-ink/30 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" onClick={() => move(-1)} className={ROW_KEY} aria-label={t?.previous || 'Previous'} title={t?.previous || 'Previous'}>
            <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>
          <h2 className="min-w-0 text-center text-2xl sm:text-3xl" aria-live="polite">{title}</h2>
          <button type="button" onClick={() => move(1)} className={ROW_KEY} aria-label={t?.next || 'Next'} title={t?.next || 'Next'}>
            <ChevronRight className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCursor(today)} className={KEY}>{t?.today || 'Today'}</button>
          <div className="flex border-l border-t border-ink/25" role="group" aria-label={t?.view || 'View'}>
            {views.map((v) => (
              <button
                key={v.key}
                type="button"
                aria-pressed={view === v.key}
                onClick={() => setView(v.key)}
                className={`flex min-h-[44px] items-center border-b border-r border-ink/25 px-3 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation ${view === v.key ? 'bg-ink text-paper-white' : 'hover:bg-paper'}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 py-3 sm:px-4">
        {view === 'month' && (
          <>
            <div className="grid grid-cols-7" aria-hidden>
              {weekdays.map((day) => (
                <div key={day} className="pb-1 text-center font-receipt text-[11px] uppercase tracking-[0.08em] text-ink/60">
                  <span className="sm:hidden">{format(day, { weekday: 'narrow' })}</span>
                  <span className="hidden sm:inline">{format(day, { weekday: 'short' })}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 border-l border-t border-ink/15">
              {monthCells(cursor).map((day, i) => {
                if (!day) return <div key={`blank-${i}`} className="border-b border-r border-ink/15 bg-ink/[0.03]" />;
                const list = byDay.get(day) || [];
                const isToday = day === today;
                const isSelected = day === selectedDay;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onDaySelect(day)}
                    aria-pressed={isSelected}
                    aria-label={`${format(day, { weekday: 'long', month: 'long', day: 'numeric' })}, ${countLabel(list.length)}`}
                    className={`flex min-h-[3.25rem] min-w-0 flex-col items-stretch justify-start gap-0.5 border-b border-r border-ink/15 p-1 text-left transition-colors touch-manipulation sm:min-h-[5.75rem] sm:p-1.5 ${isSelected ? 'bg-brand/25 ring-2 ring-inset ring-ink' : 'hover:bg-paper'}`}
                  >
                    <span className={`self-start font-receipt text-xs font-semibold ${isToday ? 'bg-ink px-1 text-paper-white' : ''}`}>
                      {asDate(day).getUTCDate()}
                    </span>
                    {list.length > 0 && (
                      <>
                        <span className="mt-auto self-end bg-brand px-1 font-receipt text-[11px] font-semibold sm:hidden">{list.length}</span>
                        <span className="hidden min-w-0 space-y-0.5 sm:block">
                          {list.slice(0, 2).map((booking) => (
                            <span
                              key={booking._id}
                              className={`block truncate border-l-2 pl-1 font-receipt text-[11px] leading-tight ${STATUS_TONE[booking.status].bar} ${booking.status === 'cancelled' ? 'text-ink/50 line-through' : ''}`}
                            >
                              {time(booking.startTime)} {booking.customerName}
                            </span>
                          ))}
                          {list.length > 2 && (
                            <span className="block font-receipt text-[11px] text-ink/60">
                              {(t?.more || '+{count} more').replace('{count}', String(list.length - 2))}
                            </span>
                          )}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {view === 'week' && (
          <ul className="divide-y divide-dashed divide-ink/20">
            {weekDays.map((day) => {
              const list = byDay.get(day) || [];
              const isSelected = day === selectedDay;
              return (
                <li key={day} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 py-2">
                  <button
                    type="button"
                    onClick={() => onDaySelect(day)}
                    aria-pressed={isSelected}
                    aria-label={`${format(day, { weekday: 'long', month: 'long', day: 'numeric' })}, ${countLabel(list.length)}`}
                    className={`flex flex-col items-center justify-center self-start py-1 transition-colors touch-manipulation ${isSelected ? 'bg-ink text-paper-white' : day === today ? 'bg-brand/25' : 'hover:bg-paper'}`}
                  >
                    <span className="font-receipt text-[11px] uppercase tracking-[0.08em] opacity-70">{format(day, { weekday: 'short' })}</span>
                    <span className="font-led text-3xl leading-none">{asDate(day).getUTCDate()}</span>
                  </button>
                  <div className="space-y-1">{list.length ? list.map((b) => entry(b)) : noBookings}</div>
                </li>
              );
            })}
          </ul>
        )}

        {view === 'day' && (
          <div className="space-y-1">
            {(byDay.get(cursor) || []).length ? (byDay.get(cursor) || []).map((b) => entry(b, true)) : noBookings}
          </div>
        )}
      </div>

      <ul className="flex flex-wrap gap-2 border-t border-dashed border-ink/30 px-3 py-3 sm:px-4" aria-label={t?.legend || 'Status key'}>
        {BOOKING_STATUSES.map(({ value }) => (
          <li key={value}><BookingStatusTag status={value} dict={dict} /></li>
        ))}
      </ul>
    </div>
  );
}
