'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import BookingCalendar from '@/components/BookingCalendar';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';

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

interface User {
  _id: string;
  name: string;
  email: string;
}

type BookingUpdate = Omit<Partial<Booking>, 'staffId'> & {
  staffId?: string;
};

export default function BookingsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [staff, setStaff] = useState<User[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterStaff, setFilterStaff] = useState<string>('all');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { settings } = useTenantSettings();
  const bookingEnabled = supportsFeature(settings ?? undefined, 'booking');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  // Form state
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    serviceName: '',
    serviceDescription: '',
    startTime: '',
    duration: 60,
    staffId: '',
    notes: '',
    status: 'pending' as Booking['status'],
  });

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchBookings();
    fetchStaff();
  }, [filterStatus, filterStaff]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('auth-token='))
        ?.split('=')[1];

      let url = `/api/bookings?tenant=${tenant}`;
      if (filterStatus !== 'all') {
        url += `&status=${filterStatus}`;
      }
      if (filterStaff !== 'all') {
        url += `&staffId=${filterStaff}`;
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setBookings(data.data || []);
          setMessage(null);
        } else {
          setMessage({ type: 'error', text: data.error || dict?.common?.failedToFetchBookings || 'Failed to fetch bookings' });
        }
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || dict?.common?.failedToFetchBookings || 'Failed to fetch bookings' });
      }
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
      setMessage({ type: 'error', text: dict?.common?.failedToFetchBookings || 'Failed to fetch bookings' });
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('auth-token='))
        ?.split('=')[1];

      const response = await fetch(`/api/users?tenant=${tenant}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStaff(data.data || []);
        } else {
          console.error('Failed to fetch staff:', data.error);
        }
      } else {
        const data = await response.json();
        console.error('Failed to fetch staff:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch staff:', error);
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('auth-token='))
        ?.split('=')[1];

      const response = await fetch(`/api/bookings?tenant=${tenant}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setMessage({ type: 'success', text: dict?.common?.bookingCreatedSuccess || 'Booking created successfully' });
          await fetchBookings();
          setShowCreateModal(false);
          resetForm();
        } else {
          setMessage({ type: 'error', text: data.error || dict?.common?.failedToCreateBooking || 'Failed to create booking' });
        }
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || dict?.common?.failedToCreateBooking || 'Failed to create booking' });
      }
    } catch (error) {
      console.error('Failed to create booking:', error);
      setMessage({ type: 'error', text: dict?.common?.failedToCreateBooking || 'Failed to create booking' });
    }
  };

  const handleUpdateBooking = async (id: string, updates: BookingUpdate) => {
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('auth-token='))
        ?.split('=')[1];

      const response = await fetch(`/api/bookings/${id}?tenant=${tenant}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setMessage({ type: 'success', text: dict?.common?.bookingUpdatedSuccess || 'Booking updated successfully' });
          await fetchBookings();
          setShowModal(false);
          setSelectedBooking(null);
        } else {
          setMessage({ type: 'error', text: data.error || dict?.common?.failedToUpdateBooking || 'Failed to update booking' });
        }
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || dict?.common?.failedToUpdateBooking || 'Failed to update booking' });
      }
    } catch (error) {
      console.error('Failed to update booking:', error);
      setMessage({ type: 'error', text: dict?.common?.failedToUpdateBooking || 'Failed to update booking' });
    }
  };

  const handleDeleteBooking = async (id: string) => {
    if (!dict) return;
    if (!confirm(dict.common?.deleteBookingConfirm || 'Are you sure you want to delete this booking?')) {
      return;
    }

    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('auth-token='))
        ?.split('=')[1];

      const response = await fetch(`/api/bookings/${id}?tenant=${tenant}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setMessage({ type: 'success', text: dict?.common?.bookingDeletedSuccess || 'Booking deleted successfully' });
          await fetchBookings();
          setShowModal(false);
          setSelectedBooking(null);
        } else {
          setMessage({ type: 'error', text: data.error || dict?.common?.failedToDeleteBooking || 'Failed to delete booking' });
        }
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || dict?.common?.failedToDeleteBooking || 'Failed to delete booking' });
      }
    } catch (error) {
      console.error('Failed to delete booking:', error);
      setMessage({ type: 'error', text: dict?.common?.failedToDeleteBooking || 'Failed to delete booking' });
    }
  };

  const handleSendReminder = async (id: string) => {
    try {
      const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('auth-token='))
        ?.split('=')[1];

      const response = await fetch(`/api/bookings/${id}/reminder?tenant=${tenant}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setMessage({ type: 'success', text: dict?.common?.reminderSentSuccess || 'Reminder sent successfully' });
        } else {
          setMessage({ type: 'error', text: data.error || dict?.common?.failedToSendReminder || 'Failed to send reminder' });
        }
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || dict?.common?.failedToSendReminder || 'Failed to send reminder' });
      }
    } catch (error) {
      console.error('Failed to send reminder:', error);
      setMessage({ type: 'error', text: dict?.common?.failedToSendReminder || 'Failed to send reminder' });
    }
  };

  const resetForm = () => {
    setFormData({
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      serviceName: '',
      serviceDescription: '',
      startTime: '',
      duration: 60,
      staffId: '',
      notes: '',
      status: 'pending',
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: Booking['status']) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'no-show':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading && bookings.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading bookings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                {dict?.admin?.bookingScheduling || 'Booking & Scheduling'}
              </h1>
              <p className="text-gray-600">{dict?.admin?.bookingSchedulingDescription || 'Manage appointments and bookings'}</p>
            </div>
            {bookingEnabled && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 border border-blue-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {dict?.admin?.newBooking || 'New Booking'}
              </button>
            )}
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        {!bookingEnabled && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-300 text-yellow-800">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                  Booking & Scheduling Not Available
                </h3>
                <p className="text-yellow-800">
                  Booking and scheduling is not enabled for {businessTypeConfig?.name || 'your business type'}. 
                  This feature is typically used for service businesses, salons, and laundry services.
                </p>
                <p className="text-sm text-yellow-700 mt-2">
                  If you need booking features, please enable it in Settings → Business or update your business type.
                </p>
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
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no-show">No Show</option>
          </select>
          <select
            value={filterStaff}
            onChange={(e) => setFilterStaff(e.target.value)}
            className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="all">All Staff</option>
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
            <h2 className="text-lg font-semibold text-gray-900">All Bookings</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Staff
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
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
                      <div className="text-sm text-gray-900">{formatDateTime(booking.startTime)}</div>
                      <div className="text-sm text-gray-500">Duration: {booking.duration} min</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {booking.staffName || booking.staffId?.name || dict?.admin?.unassigned || 'Unassigned'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${getStatusColor(booking.status)}`}>
                        {booking.status}
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
                          View
                        </button>
                        {booking.status === 'pending' || booking.status === 'confirmed' ? (
                          <button
                            onClick={() => handleSendReminder(booking._id)}
                            className="text-green-600 hover:text-green-900"
                          >
                            Remind
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
                No bookings found
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
              <h3 className="text-lg font-semibold text-gray-900">Booking Details</h3>
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
                <label className="block text-sm font-medium text-gray-700">Customer Name</label>
                <p className="mt-1 text-sm text-gray-900">{selectedBooking.customerName}</p>
              </div>
              {selectedBooking.customerEmail && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedBooking.customerEmail}</p>
                </div>
              )}
              {selectedBooking.customerPhone && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedBooking.customerPhone}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">Service</label>
                <p className="mt-1 text-sm text-gray-900">{selectedBooking.serviceName}</p>
                {selectedBooking.serviceDescription && (
                  <p className="mt-1 text-sm text-gray-500">{selectedBooking.serviceDescription}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Date & Time</label>
                <p className="mt-1 text-sm text-gray-900">{formatDateTime(selectedBooking.startTime)}</p>
                <p className="mt-1 text-sm text-gray-500">Duration: {selectedBooking.duration} minutes</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Staff</label>
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
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={selectedBooking.status}
                  onChange={(e) => {
                    handleUpdateBooking(selectedBooking._id, { status: e.target.value as Booking['status'] });
                  }}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no-show">No Show</option>
                </select>
              </div>
              {selectedBooking.notes && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Notes</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedBooking.notes}</p>
                </div>
              )}
              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleSendReminder(selectedBooking._id)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white hover:bg-green-700 transition-colors border border-green-700"
                >
                  Send Reminder
                </button>
                <button
                  onClick={() => handleDeleteBooking(selectedBooking._id)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 transition-colors border border-red-700"
                >
                  Delete
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
              <h3 className="text-lg font-semibold text-gray-900">Create New Booking</h3>
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
                <label className="block text-sm font-medium text-gray-700">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input
                  type="tel"
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Service Name *</label>
                <input
                  type="text"
                  required
                  value={formData.serviceName}
                  onChange={(e) => setFormData({ ...formData, serviceName: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Service Description</label>
                <textarea
                  value={formData.serviceDescription}
                  onChange={(e) => setFormData({ ...formData, serviceDescription: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Duration (minutes) *</label>
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
                <label className="block text-sm font-medium text-gray-700">Staff Member</label>
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
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Booking['status'] })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Notes</label>
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
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors border border-blue-700"
                >
                  Create Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

