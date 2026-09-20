import { useCallback, useState } from 'react';

export interface DepositFormData {
  bookingId: string;
  workOrderId: string;
  customerId: string;
  amount: string;
  method: 'cash' | 'card' | 'digital' | 'check' | 'other' | 'on_account';
  notes: string;
  markPaid: boolean;
}

const emptyForm: DepositFormData = {
  bookingId: '',
  workOrderId: '',
  customerId: '',
  amount: '',
  method: 'cash',
  notes: '',
  markPaid: false,
};

export function useDepositForm(tenant: string) {
  const [formData, setFormData] = useState<DepositFormData>({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      setError('');
      setSubmitting(true);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const res = await globalThis.fetch(`/api/deposits?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            bookingId: formData.bookingId || undefined,
            workOrderId: formData.workOrderId || undefined,
            customerId: formData.customerId || undefined,
            amount: Number(formData.amount),
            method: formData.method,
            notes: formData.notes || undefined,
            markPaid: formData.markPaid,
          }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.(data.message || 'Deposit recorded successfully');
        } else {
          const errorMsg = data.error || 'Failed to record deposit';
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to record deposit';
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
