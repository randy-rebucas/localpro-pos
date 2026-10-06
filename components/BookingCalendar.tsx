'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { formatTime as formatTimeUtil } from '@/lib/formatting';
import { getDefaultTenantSettings } from '@/lib/currency';
import { BOOKING_STATUS_BADGE } from '@/lib/bookings-helpers';

interface Booking {
  _id: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  serviceName: string;
  serviceDescription?: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  staffId?: {
    _id: string;
    name: string;
    email: string;
  };
  staffName?: string;
  notes?: string;
  reminderSent?: boolean;
  confirmationSent?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BookingCalendarProps {
  bookings: Booking[];
  onDateSelect?: (date: Date) => void;
  onBookingSelect?: (booking: Booking) => void;
  selectedDate?: Date;
}

const STATUS_KEYS: Record<Booking['status'], string> = {
  pending: 'pending',
  confirmed: 'confirmed',
  completed: 'completed',
  cancelled: 'cancelled',
  'no-show': 'noShow',
};

const STATUS_FALLBACK: Record<Booking['status'], string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  'no-show': 'No Show',
};

const badge = (status: Booking['status']) => BOOKING_STATUS_BADGE[status] || 'bg-gray-500 text-white';

// Sunday-first weekday names in the page language (2026-10-04 is a Sunday).
const weekdayNames = (lang: string) =>
  Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 4 + i).toLocaleDateString(lang, { weekday: 'short' }));

