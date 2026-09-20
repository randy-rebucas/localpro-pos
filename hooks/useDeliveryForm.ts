import { useCallback, useState } from 'react';

export interface DeliveryFormData {
  branchId: string;
  transactionId: string;
  customerId: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZipCode: string;
  addressCountry: string;
  riderId: string;
  type: 'pickup' | 'delivery';
  scheduledAt: string;
  notes: string;
}

const emptyForm: DeliveryFormData = {
  branchId: '',
  transactionId: '',
  customerId: '',
  addressStreet: '',
  addressCity: '',
  addressState: '',
  addressZipCode: '',
  addressCountry: '',
  riderId: '',
  type: 'delivery',
  scheduledAt: '',
  notes: '',
};

export function useDeliveryForm(tenant: string) {
  const [formData, setFormData] = useState<DeliveryFormData>({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      setError('');
      setSubmitting(true);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const res = await globalThis.fetch(`/api/delivery?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ...formData,
            branchId: formData.branchId || undefined,
            transactionId: formData.transactionId || undefined,
            customerId: formData.customerId || undefined,
            riderId: formData.riderId || undefined,
            scheduledAt: formData.scheduledAt || undefined,
          }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.(data.message || 'Delivery order created successfully');
        } else {
          const errorMsg = data.error || 'Failed to create delivery order';
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create delivery order';
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
