import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

export interface TableFormData {
  name: string;
  capacity: string;
}

interface TableFormState {
  name: string;
  capacity: string;
}

export function useTableForm(isEdit: boolean = false) {
  const [formData, setFormData] = useState<TableFormState>({
    name: '',
    capacity: '',
  });
  const [error, setError] = useState('');

  const setFormFromTable = (table: { name: string; capacity?: number }) => {
    setFormData({
      name: table.name,
      capacity: table.capacity?.toString() || '',
    });
  };

  const resetForm = useCallback(() => {
    setFormData({ name: '', capacity: '' });
    setError('');
  }, []);

  const handleSubmit = useCallback(
    async (
      id: string | null,
      onSuccess?: () => void,
      onError?: (error: string) => void
    ) => {
      if (!formData.name.trim()) {
        const err = 'Table name is required';
        setError(err);
        return false;
      }

      if (formData.capacity) {
        const cap = parseInt(formData.capacity);
        if (isNaN(cap) || cap < 1 || cap > 100) {
          const err = 'Capacity must be 1–100';
          setError(err);
          return false;
        }
      }

      const method = isEdit && id ? 'PATCH' : 'POST';
      const url = isEdit && id ? `/api/tables/${id}` : '/api/tables';

      try {
        const payload = {
          name: formData.name.trim(),
          ...(formData.capacity && { capacity: parseInt(formData.capacity) }),
        };

        const res = await fetch(url, {
          method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (data.success) {
          if (onSuccess) onSuccess();
          resetForm();
          toast.success(isEdit ? 'Table updated' : 'Table created');
          return true;
        } else {
          const error = data.error || 'Failed to save table';
          setError(error);
          if (onError) onError(error);
          return false;
        }
      } catch (err: unknown) {
        const error = 'Error saving table';
        setError(error);
        if (onError) onError(error);
        return false;
      }
    },
    [formData, isEdit, resetForm]
  );

  return { formData, setFormData, setFormFromTable, error, handleSubmit, resetForm };
}
