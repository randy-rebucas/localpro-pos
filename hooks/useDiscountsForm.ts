'use client';

import { useState, useCallback } from 'react';
import { Discount } from './useDiscountsList';

export interface DiscountFormData {
  code: string;
  name: string;
  description: string;
  type: 'percentage' | 'fixed';
  value: number;
  category: 'general' | 'senior' | 'pwd' | 'employee' | 'promo';
  requiresIdVerification: boolean;
  minPurchaseAmount: number;
  maxDiscountAmount: number;
  validFrom: string;
  validUntil: string;
  usageLimit: number;
  isActive: boolean;
}

interface UseDiscountsFormReturn {
  formData: DiscountFormData;
  setFormData: (data: Partial<DiscountFormData>) => void;
  error: string;
  submitting: boolean;
  handleSubmit: (onSubmit: (data: any) => Promise<boolean>) => Promise<void>;
  resetForm: () => void;
  initializeForm: (discount: Discount) => void;
}

const emptyForm: DiscountFormData = {
  code: '',
  name: '',
  description: '',
  type: 'percentage',
  value: 0,
  category: 'general',
  requiresIdVerification: false,
  minPurchaseAmount: 0,
  maxDiscountAmount: 0,
  validFrom: new Date().toISOString().split('T')[0],
  validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  usageLimit: 0,
  isActive: true,
};

export function useDiscountsForm(): UseDiscountsFormReturn {
  const [formData, setFormDataState] = useState<DiscountFormData>(emptyForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setFormData = useCallback((data: Partial<DiscountFormData>) => {
    setFormDataState(prev => ({ ...prev, ...data }));
  }, []);

  const resetForm = useCallback(() => {
    setFormDataState(emptyForm);
    setError('');
  }, []);

  const initializeForm = useCallback((discount: Discount) => {
    setFormDataState({
      code: discount.code,
      name: discount.name || '',
      description: discount.description || '',
      type: discount.type,
      value: discount.value,
      category: discount.category || 'general',
      requiresIdVerification: discount.requiresIdVerification || false,
      minPurchaseAmount: discount.minPurchaseAmount || 0,
      maxDiscountAmount: discount.maxDiscountAmount || 0,
      validFrom: new Date(discount.validFrom).toISOString().split('T')[0],
      validUntil: new Date(discount.validUntil).toISOString().split('T')[0],
      usageLimit: discount.usageLimit || 0,
      isActive: discount.isActive,
    });
    setError('');
  }, []);

  const handleSubmit = useCallback(
    async (onSubmit: (data: any) => Promise<boolean>) => {
      setError('');

      // Validate required fields
      if (!formData.code.trim()) {
        setError('Code is required');
        return;
      }
      if (!formData.value) {
        setError('Value is required');
        return;
      }

      setSubmitting(true);
      try {
        const payload = {
          code: formData.code.toUpperCase(),
          name: formData.name || undefined,
          description: formData.description || undefined,
          type: formData.type,
          value: formData.value,
          category: formData.category,
          requiresIdVerification: formData.requiresIdVerification,
          minPurchaseAmount: formData.minPurchaseAmount > 0 ? formData.minPurchaseAmount : undefined,
          maxDiscountAmount: formData.maxDiscountAmount > 0 ? formData.maxDiscountAmount : undefined,
          validFrom: new Date(formData.validFrom),
          validUntil: new Date(formData.validUntil),
          usageLimit: formData.usageLimit > 0 ? formData.usageLimit : undefined,
          isActive: formData.isActive,
        };

        const success = await onSubmit(payload);
        if (!success) {
          setError('Failed to save discount');
        }
      } catch {
        setError('An error occurred while saving');
      } finally {
        setSubmitting(false);
      }
    },
    [formData]
  );

  return {
    formData,
    setFormData,
    error,
    submitting,
    handleSubmit,
    resetForm,
    initializeForm,
  };
}
