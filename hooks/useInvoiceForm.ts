import { useCallback, useState } from 'react';

export interface InvoiceLineItem {
  name: string;
  description: string;
  quantity: string;
  price: string;
}

export interface InvoiceFormData {
  customerId: string;
  dueDate: string;
  paymentTerms: string;
  notes: string;
  items: InvoiceLineItem[];
}

const emptyItem: InvoiceLineItem = { name: '', description: '', quantity: '1', price: '' };

const emptyForm: InvoiceFormData = {
  customerId: '',
  dueDate: '',
  paymentTerms: 'Due on receipt',
  notes: '',
  items: [{ ...emptyItem }],
};

export function invoiceFormSubtotal(items: InvoiceLineItem[]): number {
  return items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    return sum + qty * price;
  }, 0);
}

export function useInvoiceForm() {
  const [formData, setFormData] = useState<InvoiceFormData>({ ...emptyForm, items: [{ ...emptyItem }] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addItem = useCallback(() => {
    setFormData((f) => ({ ...f, items: [...f.items, { ...emptyItem }] }));
  }, []);

  const removeItem = useCallback((index: number) => {
    setFormData((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  }, []);

  const updateItem = useCallback((index: number, updates: Partial<InvoiceLineItem>) => {
    setFormData((f) => ({
      ...f,
      items: f.items.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    }));
  }, []);

  const handleSubmit = useCallback(
    async (onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      setError('');

      const validItems = formData.items.filter((i) => i.name.trim() && Number(i.price) >= 0 && Number(i.quantity) > 0);
      if (validItems.length === 0) {
        const msg = 'At least one line item with a name, quantity, and price is required';
        setError(msg);
        onError?.(msg);
        return;
      }
      if (!formData.dueDate) {
        const msg = 'Due date is required';
        setError(msg);
        onError?.(msg);
        return;
      }

      setSubmitting(true);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const items = validItems.map((i) => {
          const quantity = Number(i.quantity);
          const price = Number(i.price);
          return {
            name: i.name.trim(),
            description: i.description.trim() || undefined,
            quantity,
            price,
            subtotal: quantity * price,
          };
        });
        const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);

        const res = await globalThis.fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            customerId: formData.customerId || undefined,
            items,
            subtotal,
            dueDate: formData.dueDate,
            paymentTerms: formData.paymentTerms || undefined,
            notes: formData.notes || undefined,
          }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.('Invoice created successfully');
        } else {
          const errorMsg = data.error || 'Failed to create invoice';
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create invoice';
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
        setSubmitting(false);
      }
    },
    [formData]
  );

  const resetForm = useCallback(() => {
    setFormData({ ...emptyForm, items: [{ ...emptyItem }] });
    setError('');
  }, []);

  return { formData, setFormData, submitting, error, addItem, removeItem, updateItem, handleSubmit, resetForm };
}
