'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { BellRing, CalendarX2, Plus, X } from 'lucide-react';
import BookingCalendar from '@/components/BookingCalendar';
import BookingStatusTag from '@/components/bookings/BookingStatusTag';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  ICON, DARK_FIELD, DARK_KEY_PRIMARY, DARK_LABEL, INPUT, KEY, KEY_PRIMARY, LABEL, ROW_KEY,
  LedReadout, RegisterPage, Sheet, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { supportsFeature, getBusinessType } from '@/lib/business-type-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { useBookingsList, type Booking } from '@/hooks/useBookingsList';
import { useBookingForm } from '@/hooks/useBookingForm';
import { useStaffList } from '@/hooks/useStaffList';
import { useBookingDetail, type BookingUpdate } from '@/hooks/useBookingDetail';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/lib/confirm';
import { formatTime } from '@/lib/formatting';
import { getDefaultTenantSettings } from '@/lib/currency';
import { getTenantDateString, toTenantDateString } from '@/lib/timezone';
import {
  BOOKING_STATUSES,
  type BookingStatus,
  canSendReminder,
  formatBookingDateTime,
  getAllowedNextStatuses,
  getStaffName,
  getStatusLabel,
  isBookingStatusEditable,
} from '@/lib/bookings-helpers';

type StaffMember = { _id: string; name: string };

const FILTER_KEY = 'flex min-h-[44px] items-center justify-center border-b border-r border-white/25 px-2 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation';

const asDate = (day: string) => new Date(`${day}T12:00:00Z`);

