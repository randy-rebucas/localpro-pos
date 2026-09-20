import { useCallback, useState } from 'react';

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
  collectDeposit: boolean;
  depositAmount: string;
  depositMethod: 'cash' | 'card' | 'digital' | 'check' | 'other' | 'on_account';
}

const emptyForm: BookingFormData = {
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
  collectDeposit: false,
  depositAmount: '',
  depositMethod: 'cash',
};

export function useBookingForm(tenant: string) {
  const [formData, setFormData] = useState<BookingFormData>({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      setError('');
      setSubmitting(true);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const { collectDeposit, depositAmount, depositMethod, ...bookingPayload } = formData;
        const res = await globalThis.fetch(`/api/bookings?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(bookingPayload),
          signal: controller.signal,
        });

        const data = await res.json();

        if (!data.success) {
          const errorMsg = data.error || 'Failed to create booking';
          setError(errorMsg);
          onError?.(errorMsg);
          return;
        }

        let message = data.message || 'Booking created successfully';

        // Collecting a deposit is best-effort: the booking itself already
        // succeeded, so a deposit failure here is surfaced but doesn't undo it.
        if (collectDeposit && depositAmount && Number(depositAmount) > 0 && data.data?.id) {
          try {
            const depositRes = await globalThis.fetch(`/api/deposits?tenant=${tenant}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                bookingId: data.data.id,
                amount: Number(depositAmount),
                method: depositMethod,
                markPaid: true,
              }),
              signal: controller.signal,
            });
            const depositData = await depositRes.json();
            if (!depositData.success) {
              message += ` (deposit not recorded: ${depositData.error || 'unknown error'})`;
            }
          } catch {
            message += ' (deposit not recorded: request failed)';
          }
        }

        onSuccess?.(message);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create booking';
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
        setSubmitting(false);
      }
    },
    [tenant, formData]
  );

  const resetForm = useCallback(() => {
    setFormData({ ...emptyForm });
    setError('');
  }, []);

  return { formData, setFormData, submitting, error, handleSubmit, resetForm };
}
