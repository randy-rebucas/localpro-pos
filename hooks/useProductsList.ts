import { useCallback, useRef, useState } from 'react';

export interface Product {
  _id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  sku?: string;
  barcode?: string;
  category?: string;
  categoryId?: {
    _id: string;
    name: string;
  } | string;
  image?: string;
  productType: 'regular' | 'bundle' | 'service';
  hasVariations: boolean;
  variations?: Record<string, unknown>[];
  trackInventory: boolean;
  lowStockThreshold?: number;
  createdAt: string;
  modifiers?: Array<{
    name: string;
    options: Array<{ name: string; price: number }>;
    required: boolean;
  }>;
  allergens?: string[];
  nutritionInfo?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  serviceType?: 'wash' | 'dry-clean' | 'press' | 'repair' | 'other';
  weightBased?: boolean;
  pickupDelivery?: boolean;
  estimatedDuration?: number;
  serviceDuration?: number;
  staffRequired?: number;
  equipmentRequired?: string[];
}

export interface Category {
  _id: string;
  name: string;
}

export const useProductsList = (_tenant: string) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchProducts = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/products', { credentials: 'include', signal: controller.signal });
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to fetch products' });
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessage({ type: 'error', text: 'Failed to fetch products' });
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/categories', { credentials: 'include', signal: controller.signal });
      const data = await res.json();
      if (data.success) {
        setCategories(data.data);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error fetching categories:', error);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const deleteProduct = useCallback(async (productId: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'DELETE',
        credentials: 'include',
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.success) {
        setProducts((prev) => prev.filter((p) => p._id !== productId));
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to delete product' };
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        return { success: false, error: 'Failed to delete product' };
      }
      return { success: false, error: 'Request timeout' };
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const updateMessage = useCallback((msg: { type: 'success' | 'error'; text: string } | null) => {
    setMessage(msg);
  }, []);

  return {
    products,
    categories,
    loading,
    message,
    fetchProducts,
    fetchCategories,
    deleteProduct,
    updateMessage,
  };
};
