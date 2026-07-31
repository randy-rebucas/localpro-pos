'use client';

import { useCallback, useState } from 'react';
import { DiscountFormData } from './useDiscountsForm';

export interface Discount {
  _id: string;
  code: string;
  name?: string;
  description?: string;
  type: 'percentage' | 'fixed';
  value: number;
  category?: 'general' | 'senior' | 'pwd' | 'employee' | 'promo';
  requiresIdVerification?: boolean;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  validFrom: string;
  validUntil: string;
  usageLimit?: number;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
}

interface UseDiscountsListReturn {
  discounts: Discount[];
  loading: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  fetchDiscounts: () => Promise<void>;
  /** Resolves `true` on success, or the server's specific error message on failure. */
  createDiscount: (form: DiscountFormData) => Promise<true | string>;
  /** Resolves `true` on success, or the server's specific error message on failure. */
  updateDiscount: (id: string, form: DiscountFormData) => Promise<true | string>;
  deleteDiscount: (id: string) => Promise<boolean>;
  toggleDiscountStatus: (id: string, isActive: boolean) => Promise<boolean>;
  clearMessage: () => void;
  setMessage: (message: { type: 'success' | 'error'; text: string } | null) => void;
}

export function useDiscountsList(): UseDiscountsListReturn {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchDiscounts = useCallback(async () => {
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const res = await fetch('/api/discounts', {
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.success) {
        setDiscounts(data.data || []);
        // Note: intentionally not clearing `message` here — callers commonly
        // set a success/error message right before triggering a refetch
        // (delete, toggle, save), and clearing it here would wipe that
        // feedback out from under them. Use clearMessage() explicitly instead.
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to fetch discounts' });
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Failed to fetch discounts:', error);
        setMessage({ type: 'error', text: 'Failed to fetch discounts' });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const createDiscount = useCallback(async (form: DiscountFormData) => {
    try {
      const res = await fetch('/api/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Discount created successfully' });
        return true;
      }
      const errorText = data.error || 'Failed to save discount';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    } catch {
      const errorText = 'Failed to save discount';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    }
  }, []);

  const updateDiscount = useCallback(async (id: string, form: DiscountFormData) => {
    try {
      const res = await fetch(`/api/discounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Discount updated successfully' });
        return true;
      }
      const errorText = data.error || 'Failed to update discount';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    } catch {
      const errorText = 'Failed to update discount';
      setMessage({ type: 'error', text: errorText });
      return errorText;
    }
  }, []);

  const deleteDiscount = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/discounts/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Discount deleted successfully' });
        return true;
      }
      setMessage({ type: 'error', text: data.error || 'Failed to delete discount' });
      return false;
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete discount' });
      return false;
    }
  }, []);

  const toggleDiscountStatus = useCallback(async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/discounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({
          type: 'success',
          text: isActive ? 'Discount activated successfully' : 'Discount deactivated successfully',
        });
        return true;
      }
      setMessage({ type: 'error', text: data.error || 'Failed to update discount' });
      return false;
    } catch {
      setMessage({ type: 'error', text: 'Failed to update discount' });
      return false;
    }
  }, []);

  const clearMessage = useCallback(() => setMessage(null), []);

  return {
    discounts,
    loading,
    message,
    fetchDiscounts,
    createDiscount,
    updateDiscount,
    deleteDiscount,
    toggleDiscountStatus,
    clearMessage,
    setMessage,
  };
}
