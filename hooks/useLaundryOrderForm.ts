import { useCallback, useState } from 'react';

export interface LaundryOrderItemFormData {
  productId: string;
  name: string;
  tagNumber: string;
  weightKg: string;
  quantity: string;
  unitPrice: string;
  condition: string;
  notes: string;
}

export interface LaundryOrderFormData {
  branchId: string;
  transactionId: string;
  customerId: string;
  pricingMethod: 'weight' | 'item';
  totalWeightKg: string;
  notes: string;
  items: LaundryOrderItemFormData[];
}

const emptyItem: LaundryOrderItemFormData = {
  productId: '',
  name: '',
  tagNumber: '',
  weightKg: '',
  quantity: '1',
  unitPrice: '',
  condition: '',
  notes: '',
};

const emptyForm: LaundryOrderFormData = {
  branchId: '',
  transactionId: '',
  customerId: '',
  pricingMethod: 'item',
  totalWeightKg: '',
  notes: '',
  items: [{ ...emptyItem }],
};

export function useLaundryOrderForm(tenant: string) {
  const [formData, setFormData] = useState<LaundryOrderFormData>({ ...emptyForm, items: [{ ...emptyItem }] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      setError('');
      setSubmitting(true);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const res = await globalThis.fetch(`/api/laundry-orders?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            branchId: formData.branchId || undefined,
            transactionId: formData.transactionId || undefined,
            customerId: formData.customerId || undefined,
            pricingMethod: formData.pricingMethod,
            totalWeightKg: formData.totalWeightKg || undefined,
            notes: formData.notes || undefined,
            items: formData.items
              .filter((item) => item.name.trim())
              .map((item) => ({
                productId: item.productId || undefined,
                name: item.name,
                tagNumber: item.tagNumber || undefined,
                weightKg: item.weightKg || undefined,
                quantity: Number(item.quantity) || 1,
                unitPrice: Number(item.unitPrice) || 0,
                condition: item.condition || undefined,
                notes: item.notes || undefined,
              })),
          }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.(data.message || 'Laundry order created successfully');
        } else {
          const errorMsg = data.error || 'Failed to create laundry order';
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create laundry order';
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
        setSubmitting(false);
      }
    },
    [tenant, formData]
  );

  const addItem = useCallback(() => {
    setFormData((prev) => ({ ...prev, items: [...prev.items, { ...emptyItem }] }));
  }, []);

  const removeItem = useCallback((index: number) => {
    setFormData((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  }, []);

  const updateItem = useCallback((index: number, updates: Partial<LaundryOrderItemFormData>) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData({ ...emptyForm, items: [{ ...emptyItem }] });
    setError('');
  }, []);

  return { formData, setFormData, addItem, removeItem, updateItem, submitting, error, handleSubmit, resetForm };
}
