import { useCallback, useState } from 'react';
import type { Branch } from './useBranchesList';

export interface BranchFormData {
  name: string;
  code?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  managerId?: string;
}

export function useBranchForm(branchToEdit?: Branch | null) {
  const [formData, setFormData] = useState<BranchFormData>({
    name: branchToEdit?.name || '',
    code: branchToEdit?.code || '',
    address: {
      street: branchToEdit?.address?.street || '',
      city: branchToEdit?.address?.city || '',
      state: branchToEdit?.address?.state || '',
      zipCode: branchToEdit?.address?.zipCode || '',
      country: branchToEdit?.address?.country || '',
    },
    phone: branchToEdit?.phone || '',
    email: branchToEdit?.email || '',
    managerId:
      typeof branchToEdit?.managerId === 'object' && branchToEdit?.managerId !== null
        ? branchToEdit.managerId._id
        : branchToEdit?.managerId || '',
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
        const url = branchToEdit ? `/api/branches/${branchToEdit._id}` : '/api/branches';
        const method = branchToEdit ? 'PUT' : 'POST';
        const body: Record<string, unknown> = {
          name: formData.name,
          code: formData.code || undefined,
          address:
            formData.address?.street || formData.address?.city
              ? formData.address
              : undefined,
          phone: formData.phone || undefined,
          email: formData.email || undefined,
          managerId: formData.managerId || undefined,
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
          onSuccess?.(data.message || `Branch ${branchToEdit ? 'updated' : 'created'} successfully`);
        } else {
          const errorMsg = data.error || `Failed to ${branchToEdit ? 'update' : 'create'} branch`;
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : `Failed to ${branchToEdit ? 'update' : 'create'} branch`;
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
        setSubmitting(false);
      }
    },
    [branchToEdit, formData]
  );

  const resetForm = useCallback(() => {
    setFormData({
      name: branchToEdit?.name || '',
      code: branchToEdit?.code || '',
      address: {
        street: branchToEdit?.address?.street || '',
        city: branchToEdit?.address?.city || '',
        state: branchToEdit?.address?.state || '',
        zipCode: branchToEdit?.address?.zipCode || '',
        country: branchToEdit?.address?.country || '',
      },
      phone: branchToEdit?.phone || '',
      email: branchToEdit?.email || '',
      managerId:
        typeof branchToEdit?.managerId === 'object' && branchToEdit?.managerId !== null
          ? branchToEdit.managerId._id
          : branchToEdit?.managerId || '',
    });
    setError('');
  }, [branchToEdit]);

  return { formData, setFormData, submitting, error, handleSubmit, resetForm };
}