export default function BookingsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterStaff, setFilterStaff] = useState<string>('all');
  const { canAccess } = usePermissions();
  const canManage = canAccess('bookings.manage');
  const canSendReminders = canAccess('bookings.send_reminders');
  const { confirm, Dialog: confirmDialog } = useConfirm();

  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const timeZone = settings?.timezone || 'Asia/Manila';
  const { subscriptionStatus } = useSubscription();
  const planAllowsBooking =
    !subscriptionStatus || subscriptionStatus.features.enableBookingScheduling === true;
  const tenantAllowsBooking = supportsFeature(settings ?? undefined, 'booking');
  const bookingEnabled = planAllowsBooking && tenantAllowsBooking;
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  const { bookings, loading, truncated, fetchBookings, deleteBooking, sendReminder } = useBookingsList(tenant, {
    status: filterStatus,
    staffId: filterStaff,
  });
  const { staff, fetchStaff } = useStaffList(tenant);
  // The open booking is read from the list, so the sheet shows each change once the list refetches.
  const selectedBooking = bookings.find((b) => b._id === selectedId) || null;
  const { updating, updateBooking } = useBookingDetail(tenant, selectedId || '');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchBookings((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterStaff]);

  useEffect(() => {
    fetchStaff((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dayOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bookings) map.set(b._id, toTenantDateString(b.startTime, timeZone));
    return map;
  }, [bookings, timeZone]);

  const handleUpdateBooking = async (updates: BookingUpdate) => {
    await updateBooking(
      updates,
      async (message) => {
        toast.success(message);
        await fetchBookings();
      },
      (error) => toast.error(error)
    );
  };

  const handleStatusChange = async (status: BookingStatus) => {
    if (!dict || !selectedBooking || status === selectedBooking.status) return;
    // Completed and no-show are final, so ask before a tap makes them stick.
    if (!isBookingStatusEditable(status)) {
      const label = getStatusLabel(status, dict);
      const ok = await confirm(
        (dict.admin?.markBookingStatusTitle || 'Mark as {status}?').replace('{status}', label),
        (dict.admin?.markBookingStatusConfirm || "Once a booking is marked {status}, it can't be changed again.").replace('{status}', label),
        { confirmText: label, cancelText: dict.common?.cancel || 'Cancel' }
      );
      if (!ok) return;
    }
    await handleUpdateBooking({ status });
  };

  const handleCancelBooking = async (booking: Booking) => {
    if (!dict) return;
    const ok = await confirm(
      dict.admin?.cancelBookingTitle || 'Cancel this booking?',
      `${dict.admin?.cancelBookingConfirm || 'The customer is notified, and the booking leaves this list.'} (${booking.customerName})`,
      {
        variant: 'danger',
        confirmText: dict.admin?.cancelBooking || 'Cancel booking',
        cancelText: dict.admin?.keepBooking || 'Keep booking',
      }
    );
    if (!ok) return;
    await deleteBooking(
      booking._id,
      (message) => {
        toast.success(message);
        setSelectedId(null);
      },
      (error) => toast.error(error)
    );
  };

  // One send at a time per booking: each reminder can be a paid SMS
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const handleSendReminder = async (bookingId: string) => {
    if (remindingId) return;
    setRemindingId(bookingId);
    try {
      await sendReminder(
        bookingId,
        (message) => toast.success(message),
        (error) => toast.error(error)
      );
    } finally {
      setRemindingId(null);
    }
  };

  // Show the spinner only for the first load; an empty list must not unmount the filters or an open sheet on refetch.
  const [loadedOnce, setLoadedOnce] = useState(false);
  if (!loading && !loadedOnce) setLoadedOnce(true);

  if (!dict || !loadedOnce) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const today = getTenantDateString(timeZone);
  const dueToday = bookings.filter((b) => dayOf.get(b._id) === today && canSendReminder(b.status)).length;
  const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) =>
    new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', { ...opts, timeZone: 'UTC' }).format(asDate(day));
  const minutes = dict.admin?.minutesShort || 'min';

  // The list reads like the appointment book: what is still to come first, then what has passed, most recent first.
  const groupByDay = (list: Booking[]) => {
    const groups: { day: string; items: Booking[] }[] = [];
    for (const b of list) {
      const day = dayOf.get(b._id) || '';
      const last = groups[groups.length - 1];
      if (last?.day === day) last.items.push(b);
      else groups.push({ day, items: [b] });
    }
    return groups;
  };
  const sections: { key: string; title: string; groups: { day: string; items: Booking[] }[] }[] = selectedDay
    ? [{ key: 'day', title: dayLabel(selectedDay, { weekday: 'long', month: 'long', day: 'numeric' }), groups: groupByDay(bookings.filter((b) => dayOf.get(b._id) === selectedDay)) }]
    : [
        { key: 'upcoming', title: dict.admin?.upcomingBookings || 'Upcoming', groups: groupByDay(bookings.filter((b) => (dayOf.get(b._id) || '') >= today)) },
        { key: 'earlier', title: dict.admin?.earlierBookings || 'Earlier', groups: groupByDay(bookings.filter((b) => (dayOf.get(b._id) || '') < today).reverse()) },
      ].filter((s) => s.groups.length > 0);
  const shownCount = sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.items.length, 0), 0);

  const statusFilters = [
    { value: 'all', label: dict.admin?.allStatuses || 'All Statuses' },
    ...BOOKING_STATUSES.map(({ value }) => ({ value, label: getStatusLabel(value, dict) })),
  ];
  const remindLabel = dict.admin?.remind || 'Remind';

  return (
    <RegisterPage
      tagNo="BK"
      tag={settings?.companyName}
      title={dict.admin?.bookings || 'Booking & Scheduling'}
      subtitle={dict.admin?.bookingsSubtitle || 'Manage appointments and bookings'}
      side={<LedReadout value={dueToday} label={dict.admin?.bookingsDueToday || 'Due today'} />}
    >
      {confirmDialog}

      {!bookingEnabled && (
        <div className="mt-6 border-l-4 border-stamp bg-paper-white px-4 py-4 text-ink" role="status">
          <h2 className="text-2xl sm:text-3xl">{dict.admin?.bookingNotAvailableTitle || 'Booking & Scheduling Not Available'}</h2>
          <p className="mt-2 text-sm">
            {(dict.admin?.bookingNotAvailableDesc || 'Booking and scheduling is not enabled for {businessType}.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
          </p>
          <p className="mt-2 text-sm text-ink/70">
            {dict.admin?.bookingNotAvailableHint ||
              'Enable Booking & Scheduling under Settings → Business, ensure your subscription plan includes it, or choose a business type that supports bookings.'}
          </p>
          {!planAllowsBooking && (
            <p className="mt-2 font-receipt text-sm font-medium text-stamp">
              {dict.admin?.bookingSubscriptionRequired ||
                'Your current plan does not include booking and scheduling. Upgrade your subscription to use this feature.'}
            </p>
          )}
        </div>
      )}

      {truncated && (
        <div className="mt-6">
          <Strip tone="error">
            {dict.admin?.bookingsTruncated || 'Showing the latest 1,000 bookings. Filter by status or staff to see older ones.'}
          </Strip>
        </div>
      )}

      {/* Which bookings to show, and the key to take a new one */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-end">
        <fieldset className="min-w-0 flex-1">
          <legend className={DARK_LABEL}>{dict.admin?.status || 'Status'}</legend>
          <div className="grid grid-cols-2 border-l border-t border-white/25 sm:grid-cols-3 md:grid-cols-6">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filterStatus === f.value}
                onClick={() => setFilterStatus(f.value)}
                className={`${FILTER_KEY} ${filterStatus === f.value ? 'bg-paper-white text-ink' : 'text-paper hover:bg-white/10'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="lg:w-56">
          <label htmlFor="booking-staff-filter" className={DARK_LABEL}>{dict.admin?.staff || 'Staff'}</label>
          <select id="booking-staff-filter" value={filterStaff} onChange={(e) => setFilterStaff(e.target.value)} className={DARK_FIELD}>
            <option value="all">{dict.admin?.allStaff || 'All Staff'}</option>
            {staff.map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </div>
        {canManage && (
          <button
            type="button"
            disabled={!bookingEnabled}
            onClick={() => bookingEnabled && setShowCreateModal(true)}
            className={`${DARK_KEY_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand`}
          >
            <Plus className={ICON} strokeWidth={1.75} aria-hidden />
            {dict.admin?.newBooking || 'New Booking'}
          </button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        {/* The appointment book; picking a day narrows the list beside it */}
        <div className="xl:sticky xl:top-6">
          <BookingCalendar
            bookings={bookings}
            dict={dict}
            lang={lang}
            selectedDay={selectedDay}
            onDaySelect={(day) => setSelectedDay((current) => (current === day ? null : day))}
            onBookingSelect={(booking) => setSelectedId(booking._id)}
          />
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>

        <section aria-busy={loading} aria-labelledby="booking-list-title">
          <div className={`bg-paper-white text-ink transition-opacity ${loading ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-ink/30 px-4 py-3">
              <div className="min-w-0">
                <h2 id="booking-list-title" className="text-2xl sm:text-3xl">
                  {selectedDay ? dayLabel(selectedDay, { weekday: 'long', month: 'long', day: 'numeric' }) : (dict.admin?.allBookings || 'All Bookings')}
                </h2>
                <p className="font-receipt text-xs text-ink/60">
                  {shownCount} {shownCount === 1 ? (dict.admin?.bookingSingular || 'booking') : (dict.admin?.bookingPlural || 'bookings')}
                </p>
              </div>
              {selectedDay && (
                <button type="button" onClick={() => setSelectedDay(null)} className={KEY}>
                  <X className={ICON} strokeWidth={1.75} aria-hidden />
                  {dict.admin?.showAllDays || 'All days'}
                </button>
              )}
            </div>

            {shownCount === 0 ? (
              <div className="px-4 py-14 text-center">
                <CalendarX2 className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
                <p className="font-receipt text-sm text-ink/60">
                  {selectedDay ? (dict.admin?.noBookingsOnDay || 'No bookings on this day') : (dict.admin?.noBookingsFound || 'No bookings found')}
                </p>
                {canManage && bookingEnabled && (
                  <button type="button" onClick={() => setShowCreateModal(true)} className={`${KEY_PRIMARY} mx-auto mt-4`}>
                    <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                    {dict.admin?.newBooking || 'New Booking'}
                  </button>
                )}
              </div>
            ) : (
              sections.map((section) => (
                <div key={section.key}>
                  {!selectedDay && (
                    <p className="border-b border-ink/15 bg-ink px-4 py-1.5 font-receipt text-xs font-semibold uppercase tracking-[0.14em] text-paper-white">
                      {section.title}
                    </p>
                  )}
                  {section.groups.map((group) => (
                    <div key={group.day}>
                      {!selectedDay && (
                        <p className="flex items-center justify-between border-b border-dashed border-ink/20 px-4 pb-1 pt-3 font-receipt text-xs uppercase tracking-[0.08em] text-ink/60">
                          <span>{group.day === today ? (dict.components?.bookingCalendar?.today || 'Today') : dayLabel(group.day)}</span>
                          <span>{group.items.length}</span>
                        </p>
                      )}
                      <ul className="divide-y divide-dashed divide-ink/20">
                        {group.items.map((booking) => (
                          <li key={booking._id} className="flex items-stretch">
                            <button
                              type="button"
                              onClick={() => setSelectedId(booking._id)}
                              className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-paper touch-manipulation"
                            >
                              <span className="w-16 shrink-0 font-receipt">
                                <span className="block text-sm font-semibold">{formatTime(booking.startTime, tenantSettings)}</span>
                                <span className="block text-xs text-ink/60">{booking.duration} {minutes}</span>
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-start justify-between gap-2">
                                  <span className={`min-w-0 text-sm font-medium ${booking.status === 'cancelled' ? 'text-ink/50 line-through' : ''}`}>{booking.customerName}</span>
                                  <BookingStatusTag status={booking.status} dict={dict} className="shrink-0" />
                                </span>
                                <span className="mt-0.5 block text-sm text-ink/70">{booking.serviceName}</span>
                                <span className="mt-1 flex flex-wrap gap-x-3 font-receipt text-xs text-ink/60">
                                  <span>{getStaffName(booking.staffName, booking.staffId, dict)}</span>
                                  {booking.customerPhone && <span>{booking.customerPhone}</span>}
                                </span>
                              </span>
                            </button>
                            {canSendReminders && canSendReminder(booking.status) && (
                              <button
                                type="button"
                                onClick={() => handleSendReminder(booking._id)}
                                disabled={remindingId !== null}
                                aria-busy={remindingId === booking._id}
                                className={`${ROW_KEY} mr-2 mt-2 shrink-0 disabled:opacity-40`}
                                aria-label={`${remindLabel} ${booking.customerName}`}
                                title={remindLabel}
                              >
                                <BellRing className={ICON} strokeWidth={1.75} aria-hidden />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </div>

      {selectedBooking && (
        <BookingSheet
          booking={selectedBooking}
          dict={dict}
          lang={lang}
          timeZone={timeZone}
          staff={staff}
          canManage={canManage}
          canSendReminders={canSendReminders}
          reminding={remindingId !== null}
          updating={updating}
          onStaffChange={(staffId) => handleUpdateBooking({ staffId: staffId || null })}
          onStatusChange={handleStatusChange}
          onRemind={() => handleSendReminder(selectedBooking._id)}
          onCancel={() => handleCancelBooking(selectedBooking)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {showCreateModal && (
        <CreateBookingSheet
          tenant={tenant}
          dict={dict}
          timeZone={timeZone}
          staff={staff}
          day={selectedDay}
          onClose={() => setShowCreateModal(false)}
          onCreated={async () => {
            toast.success(dict.common?.bookingCreatedSuccess || 'Booking created successfully');
            setShowCreateModal(false);
            await fetchBookings();
          }}
        />
      )}
    </RegisterPage>
  );
}

/** The appointment slip: who, what and when, with the keys to move it along. */
function BookingSheet({
  booking, dict, lang, timeZone, staff, canManage, canSendReminders, updating, reminding,
  onStaffChange, onStatusChange, onRemind, onCancel, onClose,
}: {
  booking: Booking;
  dict: TranslationDict;
  lang: 'en' | 'es';
  timeZone: string;
  staff: StaffMember[];
  canManage: boolean;
  canSendReminders: boolean;
  reminding: boolean;
  updating: boolean;
  onStaffChange: (staffId: string) => void;
  onStatusChange: (status: BookingStatus) => void;
  onRemind: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const active = canSendReminder(booking.status);
  // Cancelling has its own key, which also notifies the customer.
  const nextStatuses = getAllowedNextStatuses(booking.status).filter((s) => s !== 'cancelled');
  const statusEditable = canManage && isBookingStatusEditable(booking.status);

  return (
    <Sheet
      wide
      title={dict.admin?.bookingDetails || 'Booking Details'}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <BookingStatusTag status={booking.status} dict={dict} />
          {booking.reminderSent && (
            <span className="font-receipt text-xs uppercase text-ink/60">{dict.admin?.reminderSent || 'Reminder sent'}</span>
          )}
        </span>
      }
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          {canManage && active && (
            <button type="button" onClick={onCancel} className={`${KEY} border-stamp/50 text-stamp hover:bg-stamp/10 sm:mr-auto`}>
              <CalendarX2 className={ICON} strokeWidth={1.75} aria-hidden />
              {dict.admin?.cancelBooking || 'Cancel booking'}
            </button>
          )}
          {canSendReminders && active && (
            <button type="button" onClick={onRemind} disabled={reminding} aria-busy={reminding} className={`${KEY} disabled:opacity-40`}>
              <BellRing className={ICON} strokeWidth={1.75} aria-hidden />
              {dict.admin?.sendReminder || 'Send Reminder'}
            </button>
          )}
          <button type="button" onClick={onClose} className={KEY_PRIMARY}>{dict.common?.close || 'Close'}</button>
        </>
      }
    >
      <div className="space-y-5" aria-busy={updating}>
        <div className="space-y-1 font-receipt text-sm">
          <ReceiptRow strong label={dict.admin?.customerName || 'Customer'} value={booking.customerName} />
          {booking.customerPhone && <ReceiptRow label={dict.admin?.phone || 'Phone'} value={booking.customerPhone} />}
          {booking.customerEmail && <ReceiptRow label={dict.admin?.email || 'Email'} value={<span className="break-all">{booking.customerEmail}</span>} />}
          <ReceiptRow label={dict.admin?.service || 'Service'} value={booking.serviceName} />
          <ReceiptRow label={dict.admin?.dateTime || 'Date & Time'} value={formatBookingDateTime(booking.startTime, timeZone, lang)} />
          <ReceiptRow label={dict.admin?.duration || 'Duration'} value={`${booking.duration} ${dict.admin?.durationMinutes || 'minutes'}`} />
          {!canManage && <ReceiptRow label={dict.admin?.staff || 'Staff'} value={getStaffName(booking.staffName, booking.staffId, dict)} />}
        </div>

        {booking.serviceDescription && (
          <div>
            <p className={LABEL}>{dict.admin?.serviceDescription || 'Service Description'}</p>
            <p className="text-sm text-ink/80">{booking.serviceDescription}</p>
          </div>
        )}
        {booking.notes && (
          <div>
            <p className={LABEL}>{dict.admin?.notes || 'Notes'}</p>
            <p className="whitespace-pre-line text-sm text-ink/80">{booking.notes}</p>
          </div>
        )}

        {canManage && (
          <div>
            <label htmlFor="booking-detail-staff" className={LABEL}>{dict.admin?.staff || 'Staff'}</label>
            <select
              id="booking-detail-staff"
              value={booking.staffId?._id || ''}
              disabled={updating || !active}
              onChange={(e) => onStaffChange(e.target.value)}
              className={INPUT}
            >
              <option value="">{dict.admin?.unassigned || 'Unassigned'}</option>
              {staff.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {statusEditable && (
          <fieldset>
            <legend className={LABEL}>{dict.admin?.status || 'Status'}</legend>
            <div className="grid grid-cols-3 border-l border-t border-ink/25">
              {nextStatuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={booking.status === s}
                  disabled={updating}
                  onClick={() => onStatusChange(s)}
                  className={`flex min-h-[44px] items-center justify-center border-b border-r border-ink/25 px-1 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation disabled:opacity-50 ${booking.status === s ? 'bg-ink text-paper-white' : 'text-ink hover:bg-paper'}`}
                >
                  {getStatusLabel(s, dict)}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </Sheet>
  );
}

/** A new booking, taken at the counter. A day picked on the calendar is filled in. */
function CreateBookingSheet({ tenant, dict, timeZone, staff, day, onClose, onCreated }: {
  tenant: string;
  dict: TranslationDict;
  timeZone: string;
  staff: StaffMember[];
  day: string | null;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { formData, setFormData, submitting, error, handleSubmit } = useBookingForm(tenant, timeZone);
  const set = (patch: Partial<typeof formData>) => setFormData((current) => ({ ...current, ...patch }));

  useEffect(() => {
    if (day) setFormData((current) => (current.startTime ? current : { ...current, startTime: `${day}T09:00` }));
  }, [day, setFormData]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit(() => onCreated());
  };

  const optional = dict.common?.optional || 'optional';

  return (
    <Sheet
      wide
      title={dict.admin?.createNewBooking || 'Create New Booking'}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>{dict.common?.cancel || 'Cancel'}</button>
          <button type="submit" form="booking-form" disabled={submitting} className={KEY_PRIMARY}>
            {submitting ? (dict.common?.saving || 'Saving...') : (dict.admin?.createBooking || 'Create Booking')}
          </button>
        </>
      }
    >
      <form id="booking-form" onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="booking-form-name" className={LABEL}>{dict.admin?.customerName || 'Customer Name'} *</label>
            <input id="booking-form-name" type="text" required value={formData.customerName} onChange={(e) => set({ customerName: e.target.value })} className={INPUT} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="booking-form-phone" className={LABEL}>{dict.admin?.phone || 'Phone'} ({optional})</label>
            <input id="booking-form-phone" type="tel" value={formData.customerPhone} onChange={(e) => set({ customerPhone: e.target.value })} className={`${INPUT} font-receipt`} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="booking-form-email" className={LABEL}>{dict.admin?.email || 'Email'} ({optional})</label>
            <input id="booking-form-email" type="email" value={formData.customerEmail} onChange={(e) => set({ customerEmail: e.target.value })} className={INPUT} autoComplete="off" />
          </div>
        </div>

        <div className="border-t border-dashed border-ink/30 pt-4">
          <label htmlFor="booking-form-service" className={LABEL}>{dict.admin?.serviceName || 'Service Name'} *</label>
          <input id="booking-form-service" type="text" required value={formData.serviceName} onChange={(e) => set({ serviceName: e.target.value })} className={INPUT} />
        </div>
        <div>
          <label htmlFor="booking-form-description" className={LABEL}>{dict.admin?.serviceDescription || 'Service Description'} ({optional})</label>
          <textarea id="booking-form-description" rows={2} value={formData.serviceDescription} onChange={(e) => set({ serviceDescription: e.target.value })} className={INPUT} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="booking-form-start" className={LABEL}>{dict.admin?.startTime || 'Start Time'} *</label>
            <input id="booking-form-start" type="datetime-local" required value={formData.startTime} onChange={(e) => set({ startTime: e.target.value })} className={`${INPUT} font-receipt`} />
          </div>
          <div>
            <label htmlFor="booking-form-duration" className={LABEL}>{dict.admin?.durationLabel || 'Duration (minutes)'} *</label>
            <input
              id="booking-form-duration"
              type="number"
              inputMode="numeric"
              required
              min="1"
              value={formData.duration || ''}
              onChange={(e) => set({ duration: Number(e.target.value) || 0 })}
              className={`${INPUT} font-receipt`}
            />
          </div>
          <div>
            <label htmlFor="booking-form-staff" className={LABEL}>{dict.admin?.staffMember || 'Staff Member'}</label>
            <select id="booking-form-staff" value={formData.staffId} onChange={(e) => set({ staffId: e.target.value })} className={INPUT}>
              <option value="">{dict.admin?.unassigned || 'Unassigned'}</option>
              {staff.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className={LABEL}>{dict.admin?.status || 'Status'}</legend>
            <div className="grid grid-cols-2 border-l border-t border-ink/25">
              {(['pending', 'confirmed'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={formData.status === s}
                  onClick={() => set({ status: s })}
                  className={`flex min-h-[44px] items-center justify-center border-b border-r border-ink/25 px-1 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation ${formData.status === s ? 'bg-ink text-paper-white' : 'text-ink hover:bg-paper'}`}
                >
                  {getStatusLabel(s, dict)}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div>
          <label htmlFor="booking-form-notes" className={LABEL}>{dict.admin?.notes || 'Notes'} ({optional})</label>
          <textarea id="booking-form-notes" rows={3} value={formData.notes} onChange={(e) => set({ notes: e.target.value })} className={INPUT} />
        </div>

        {error && <Strip tone="error">{error}</Strip>}
      </form>
    </Sheet>
  );
}
