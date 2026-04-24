'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { formatTime as formatTimeUtil } from '@/lib/formatting';
import { getDefaultTenantSettings } from '@/lib/currency';

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

  const getBookingsForDate = (date: Date | null): Booking[] => {
    if (!date) return [];
    const dateStr = date.toISOString().split('T')[0];
    return bookings.filter((booking) => {
      const bookingDate = new Date(booking.startTime).toISOString().split('T')[0];
      return bookingDate === dateStr;
    });
  };

  const getStatusColor = (status: Booking['status']) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'completed':
        return `border` // Use dynamic style below
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'no-show':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

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

  const days = getDaysInMonth(currentDate);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-white border border-gray-300 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigateMonth('prev')}
            className="p-2 hover:bg-gray-100 transition-colors border border-gray-300 bg-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-gray-900">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <button
            onClick={() => navigateMonth('next')}
            className="p-2 hover:bg-gray-100 transition-colors border border-gray-300 bg-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="ml-4 px-4 py-2 text-sm text-white transition-colors border"
            style={{
              backgroundColor: settings?.primaryColor || '#35979c',
              borderColor: settings?.primaryColor || '#35979c'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${settings?.primaryColor || '#35979c'}dd`; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = settings?.primaryColor || '#35979c'; }}
          >
            {dict?.components?.bookingCalendar?.today || 'Today'}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('month')}
            className="px-4 py-2 text-sm border border-gray-300 transition-colors font-medium"
            style={view === 'month' ? {
              backgroundColor: settings?.primaryColor || '#35979c',
              color: 'white',
              borderColor: settings?.primaryColor || '#35979c'
            } : {
              backgroundColor: '#f3f4f6',
              color: '#374151'
            }}
            onMouseEnter={(e) => {
              if (view !== 'month') {
                e.currentTarget.style.backgroundColor = '#e5e7eb';
              }
            }}
            onMouseLeave={(e) => {
              if (view !== 'month') {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }
            }}
          >
            {dict?.components?.bookingCalendar?.month || 'Month'}
          </button>
          <button
            onClick={() => setView('week')}
            className="px-4 py-2 text-sm border border-gray-300 transition-colors font-medium"
            style={view === 'week' ? {
              backgroundColor: settings?.primaryColor || '#35979c',
              color: 'white',
              borderColor: settings?.primaryColor || '#35979c'
            } : {
              backgroundColor: '#f3f4f6',
              color: '#374151'
            }}
            onMouseEnter={(e) => {
              if (view !== 'week') {
                e.currentTarget.style.backgroundColor = '#e5e7eb';
              }
            }}
            onMouseLeave={(e) => {
              if (view !== 'week') {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }
            }}
          >
            {dict?.components?.bookingCalendar?.week || 'Week'}
          </button>
          <button
            onClick={() => setView('day')}
            className="px-4 py-2 text-sm border border-gray-300 transition-colors font-medium"
            style={view === 'day' ? {
              backgroundColor: settings?.primaryColor || '#35979c',
              color: 'white',
              borderColor: settings?.primaryColor || '#35979c'
            } : {
              backgroundColor: '#f3f4f6',
              color: '#374151'
            }}
            onMouseEnter={(e) => {
              if (view !== 'day') {
                e.currentTarget.style.backgroundColor = '#e5e7eb';
              }
            }}
            onMouseLeave={(e) => {
              if (view !== 'day') {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }
            }}
          >
            {dict?.components?.bookingCalendar?.day || 'Day'}
          </button>
        </div>
      </div>

      {view === 'month' && (
        <div className="grid grid-cols-7 gap-2">
          {/* Day headers */}
          {dayNames.map((day) => (
            <div key={day} className="text-center font-semibold text-gray-700 py-2">
              {day}
            </div>
          ))}

          {/* Calendar days */}
          {days.map((date, index) => {
            const dayBookings = getBookingsForDate(date);
            const isToday = date && date.toDateString() === today.toDateString();
            const isSelected = date && selectedDate && date.toDateString() === selectedDate.toDateString();

            return (
              <div
                key={index}
                onClick={() => {
                  if (date && onDateSelect) {
                    onDateSelect(date);
                  }
                }}
                className="min-h-[100px] p-2 border cursor-pointer transition-colors"
                style={{
                  borderColor: !date ? '#f3f4f6' : isToday ? (settings?.primaryColor || '#35979c') : isSelected ? (settings?.primaryColor || '#35979c') : '#e5e7eb',
                  backgroundColor: !date ? '#f3f4f6' : isToday ? `${settings?.primaryColor || '#35979c'}15` : isSelected ? `${settings?.primaryColor || '#35979c'}25` : '#ffffff'
                }}
                onMouseEnter={(e) => {
                  if (date && !isToday && !isSelected) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = !date ? '#f3f4f6' : isToday ? `${settings?.primaryColor || '#35979c'}15` : isSelected ? `${settings?.primaryColor || '#35979c'}25` : '#ffffff';
                }}
              >
                {date && (
                  <>
                    <div className="text-sm font-semibold mb-1" style={{
                      color: isToday ? (settings?.primaryColor || '#35979c') : '#111827'
                    }}>
                      {date.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayBookings.slice(0, 3).map((booking) => (
                        <div
                          key={booking._id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onBookingSelect) {
                              onBookingSelect(booking);
                            }
                          }}
                          className={`text-xs p-1 border ${getStatusColor(booking.status)} truncate`}
                          title={`${formatTime(booking.startTime)} - ${booking.customerName}: ${booking.serviceName}`}
                        >
                          {formatTime(booking.startTime)} {booking.customerName}
                        </div>
                      ))}
                      {dayBookings.length > 3 && (
                        <div className="text-xs text-gray-500 font-medium">
                          {(dict?.components?.bookingCalendar?.more || '+{count} more').replace('{count}', (dayBookings.length - 3).toString())}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === 'week' && (
        <div className="space-y-4">
          <p className="text-gray-600">{dict?.components?.bookingCalendar?.weekViewComingSoon || 'Week view coming soon...'}</p>
        </div>
      )}

      {view === 'day' && (
        <div className="space-y-4">
          <p className="text-gray-600">{dict?.components?.bookingCalendar?.dayViewComingSoon || 'Day view coming soon...'}</p>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300"></div>
            <span>{dict?.components?.bookingCalendar?.confirmed || 'Confirmed'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-100 border border-yellow-300"></div>
            <span>{dict?.components?.bookingCalendar?.pending || 'Pending'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-brand-soft border border-teal-300"></div>
            <span>{dict?.components?.bookingCalendar?.completed || 'Completed'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 border border-red-300"></div>
            <span>{dict?.components?.bookingCalendar?.cancelled || 'Cancelled'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

