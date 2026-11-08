import { useCallback, useState } from 'react';
import { tenantWallTimeToDate } from '@/lib/timezone';

export interface BookingFormData {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceName: string;
  serviceDescription: string;
  startTime: string;
  duration: number;
  staffId: string;
  notes: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
}

/** `timeZone` is the store's: the picked start time is read as a time there. */
export function useBookingForm(tenant: string, timeZone?: string) {
  const [formData, setFormData] = useState<BookingFormData>({
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      setError('');
      setSubmitting(true);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const res = await globalThis.fetch(`/api/bookings?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ...formData,
            startTime: formData.startTime ? tenantWallTimeToDate(formData.startTime, timeZone).toISOString() : '',
            staffId: formData.staffId || undefined,
          }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.(data.message || 'Booking created successfully');
        } else {
          const errorMsg = data.error || 'Failed to create booking';
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create booking';
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
        setSubmitting(false);
      }
    },
    [tenant, formData, timeZone]
  );

  const resetForm = useCallback(() => {
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
    setError('');
  }, []);

  return { formData, setFormData, submitting, error, handleSubmit, resetForm };
}
