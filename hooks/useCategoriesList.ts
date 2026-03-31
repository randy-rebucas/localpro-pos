import { useCallback, useState } from 'react';

export interface Category {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

export function useCategoriesList() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await globalThis.fetch('/api/categories', {
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setCategories(data.data || []);
      } else {
        const errorMsg = data.error || 'Failed to fetch categories';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch categories';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  const deleteCategory = useCallback(
    async (categoryId: string, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/categories/${categoryId}`, {
          method: 'DELETE',
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          setCategories((prev) => prev.filter((c) => c._id !== categoryId));
          onSuccess?.(data.message || 'Category deleted successfully');
        } else {
          const errorMsg = data.error || 'Failed to delete category';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to delete category';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    []
  );

  const toggleCategoryStatus = useCallback(
    async (categoryId: string, newStatus: boolean, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/categories/${categoryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ isActive: newStatus }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          setCategories((prev) =>
            prev.map((c) => (c._id === categoryId ? { ...c, isActive: newStatus } : c))
          );
          onSuccess?.(data.message || 'Category status updated successfully');
        } else {
          const errorMsg = data.error || 'Failed to update category status';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update category status';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    []
  );

  return { categories, loading, error, fetchCategories, deleteCategory, toggleCategoryStatus };
}
