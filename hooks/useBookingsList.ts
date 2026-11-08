import { useCallback, useState } from 'react';
import { useMessages } from '@/hooks/useMessages';

export interface Booking {
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

interface BookingFilters {
  status: string;
  staffId: string;
}

export function useBookingsList(tenant: string, filters: BookingFilters) {
  const t = useMessages();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const fetchBookings = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      let url = `/api/bookings?tenant=${tenant}`;
      if (filters.status !== 'all') {
        url += `&status=${filters.status}`;
      }
      if (filters.staffId !== 'all') {
        url += `&staffId=${filters.staffId}`;
      }

      const res = await globalThis.fetch(url, {
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setBookings(data.data || []);
        setTruncated(!!data.truncated);
      } else {
        const errorMsg = data.error || t('common.failedToFetchBookings', 'Failed to fetch bookings');
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error && err.name === 'AbortError'
        ? t('common.requestTimedOut', 'The request timed out. Please try again.')
        : t('common.failedToFetchBookings', 'Failed to fetch bookings');
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [tenant, filters.status, filters.staffId, t]);

  const deleteBooking = useCallback(
    async (bookingId: string, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/bookings/${bookingId}?tenant=${tenant}`, {
          method: 'DELETE',
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          await fetchBookings();
          onSuccess?.(data.message || t('common.bookingDeletedSuccess', 'Booking deleted successfully'));
        } else {
          const errorMsg = data.error || t('common.failedToDeleteBooking', 'Failed to delete booking');
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error && err.name === 'AbortError'
          ? t('common.requestTimedOut', 'The request timed out. Please try again.')
          : t('common.failedToDeleteBooking', 'Failed to delete booking');
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchBookings, t]
  );

  const sendReminder = useCallback(
    async (bookingId: string, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/bookings/${bookingId}/reminder?tenant=${tenant}`, {
          method: 'POST',
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.(data.message || t('common.reminderSentSuccess', 'Reminder sent successfully'));
        } else {
          const errorMsg = data.error || t('common.failedToSendReminder', 'Failed to send reminder');
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error && err.name === 'AbortError'
          ? t('common.requestTimedOut', 'The request timed out. Please try again.')
          : t('common.failedToSendReminder', 'Failed to send reminder');
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, t]
  );

  return { bookings, loading, error, truncated, fetchBookings, deleteBooking, sendReminder };
}
