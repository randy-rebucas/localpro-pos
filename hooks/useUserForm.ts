import { useCallback, useState } from 'react';

export interface UserFormData {
  email: string;
  name: string;
  password: string;
  role: 'owner' | 'admin' | 'manager' | 'cashier' | 'viewer';
}

export interface User {
  _id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'cashier' | 'viewer';
  isActive: boolean;
}

export function useUserForm(editingUser: User | null) {
  const [formData, setFormData] = useState<UserFormData>({
    email: editingUser?.email || '',
    name: editingUser?.name || '',
    password: '',
    role: editingUser?.role || 'cashier',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (onSuccess?: () => void, onError?: (error: string) => void) => {
      setError('');
      setSaving(true);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const url = editingUser ? `/api/users/${editingUser._id}` : '/api/users';
        const method = editingUser ? 'PUT' : 'POST';

        const body: any = {
          email: formData.email,
          name: formData.name,
          role: formData.role,
        };

        if (!editingUser || formData.password) {
          body.password = formData.password;
        }

        const res = await globalThis.fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.();
        } else {
          const errorMsg = data.error || 'Failed to save user';
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to save user';
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
        setSaving(false);
      }
    },
    [editingUser, formData]
  );

  const resetForm = useCallback(() => {
    setFormData({
      email: editingUser?.email || '',
      name: editingUser?.name || '',
      password: '',
      role: editingUser?.role || 'cashier',
    });
    setError('');
  }, [editingUser]);

  return { formData, setFormData, saving, error, handleSubmit, resetForm };
}
