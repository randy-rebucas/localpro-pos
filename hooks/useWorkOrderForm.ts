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
  collectDeposit: boolean;
  depositAmount: string;
  depositMethod: 'cash' | 'card' | 'digital' | 'check' | 'other' | 'on_account';
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
  collectDeposit: false,
  depositAmount: '',
  depositMethod: 'cash',
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
        const { collectDeposit, depositAmount, depositMethod } = formData;
        const res = await globalThis.fetch(`/api/work-orders?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            branchId: formData.branchId || undefined,
            transactionId: formData.transactionId || undefined,
            customerId: formData.customerId || undefined,
            title: formData.title,
            description: formData.description,
            assignedToId: formData.assignedToId || undefined,
            scheduledAt: formData.scheduledAt || undefined,
            notes: formData.notes,
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

        if (!data.success) {
          const errorMsg = data.error || 'Failed to create work order';
          setError(errorMsg);
          onError?.(errorMsg);
          return;
        }

        let message = data.message || 'Work order created successfully';

        // Collecting a deposit is best-effort: the work order itself already
        // succeeded, so a deposit failure here is surfaced but doesn't undo it.
        if (collectDeposit && depositAmount && Number(depositAmount) > 0 && data.data?.id) {
          try {
            const depositRes = await globalThis.fetch(`/api/deposits?tenant=${tenant}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                workOrderId: data.data.id,
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
