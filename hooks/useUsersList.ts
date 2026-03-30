import { useCallback, useState } from 'react';

export interface User {
  _id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'cashier' | 'viewer';
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  qrToken?: string;
}

export function useUsersList() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await globalThis.fetch('/api/users', {
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setUsers(data.data);
      } else {
        const errorMsg = data.error || 'Failed to fetch users';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch users';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  const deleteUser = useCallback(
    async (userId: string, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await globalThis.fetch(`/api/users/${userId}`, {
          method: 'DELETE',
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          await fetchUsers();
          onSuccess?.(data.message || 'User deleted successfully');
        } else {
          const errorMsg = data.error || 'Failed to delete user';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to delete user';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [fetchUsers]
  );

  const toggleUserStatus = useCallback(
    async (user: User, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const res = await globalThis.fetch(`/api/users/${user._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ isActive: !user.isActive }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          await fetchUsers();
          const newStatus = !user.isActive ? 'activated' : 'deactivated';
          onSuccess?.(`User ${newStatus} successfully`);
        } else {
          const errorMsg = data.error || 'Failed to update user';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update user';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [fetchUsers]
  );

  return { users, loading, error, fetchUsers, deleteUser, toggleUserStatus };
}
