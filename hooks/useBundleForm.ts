import { useCallback, useState } from 'react';
import type { Bundle, BundleItem } from './useBundlesList';

export interface BundleFormData {
  name: string;
  description?: string;
  price: number;
  sku?: string;
  categoryId?: string;
  trackInventory: boolean;
  items: BundleItem[];
}

export function useBundleForm(bundleToEdit?: Bundle | null) {
  const [formData, setFormData] = useState<BundleFormData>({
    name: bundleToEdit?.name || '',
    description: bundleToEdit?.description || '',
    price: bundleToEdit?.price || 0,
    sku: bundleToEdit?.sku || '',
    categoryId:
      typeof bundleToEdit?.categoryId === 'object' && bundleToEdit?.categoryId !== null
        ? bundleToEdit.categoryId._id
        : bundleToEdit?.categoryId || '',
    trackInventory: bundleToEdit?.trackInventory !== undefined ? bundleToEdit.trackInventory : true,
    items: bundleToEdit?.items || [],
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      setError('');
      
      if (formData.items.length === 0) {
        const errMsg = 'At least one item is required';
        setError(errMsg);
        onError?.(errMsg);
        return;
      }

      setSubmitting(true);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const url = bundleToEdit ? `/api/bundles/${bundleToEdit._id}` : '/api/bundles';
        const method = bundleToEdit ? 'PUT' : 'POST';
        const body = {
          name: formData.name,
          description: formData.description || undefined,
          price: formData.price,
          sku: formData.sku || undefined,
          categoryId: formData.categoryId || undefined,
          trackInventory: formData.trackInventory,
          items: formData.items.map((item) => ({
            productId: typeof item.productId === 'object' ? item.productId._id : item.productId,
            productName: item.productName,
            quantity: item.quantity,
            variation: item.variation,
          })),
        };

        const res = await globalThis.fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.(data.message || `Bundle ${bundleToEdit ? 'updated' : 'created'} successfully`);
        } else {
          const errorMsg = data.error || `Failed to ${bundleToEdit ? 'update' : 'create'} bundle`;
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : `Failed to ${bundleToEdit ? 'update' : 'create'} bundle`;
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
        setSubmitting(false);
      }
    },
    [bundleToEdit, formData]
  );

  const resetForm = useCallback(() => {
    setFormData({
      name: bundleToEdit?.name || '',
      description: bundleToEdit?.description || '',
      price: bundleToEdit?.price || 0,
      sku: bundleToEdit?.sku || '',
      categoryId:
        typeof bundleToEdit?.categoryId === 'object' && bundleToEdit?.categoryId !== null
          ? bundleToEdit.categoryId._id
          : bundleToEdit?.categoryId || '',
      trackInventory: bundleToEdit?.trackInventory !== undefined ? bundleToEdit.trackInventory : true,
      items: bundleToEdit?.items || [],
    });
    setError('');
  }, [bundleToEdit]);

  return { formData, setFormData, error, submitting, handleSubmit, resetForm };
}
