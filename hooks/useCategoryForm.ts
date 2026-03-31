import { useCallback, useState } from 'react';
import type { Category } from './useCategoriesList';

export interface CategoryFormData {
  name: string;
  description?: string;
}

export function useCategoryForm(categoryToEdit?: Category | null) {
  const [formData, setFormData] = useState<CategoryFormData>({
    name: categoryToEdit?.name || '',
    description: categoryToEdit?.description || '',
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
        const url = categoryToEdit ? `/api/categories/${categoryToEdit._id}` : '/api/categories';
        const method = categoryToEdit ? 'PUT' : 'POST';
        const body = {
          name: formData.name,
          description: formData.description || undefined,
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
          onSuccess?.(data.message || `Category ${categoryToEdit ? 'updated' : 'created'} successfully`);
        } else {
          const errorMsg = data.error || `Failed to ${categoryToEdit ? 'update' : 'create'} category`;
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : `Failed to ${categoryToEdit ? 'update' : 'create'} category`;
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
        setSubmitting(false);
      }
    },
    [categoryToEdit, formData]
  );

  const resetForm = useCallback(() => {
    setFormData({
      name: categoryToEdit?.name || '',
      description: categoryToEdit?.description || '',
    });
    setError('');
  }, [categoryToEdit]);

  return { formData, setFormData, error, submitting, handleSubmit, resetForm };
}
