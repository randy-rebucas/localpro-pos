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

export type BookingUpdate = Omit<Partial<Booking>, 'staffId'> & {
  /** null unassigns: undefined would be dropped from the request and change nothing. */
  staffId?: string | null;
};

export function useBookingDetail(tenant: string, bookingId: string) {
  const t = useMessages();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateBooking = useCallback(
    async (updates: BookingUpdate, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      setUpdating(true);
      setError(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/bookings/${bookingId}?tenant=${tenant}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.(data.message || t('common.bookingUpdatedSuccess', 'Booking updated successfully'));
        } else {
          const errorMsg = data.error || t('common.failedToUpdateBooking', 'Failed to update booking');
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error && err.name === 'AbortError'
          ? t('common.requestTimedOut', 'The request timed out. Please try again.')
          : t('common.failedToUpdateBooking', 'Failed to update booking');
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
        setUpdating(false);
      }
    },
    [tenant, bookingId, t]
  );

  return { updating, error, updateBooking };
}
