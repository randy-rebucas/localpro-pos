import { useCallback, useState } from 'react';

export interface WorkOrderItemFormData {
  productId: string;
  name: string;
  itemType: 'part' | 'labor';
  price: string;
  quantity: string;
}

export interface WorkOrderFormData {
  branchId: string;
  transactionId: string;
  customerId: string;
  title: string;
  description: string;
  assignedToId: string;
  scheduledAt: string;
  notes: string;
  items: WorkOrderItemFormData[];
}

const emptyForm: WorkOrderFormData = {
  branchId: '',
  transactionId: '',
  customerId: '',
  title: '',
  description: '',
  assignedToId: '',
  scheduledAt: '',
  notes: '',
  items: [],
};

export const emptyWorkOrderItem: WorkOrderItemFormData = {
  productId: '',
  name: '',
  itemType: 'part',
  price: '',
  quantity: '1',
};

export function useWorkOrderForm(tenant: string) {
  const [formData, setFormData] = useState<WorkOrderFormData>({ ...emptyForm, items: [] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addItem = useCallback(() => {
    setFormData((prev) => ({ ...prev, items: [...prev.items, { ...emptyWorkOrderItem }] }));
  }, []);

  const removeItem = useCallback((index: number) => {
    setFormData((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  }, []);

  const updateItem = useCallback((index: number, updates: Partial<WorkOrderItemFormData>) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    }));
  }, []);

  const handleSubmit = useCallback(
    async (onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      setError('');
      setSubmitting(true);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const res = await globalThis.fetch(`/api/work-orders?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ...formData,
            branchId: formData.branchId || undefined,
            transactionId: formData.transactionId || undefined,
            customerId: formData.customerId || undefined,
            assignedToId: formData.assignedToId || undefined,
            scheduledAt: formData.scheduledAt || undefined,
            items: formData.items
              .filter((item) => item.name && item.price)
              .map((item) => ({
                productId: item.productId || undefined,
                name: item.name,
                itemType: item.itemType,
                price: Number(item.price),
                quantity: Number(item.quantity) || 1,
              })),
          }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.(data.message || 'Work order created successfully');
        } else {
          const errorMsg = data.error || 'Failed to create work order';
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create work order';
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
    setFormData({ ...emptyForm, items: [] });
    setError('');
  }, []);

  return { formData, setFormData, submitting, error, handleSubmit, resetForm, addItem, removeItem, updateItem };
}