export default function BookingCalendar({
  bookings,
  onDateSelect,
  onBookingSelect,
  selectedDate,
}: BookingCalendarProps) {
  const params = useParams();
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [currentDate, setCurrentDate] = useState(selectedDate || new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const t = dict?.components?.bookingCalendar;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  // Compare in local time: cells are local-midnight dates, so a UTC (toISOString)
  // comparison shifted bookings onto the neighbouring day outside UTC.
  const getBookingsForDate = (date: Date | null): Booking[] => {
    if (!date) return [];
    const dateStr = date.toDateString();
    return bookings.filter((booking) => new Date(booking.startTime).toDateString() === dateStr);
  };

  const statusLabel = (status: Booking['status']) => t?.[STATUS_KEYS[status]] || STATUS_FALLBACK[status];

  const formatTime = (dateString: string) => {
    return formatTimeUtil(dateString, tenantSettings);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'prev' ? -7 : 7));
    setCurrentDate(newDate);
  };

  const navigateDay = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'prev' ? -1 : 1));
    setCurrentDate(newDate);
  };

  const navigate = (direction: 'prev' | 'next') => {
    if (view === 'month') navigateMonth(direction);
    else if (view === 'week') navigateWeek(direction);
    else navigateDay(direction);
  };

  const getWeekDays = (date: Date): Date[] => {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  const sortByStartTime = (a: Booking, b: Booking) =>
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime();

  const days = getDaysInMonth(currentDate);
  const dayNames = weekdayNames(lang);

  const cellClass = (isToday: boolean, isSelected: boolean) =>
    `border cursor-pointer transition-colors ${
      isSelected
        ? 'border-brand bg-brand-soft'
        : isToday
          ? 'border-brand bg-white hover:bg-gray-100'
          : 'border-gray-200 bg-white hover:bg-gray-100'
    }`;

  // A span with role="button" rather than <button>: the global 44px min-height on
  // buttons (globals.css, unlayered) would make each chip far taller than the cell.
  const chip = (booking: Booking) => (
    <span
      role="button"
      tabIndex={0}
      key={booking._id}
      onClick={(e) => {
        e.stopPropagation();
        onBookingSelect?.(booking);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onBookingSelect?.(booking);
        }
      }}
      className={`block w-full text-left text-xs px-1 py-0.5 truncate cursor-pointer hover:brightness-110 transition-[filter] ${badge(booking.status)}`}
      title={`${formatTime(booking.startTime)} - ${booking.customerName}: ${booking.serviceName}`}
    >
      {formatTime(booking.startTime)} {booking.customerName}
    </span>
  );

  const views: { key: 'month' | 'week' | 'day'; label: string }[] = [
    { key: 'month', label: t?.month || 'Month' },
    { key: 'week', label: t?.week || 'Week' },
    { key: 'day', label: t?.day || 'Day' },
  ];

  return (
    <div className="bg-white border border-gray-300 p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('prev')}
            title={dict?.common?.previous || 'Previous'}
            aria-label={dict?.common?.previous || 'Previous'}
            className="inline-flex items-center justify-center p-2.5 border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-base font-bold text-gray-900 min-w-[10rem] text-center capitalize">
            {view === 'day'
              ? currentDate.toLocaleDateString(lang, { month: 'long', day: 'numeric', year: 'numeric' })
              : currentDate.toLocaleDateString(lang, { month: 'long', year: 'numeric' })}
          </h2>
          <button
            type="button"
            onClick={() => navigate('next')}
            title={dict?.common?.next || 'Next'}
            aria-label={dict?.common?.next || 'Next'}
            className="inline-flex items-center justify-center p-2.5 border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-2 border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            {t?.today || 'Today'}
          </button>
        </div>
        <div className="flex border border-gray-300" role="group">
          {views.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                view === key ? 'bg-brand text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' && (
        <div className="grid grid-cols-7 gap-1">
          {/* Day headers */}
          {dayNames.map((day) => (
            <div key={day} className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">
              {day}
            </div>
          ))}

          {/* Calendar days */}
          {days.map((date, index) => {
            if (!date) return <div key={index} className="min-h-[96px] bg-gray-100" />;
            const dayBookings = getBookingsForDate(date);
            const isToday = date.toDateString() === today.toDateString();
            const isSelected = !!selectedDate && date.toDateString() === selectedDate.toDateString();

            return (
              <div
                key={index}
                onClick={() => onDateSelect?.(date)}
                className={`min-h-[96px] p-1.5 ${cellClass(isToday, isSelected)}`}
              >
                <div className={`text-sm font-semibold mb-1 tabular-nums ${isToday ? 'text-brand' : 'text-gray-900'}`}>
                  {date.getDate()}
                </div>
                <div className="space-y-0.5">
                  {dayBookings.slice(0, 3).map(chip)}
                  {dayBookings.length > 3 && (
                    <div className="text-xs text-gray-500 font-medium">
                      {(t?.more || '+{count} more').replace('{count}', (dayBookings.length - 3).toString())}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'week' && (
        <div className="grid grid-cols-7 gap-1">
          {getWeekDays(currentDate).map((date) => {
            const dayBookings = getBookingsForDate(date).sort(sortByStartTime);
            const isToday = date.toDateString() === today.toDateString();
            const isSelected = !!selectedDate && date.toDateString() === selectedDate.toDateString();

            return (
              <div
                key={date.toISOString()}
                onClick={() => onDateSelect?.(date)}
                className={`min-h-[220px] p-1.5 ${cellClass(isToday, isSelected)}`}
              >
                <div className="text-center mb-1">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{dayNames[date.getDay()]}</div>
                  <div className={`text-sm font-semibold tabular-nums ${isToday ? 'text-brand' : 'text-gray-900'}`}>
                    {date.getDate()}
                  </div>
                </div>
                <div className="space-y-0.5">
                  {dayBookings.map(chip)}
                  {dayBookings.length === 0 && (
                    <div className="text-xs text-gray-400 text-center">—</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'day' && (
        <div className="border border-gray-300 divide-y divide-gray-200">
          {getBookingsForDate(currentDate).sort(sortByStartTime).map((booking) => (
            <button
              type="button"
              key={booking._id}
              onClick={() => onBookingSelect?.(booking)}
              className="w-full text-left p-3 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-gray-900 tabular-nums">
                  {formatTime(booking.startTime)} – {formatTime(booking.endTime)}
                </span>
                <span className={`px-2 py-0.5 text-xs font-semibold ${badge(booking.status)}`}>
                  {statusLabel(booking.status)}
                </span>
              </div>
              <div className="text-sm text-gray-700 mt-1">{booking.customerName} — {booking.serviceName}</div>
              {booking.staffName && (
                <div className="text-xs text-gray-500 mt-0.5">{booking.staffName}</div>
              )}
            </button>
          ))}
          {getBookingsForDate(currentDate).length === 0 && (
            <p className="p-6 text-center text-sm text-gray-400">{t?.noBookings || 'No bookings'}</p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600">
        {(Object.keys(STATUS_KEYS) as Booking['status'][]).map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 ${badge(status)}`} aria-hidden="true" />
            {statusLabel(status)}
          </span>
        ))}
      </div>
    </div>
  );
}
