'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import BookingCalendar from '@/components/BookingCalendar';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import { useBookingsList, type Booking } from '@/hooks/useBookingsList';
import { useBookingForm } from '@/hooks/useBookingForm';
import { useStaffList } from '@/hooks/useStaffList';
import { useBookingDetail, type BookingUpdate } from '@/hooks/useBookingDetail';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getStatusColor,
  getStatusLabel,
  formatBookingDateTime,
  getDeleteBookingConfirmMessage,
  getAllowedNextStatuses,
  isBookingStatusEditable,
  canSendReminder,
} from '@/lib/bookings-helpers';

const ICON_BUTTON = 'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';
const FIELD = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white disabled:bg-gray-100 disabled:opacity-50';
const SPINNER_SM = <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>;

export default function BookingsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterStaff, setFilterStaff] = useState<string>('all');
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const { canAccess } = usePermissions();
  const canCreate = canAccess('bookings.create');
  const canEdit = canAccess('bookings.edit');
  // "Cancel booking" is DELETE /api/bookings/[id].
  const canDelete = canAccess('bookings.delete');
  const canSendReminders = canAccess('bookings.send_reminders');

  const { settings } = useTenantSettings();
  const { subscriptionStatus } = useSubscription();
  const planAllowsBooking =
    !subscriptionStatus || subscriptionStatus.features.enableBookingScheduling === true;
  const tenantAllowsBooking = supportsFeature(settings ?? undefined, 'booking');
  const bookingEnabled = planAllowsBooking && tenantAllowsBooking;
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  const { bookings, loading, error, fetchBookings, deleteBooking, sendReminder } = useBookingsList(tenant, {
    status: filterStatus,
    staffId: filterStaff,
  });
  const {
    formData,
    setFormData,
    submitting,
    error: formError,
    handleSubmit: submitForm,
    resetForm,
  } = useBookingForm(tenant);
  const { staff, fetchStaff } = useStaffList(tenant);
  const { updating, updateBooking } = useBookingDetail(tenant, selectedBooking?._id || '');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Load errors render inline (with Retry) in the list panel, so no toast here.
  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    fetchStaff((err) => showToast.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = (booking: Booking) => {
    setSelectedBooking(booking);
    setShowModal(true);
  };

  // selectedBooking is kept after close so the drawer content doesn't blank while sliding out.
  const closeDetail = () => setShowModal(false);

  const closeCreate = () => {
    setShowCreateModal(false);
    resetForm();
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    // Failures render inline at the bottom of the drawer form (formError).
    await submitForm(async (message) => {
      showToast.success(message || dict?.common?.bookingCreatedSuccess || 'Booking created successfully');
      await fetchBookings();
      closeCreate();
    });
  };

  const handleUpdateBooking = async (updates: BookingUpdate) => {
    await updateBooking(
      updates,
      async (message) => {
        showToast.success(message);
        await fetchBookings();
        setShowModal(false);
      },
      (err) => showToast.error(err)
    );
  };

  const handleDeleteBooking = async (booking: Booking) => {
    if (!dict) return;
    if (!confirm(getDeleteBookingConfirmMessage(dict, booking.customerName))) return;

    setCancelling(true);
    await deleteBooking(
      booking._id,
      async (message) => {
        showToast.success(message);
        await fetchBookings();
        setShowModal(false);
      },
      (err) => showToast.error(err)
    );
    setCancelling(false);
  };

  const handleSendReminder = async (bookingId: string) => {
    setRemindingId(bookingId);
    await sendReminder(
      bookingId,
      (message) => showToast.success(message),
      (err) => showToast.error(err)
    );
    setRemindingId(null);
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const hasFilters = filterStatus !== 'all' || filterStaff !== 'all';
  const staffName = (b: Booking) => b.staffName || b.staffId?.name || dict.admin?.unassigned || 'Unassigned';
  const viewLabel = dict.common?.view || 'View';
  const remindLabel = dict.admin?.sendReminder || 'Send Reminder';

  const renderList = () => {
    if (loading && bookings.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingBookings || 'Loading bookings…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={() => fetchBookings()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (bookings.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 text-sm">
          {hasFilters
            ? (dict.admin?.noBookingsMatch || 'No bookings match your filters.')
            : (dict.admin?.noBookingsYet || 'No bookings yet.')}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.customerName || 'Customer'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.serviceName || 'Service'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.dateTime || 'Date & Time'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {bookings.map((booking) => {
              const selected = showModal && selectedBooking?._id === booking._id;
              const reminding = remindingId === booking._id;
              return (
                <tr key={booking._id} className={`hover:bg-gray-100 transition-colors ${selected ? 'bg-brand-soft' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{booking.customerName}</p>
                    <p className="text-xs text-gray-500">{booking.customerPhone || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900">{booking.serviceName}</p>
                    <p className="text-xs text-gray-500 tabular-nums">{booking.duration} min</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-gray-900 tabular-nums">{formatBookingDateTime(booking.startTime)}</p>
                    <p className="text-xs text-gray-500">{staffName(booking)}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusColor(booking.status)}`}>
                      {getStatusLabel(booking.status, dict)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openDetail(booking)}
                        title={viewLabel}
                        aria-label={`${viewLabel}: ${booking.customerName}`}
                        className={`${ICON_BUTTON} bg-brand`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                        </svg>
                      </button>
                      {canSendReminders && canSendReminder(booking.status) && (
                        <button
                          type="button"
                          onClick={() => handleSendReminder(booking._id)}
                          disabled={reminding}
                          title={remindLabel}
                          aria-label={`${remindLabel}: ${booking.customerName}`}
                          className={`${ICON_BUTTON} bg-win8-success`}
                        >
                          {reminding ? SPINNER_SM : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.bookings || 'Booking & Scheduling'}
          description={dict.admin?.bookingsSubtitle || 'Manage appointments and bookings'}
        />

        <div className="space-y-4">
          {!bookingEnabled && (
            <div className="bg-white border border-win8-warning p-4 text-sm" role="status">
              <p className="font-bold text-win8-warning">
                {dict.admin?.bookingNotAvailableTitle || 'Booking & Scheduling Not Available'}
              </p>
              <p className="mt-1 text-gray-700">
                {(dict.admin?.bookingNotAvailableDesc || 'Booking and scheduling is not enabled for {businessType}.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
              </p>
              <p className="mt-1 text-gray-500">
                {dict.admin?.bookingNotAvailableHint ||
                  'Enable Booking & Scheduling under Settings → Business, ensure your subscription plan includes it, or choose a business type that supports bookings.'}
              </p>
              {!planAllowsBooking && (
                <p className="mt-2 font-semibold text-win8-warning">
                  {dict.admin?.bookingSubscriptionRequired ||
                    'Your current plan does not include booking and scheduling. Upgrade your subscription to use this feature.'}
                </p>
              )}
            </div>
          )}

          <div className="bg-white border border-gray-300 p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="bookings-status" className={LABEL}>{dict.admin?.status || 'Status'}</label>
              <select
                id="bookings-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 text-sm bg-white w-44"
              >
                <option value="all">{dict.admin?.allStatuses || 'All Statuses'}</option>
                <option value="pending">{dict.admin?.pending || 'Pending'}</option>
                <option value="confirmed">{dict.admin?.confirmed || 'Confirmed'}</option>
                <option value="completed">{dict.admin?.completed || 'Completed'}</option>
                <option value="cancelled">{dict.admin?.cancelled || 'Cancelled'}</option>
                <option value="no-show">{dict.admin?.noShow || 'No Show'}</option>
              </select>
            </div>
            <div>
              <label htmlFor="bookings-staff" className={LABEL}>{dict.admin?.staff || 'Staff'}</label>
              <select
                id="bookings-staff"
                value={filterStaff}
                onChange={(e) => setFilterStaff(e.target.value)}
                className="px-3 py-2 border border-gray-300 text-sm bg-white w-48"
              >
                <option value="all">{dict.admin?.allStaff || 'All Staff'}</option>
                {staff.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setFilterStatus('all');
                  setFilterStaff('all');
                }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                {dict.common?.clearFilters || 'Clear Filters'}
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                disabled={!bookingEnabled}
                onClick={() => bookingEnabled && setShowCreateModal(true)}
                className="ml-auto px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                + {dict.admin?.newBooking || 'New Booking'}
              </button>
            )}
          </div>

          {/* Two-column: bookings list left, calendar right */}
          {/* Side by side only on very wide screens; below that the table needs the full width. */}
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4 items-start">
            <div className="bg-white border border-gray-300">
              <div className="px-5 py-3 border-b border-gray-300 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900">{dict.admin?.allBookings || 'All Bookings'}</h2>
                <span className="text-xs text-gray-500 tabular-nums">
                  {bookings.length.toLocaleString()} {bookings.length === 1 ? (dict.admin?.bookingSingular || 'booking') : (dict.admin?.bookingPlural || 'bookings')}
                </span>
              </div>
              {renderList()}
            </div>

            <div className="2xl:sticky 2xl:top-6" data-testid="booking-calendar">
              <BookingCalendar
                bookings={bookings}
                onDateSelect={(date) => {
                  setSelectedDate(date);
                  const dayBookings = bookings.filter(
                    (b) => new Date(b.startTime).toDateString() === date.toDateString()
                  );
                  if (dayBookings.length > 0) openDetail(dayBookings[0]);
                }}
                onBookingSelect={openDetail}
                selectedDate={selectedDate || undefined}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Booking detail */}
      <Win8Drawer open={showModal && !!selectedBooking} onClose={closeDetail}>
        {selectedBooking && (
          <>
            <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
              <h2 className="text-base font-semibold">{dict.admin?.bookingDetails || 'Booking Details'}</h2>
              <button
                type="button"
                onClick={closeDetail}
                title={dict.common?.close || 'Close'}
                aria-label={dict.common?.close || 'Close'}
                className="text-white/70 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold text-gray-900">{selectedBooking.customerName}</p>
                  <p className="text-xs text-gray-500">
                    {[selectedBooking.customerEmail, selectedBooking.customerPhone].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 text-xs font-semibold ${getStatusColor(selectedBooking.status)}`}>
                  {getStatusLabel(selectedBooking.status, dict)}
                </span>
              </div>

              <hr className="border-gray-300" />

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="col-span-2">
                  <dt className={LABEL}>{dict.admin?.service || 'Service'}</dt>
                  <dd className="text-gray-900">{selectedBooking.serviceName}</dd>
                  {selectedBooking.serviceDescription && (
                    <dd className="text-xs text-gray-500 mt-0.5">{selectedBooking.serviceDescription}</dd>
                  )}
                </div>
                <div>
                  <dt className={LABEL}>{dict.admin?.dateTime || 'Date & Time'}</dt>
                  <dd className="text-gray-900 tabular-nums">{formatBookingDateTime(selectedBooking.startTime)}</dd>
                </div>
                <div>
                  <dt className={LABEL}>{dict.admin?.duration || 'Duration'}</dt>
                  <dd className="text-gray-900 tabular-nums">
                    {selectedBooking.duration} {dict.admin?.durationMinutes || 'minutes'}
                  </dd>
                </div>
                {selectedBooking.notes && (
                  <div className="col-span-2">
                    <dt className={LABEL}>{dict.admin?.notes || 'Notes'}</dt>
                    <dd className="text-gray-900 whitespace-pre-line">{selectedBooking.notes}</dd>
                  </div>
                )}
              </dl>

              <hr className="border-gray-300" />

              <div>
                <label htmlFor="booking-detail-staff" className={LABEL}>{dict.admin?.staff || 'Staff'}</label>
                <select
                  id="booking-detail-staff"
                  value={selectedBooking.staffId?._id || ''}
                  disabled={!canEdit || updating}
                  onChange={(e) => handleUpdateBooking({ staffId: e.target.value || undefined })}
                  className={FIELD}
                >
                  <option value="">{dict.admin?.unassigned || 'Unassigned'}</option>
                  {staff.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="booking-detail-status" className={LABEL}>{dict.admin?.status || 'Status'}</label>
                <select
                  id="booking-detail-status"
                  value={selectedBooking.status}
                  disabled={!canEdit || updating || !isBookingStatusEditable(selectedBooking.status)}
                  onChange={(e) => handleUpdateBooking({ status: e.target.value as Booking['status'] })}
                  className={FIELD}
                >
                  {getAllowedNextStatuses(selectedBooking.status).map((s) => (
                    <option key={s} value={s}>
                      {getStatusLabel(s, dict)}
                    </option>
                  ))}
                </select>
                {updating && <p className="text-xs text-gray-400 mt-1">{dict.common?.saving || 'Saving…'}</p>}
              </div>
            </div>
            {((canDelete && isBookingStatusEditable(selectedBooking.status)) ||
              (canSendReminders && canSendReminder(selectedBooking.status))) && (
              <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
                {canDelete && isBookingStatusEditable(selectedBooking.status) && (
                  <button
                    type="button"
                    onClick={() => handleDeleteBooking(selectedBooking)}
                    disabled={cancelling}
                    className="mr-auto px-4 py-2 bg-win8-danger text-white text-sm font-medium hover:brightness-110 disabled:opacity-50 transition-[filter]"
                  >
                    {cancelling ? (dict.admin?.cancellingBooking || 'Cancelling…') : (dict.admin?.cancelBooking || 'Cancel Booking')}
                  </button>
                )}
                {canSendReminders && canSendReminder(selectedBooking.status) && (
                  <button
                    type="button"
                    onClick={() => handleSendReminder(selectedBooking._id)}
                    disabled={remindingId === selectedBooking._id}
                    className="px-4 py-2 bg-win8-success text-white text-sm font-medium hover:brightness-110 disabled:opacity-50 transition-[filter]"
                  >
                    {remindingId === selectedBooking._id ? (dict.admin?.sending || 'Sending…') : remindLabel}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </Win8Drawer>

      {/* Create booking */}
      <Win8Drawer open={showCreateModal} onClose={closeCreate} widthClass="max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">{dict.admin?.createNewBooking || 'Create New Booking'}</h2>
          <button
            type="button"
            onClick={closeCreate}
            title={dict.common?.close || 'Close'}
            aria-label={dict.common?.close || 'Close'}
            className="text-white/70 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleCreateBooking} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{dict.admin?.customer || 'Customer'}</p>
            <div>
              <label htmlFor="booking-customer" className={LABEL}>{dict.admin?.customerName || 'Customer Name'} *</label>
              <input
                id="booking-customer"
                type="text"
                required
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                className={FIELD}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="booking-email" className={LABEL}>{dict.admin?.email || 'Email'}</label>
                <input
                  id="booking-email"
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                  className={FIELD}
                />
              </div>
              <div>
                <label htmlFor="booking-phone" className={LABEL}>{dict.admin?.phone || 'Phone'}</label>
                <input
                  id="booking-phone"
                  type="tel"
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                  className={FIELD}
                />
              </div>
            </div>

            <hr className="border-gray-300" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{dict.admin?.service || 'Service'}</p>
            <div>
              <label htmlFor="booking-service" className={LABEL}>{dict.admin?.serviceName || 'Service Name'} *</label>
              <input
                id="booking-service"
                type="text"
                required
                value={formData.serviceName}
                onChange={(e) => setFormData({ ...formData, serviceName: e.target.value })}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="booking-service-desc" className={LABEL}>{dict.admin?.serviceDescription || 'Service Description'}</label>
              <textarea
                id="booking-service-desc"
                value={formData.serviceDescription}
                onChange={(e) => setFormData({ ...formData, serviceDescription: e.target.value })}
                rows={2}
                className={`${FIELD} resize-none`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="booking-start" className={LABEL}>{dict.admin?.startTime || 'Start Time'} *</label>
                <input
                  id="booking-start"
                  type="datetime-local"
                  required
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className={FIELD}
                />
              </div>
              <div>
                <label htmlFor="booking-duration" className={LABEL}>{dict.admin?.durationLabel || 'Duration (minutes)'} *</label>
                <input
                  id="booking-duration"
                  type="number"
                  required
                  min="1"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                  className={FIELD}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="booking-staff" className={LABEL}>{dict.admin?.staffMember || 'Staff Member'}</label>
                <select
                  id="booking-staff"
                  value={formData.staffId}
                  onChange={(e) => setFormData({ ...formData, staffId: e.target.value })}
                  className={FIELD}
                >
                  <option value="">{dict.admin?.unassigned || 'Unassigned'}</option>
                  {staff.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="booking-status" className={LABEL}>{dict.admin?.status || 'Status'}</label>
                <select
                  id="booking-status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Booking['status'] })}
                  className={FIELD}
                >
                  <option value="pending">{dict.admin?.pending || 'Pending'}</option>
                  <option value="confirmed">{dict.admin?.confirmed || 'Confirmed'}</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="booking-notes" className={LABEL}>{dict.admin?.notes || 'Notes'}</label>
              <textarea
                id="booking-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className={`${FIELD} resize-none`}
              />
            </div>

            <hr className="border-gray-300" />
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox-win8"
                checked={formData.collectDeposit}
                onChange={(e) => setFormData({ ...formData, collectDeposit: e.target.checked })}
              />
              {dict.admin?.collectDepositNow || 'Collect a deposit now'}
            </label>
            {formData.collectDeposit && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="booking-deposit" className={LABEL}>{dict.admin?.depositAmount || 'Deposit Amount'} *</label>
                  <input
                    id="booking-deposit"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required={formData.collectDeposit}
                    value={formData.depositAmount}
                    onChange={(e) => setFormData({ ...formData, depositAmount: e.target.value })}
                    className={FIELD}
                  />
                </div>
                <div>
                  <label htmlFor="booking-deposit-method" className={LABEL}>{dict.admin?.paymentMethod || 'Payment Method'}</label>
                  <select
                    id="booking-deposit-method"
                    value={formData.depositMethod}
                    onChange={(e) => setFormData({ ...formData, depositMethod: e.target.value as typeof formData.depositMethod })}
                    className={FIELD}
                  >
                    <option value="cash">{dict.admin?.cash || 'Cash'}</option>
                    <option value="card">{dict.admin?.card || 'Card'}</option>
                    <option value="digital">{dict.admin?.digital || 'Digital'}</option>
                    <option value="check">{dict.admin?.check || 'Check'}</option>
                    <option value="on_account">{dict.admin?.onAccount || 'On Account'}</option>
                    <option value="other">{dict.admin?.other || 'Other'}</option>
                  </select>
                </div>
              </div>
            )}

            {formError && <div className="bg-win8-danger text-white text-sm p-3">{formError}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
            <button
              type="button"
              onClick={closeCreate}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100"
            >
              {dict.common?.cancel || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {submitting ? (dict.admin?.creatingBooking || 'Creating…') : (dict.admin?.createBooking || 'Create Booking')}
            </button>
          </div>
        </form>
      </Win8Drawer>
    </>
  );
}
