'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import Navbar from '@/components/Navbar';
import BookingCalendar from '@/components/BookingCalendar';
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
import {
  getStatusColor,
  formatBookingDateTime,
  getDeleteBookingConfirmMessage,
} from '@/lib/bookings-helpers';

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

  const { settings } = useTenantSettings();
  const { subscriptionStatus } = useSubscription();
  const planAllowsBooking =
    !subscriptionStatus || subscriptionStatus.features.enableBookingScheduling === true;
  const tenantAllowsBooking = supportsFeature(settings ?? undefined, 'booking');
  const bookingEnabled = planAllowsBooking && tenantAllowsBooking;
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  const { bookings, loading, fetchBookings, deleteBooking, sendReminder } = useBookingsList(tenant, {
    status: filterStatus,
    staffId: filterStaff,
  });
  const { formData, setFormData, handleSubmit: submitForm, resetForm } = useBookingForm(tenant);
  const { staff, fetchStaff } = useStaffList(tenant);
  const { updateBooking } = useBookingDetail(tenant, selectedBooking?._id || '');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchBookings((error) => toast.error(error));
    fetchStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterStaff]);

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(
      async () => {
        toast.success(dict?.common?.bookingCreatedSuccess || 'Booking created successfully');
        await fetchBookings();
        setShowCreateModal(false);
        resetForm();
      },
      (error) => toast.error(error)
    );
  };

  const handleUpdateBooking = async (bookingId: string, updates: BookingUpdate) => {
    await updateBooking(updates, async (message) => {
      toast.success(message);
      await fetchBookings();
      setShowModal(false);
      setSelectedBooking(null);
    },
    (error) => toast.error(error));
  };

  const handleDeleteBooking = async (bookingId: string) => {
    if (!dict) return;
    if (!confirm(getDeleteBookingConfirmMessage(dict))) {
      return;
    }

    await deleteBooking(
      bookingId,
      async (message) => {
        toast.success(message);
        await fetchBookings();
        setShowModal(false);
        setSelectedBooking(null);
      },
      (error) => toast.error(error)
    );
  };

  const handleSendReminder = async (bookingId: string) => {
    await sendReminder(
      bookingId,
      (message) => toast.success(message),
      (error) => toast.error(error)
    );
  };

  if (loading && bookings.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.admin?.loadingBookings || 'Loading bookings...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              {dict?.admin?.bookings || 'Booking & Scheduling'}
            </h1>
            <p className="text-gray-600">{dict?.admin?.bookingsSubtitle || 'Manage appointments and bookings'}</p>
          </div>
          <button
            type="button"
            disabled={!bookingEnabled}
            onClick={() => bookingEnabled && setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 border border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.newBooking || 'New Booking'}
          </button>
        </div>

        {!bookingEnabled && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-300 text-yellow-800">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                  {dict?.admin?.bookingNotAvailableTitle || 'Booking & Scheduling Not Available'}
                </h3>
                <p className="text-yellow-800">
                  {(dict?.admin?.bookingNotAvailableDesc || 'Booking and scheduling is not enabled for {businessType}.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
                </p>
                <p className="text-sm text-yellow-700 mt-2">
                  {dict?.admin?.bookingNotAvailableHint ||
                    'Enable Booking & Scheduling under Settings → Business, ensure your subscription plan includes it, or choose a business type that supports bookings.'}
                </p>
                {!planAllowsBooking && (
                  <p className="text-sm text-yellow-800 mt-2 font-medium">
                    {dict?.admin?.bookingSubscriptionRequired ||
                      'Your current plan does not include booking and scheduling. Upgrade your subscription to use this feature.'}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex gap-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="all">{dict?.admin?.allStatuses || 'All Statuses'}</option>
            <option value="pending">{dict?.admin?.pending || 'Pending'}</option>
            <option value="confirmed">{dict?.admin?.confirmed || 'Confirmed'}</option>
            <option value="completed">{dict?.admin?.completed || 'Completed'}</option>
            <option value="cancelled">{dict?.admin?.cancelled || 'Cancelled'}</option>
            <option value="no-show">{dict?.admin?.noShow || 'No Show'}</option>
          </select>
          <select
            value={filterStaff}
            onChange={(e) => setFilterStaff(e.target.value)}
            className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="all">{dict?.admin?.allStaff || 'All Staff'}</option>
            {staff.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Calendar View */}
        <div className="mb-8">
          <BookingCalendar
            bookings={bookings}
            onDateSelect={(date) => {
              setSelectedDate(date);
              const dayBookings = bookings.filter((b) => {
                const bookingDate = new Date(b.startTime).toDateString();
                return bookingDate === date.toDateString();
              });
              if (dayBookings.length > 0) {
                setSelectedBooking(dayBookings[0]);
                setShowModal(true);
              }
            }}
            onBookingSelect={(booking) => {
              setSelectedBooking(booking);
              setShowModal(true);
            }}
            selectedDate={selectedDate || undefined}
          />
        </div>

        {/* Bookings List */}
        <div className="bg-white border border-gray-300 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">{dict?.admin?.allBookings || 'All Bookings'}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {dict?.admin?.customerName || 'Customer'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {dict?.admin?.serviceName || 'Service'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {dict?.admin?.dateTime || 'Date & Time'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {dict?.admin?.staff || 'Staff'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {dict?.admin?.status || 'Status'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {dict?.common?.actions || 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {bookings.map((booking) => (
                  <tr key={booking._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{booking.customerName}</div>
                      {booking.customerEmail && (
                        <div className="text-sm text-gray-500">{booking.customerEmail}</div>
                      )}
                      {booking.customerPhone && (
                        <div className="text-sm text-gray-500">{booking.customerPhone}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{booking.serviceName}</div>
                      {booking.serviceDescription && (
                        <div className="text-sm text-gray-500">{booking.serviceDescription}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatBookingDateTime(booking.startTime)}</div>
                      <div className="text-sm text-gray-500">{dict?.admin?.duration || 'Duration'}: {booking.duration} min</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {booking.staffName || booking.staffId?.name || dict?.admin?.unassigned || 'Unassigned'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${getStatusColor(booking.status)}`}>
                        {dict?.admin?.[booking.status] || booking.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedBooking(booking);
                            setShowModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          {dict?.common?.view || 'View'}
                        </button>
                        {booking.status === 'pending' || booking.status === 'confirmed' ? (
                          <button
                            onClick={() => handleSendReminder(booking._id)}
                            className="text-green-600 hover:text-green-900"
                          >
                            {dict?.admin?.remind || 'Remind'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bookings.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {dict?.admin?.noBookingsFound || 'No bookings found'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Booking Detail Modal */}
      {showModal && selectedBooking && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{dict?.admin?.bookingDetails || 'Booking Details'}</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setSelectedBooking(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.customerName || 'Customer Name'}</label>
                <p className="mt-1 text-sm text-gray-900">{selectedBooking.customerName}</p>
              </div>
              {selectedBooking.customerEmail && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.email || 'Email'}</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedBooking.customerEmail}</p>
                </div>
              )}
              {selectedBooking.customerPhone && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.phone || 'Phone'}</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedBooking.customerPhone}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.service || 'Service'}</label>
                <p className="mt-1 text-sm text-gray-900">{selectedBooking.serviceName}</p>
                {selectedBooking.serviceDescription && (
                  <p className="mt-1 text-sm text-gray-500">{selectedBooking.serviceDescription}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.dateTime || 'Date & Time'}</label>
                <p className="mt-1 text-sm text-gray-900">{formatBookingDateTime(selectedBooking.startTime)}</p>
                <p className="mt-1 text-sm text-gray-500">{dict?.admin?.duration || 'Duration'}: {selectedBooking.duration} {dict?.admin?.durationMinutes || 'minutes'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.staff || 'Staff'}</label>
                <select
                  value={selectedBooking.staffId?._id || ''}
                  onChange={(e) => {
                    handleUpdateBooking(selectedBooking._id, { staffId: e.target.value || undefined });
                  }}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">{dict?.admin?.unassigned || 'Unassigned'}</option>
                  {staff.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.status || 'Status'}</label>
                <select
                  value={selectedBooking.status}
                  onChange={(e) => {
                    handleUpdateBooking(selectedBooking._id, { status: e.target.value as Booking['status'] });
                  }}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="pending">{dict?.admin?.pending || 'Pending'}</option>
                  <option value="confirmed">{dict?.admin?.confirmed || 'Confirmed'}</option>
                  <option value="completed">{dict?.admin?.completed || 'Completed'}</option>
                  <option value="cancelled">{dict?.admin?.cancelled || 'Cancelled'}</option>
                  <option value="no-show">{dict?.admin?.noShow || 'No Show'}</option>
                </select>
              </div>
              {selectedBooking.notes && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.notes || 'Notes'}</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedBooking.notes}</p>
                </div>
              )}
              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleSendReminder(selectedBooking._id)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white hover:bg-green-700 transition-colors border border-green-700"
                >
                  {dict?.admin?.sendReminder || 'Send Reminder'}
                </button>
                <button
                  onClick={() => handleDeleteBooking(selectedBooking._id)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 transition-colors border border-red-700"
                >
                  {dict?.common?.delete || 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Booking Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{dict?.admin?.createNewBooking || 'Create New Booking'}</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateBooking} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.customerName || 'Customer Name'} *</label>
                <input
                  type="text"
                  required
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.email || 'Email'}</label>
                <input
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.phone || 'Phone'}</label>
                <input
                  type="tel"
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.serviceName || 'Service Name'} *</label>
                <input
                  type="text"
                  required
                  value={formData.serviceName}
                  onChange={(e) => setFormData({ ...formData, serviceName: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.serviceDescription || 'Service Description'}</label>
                <textarea
                  value={formData.serviceDescription}
                  onChange={(e) => setFormData({ ...formData, serviceDescription: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.startTime || 'Start Time'} *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.durationLabel || 'Duration (minutes)'} *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.staffMember || 'Staff Member'}</label>
                <select
                  value={formData.staffId}
                  onChange={(e) => setFormData({ ...formData, staffId: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">{dict?.admin?.unassigned || 'Unassigned'}</option>
                  {staff.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.status || 'Status'}</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Booking['status'] })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="pending">{dict?.admin?.pending || 'Pending'}</option>
                  <option value="confirmed">{dict?.admin?.confirmed || 'Confirmed'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.notes || 'Notes'}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>
              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors bg-white"
                >
                  {dict?.common?.cancel || 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors border border-blue-700"
                >
                  {dict?.admin?.createBooking || 'Create Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

