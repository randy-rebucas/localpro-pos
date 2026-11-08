'use client';

import { isLegalDiscountCode, LOCKED_LEGAL_DISCOUNT_FIELDS } from '@/lib/legal-discounts';
import { useState, useCallback } from 'react';
import { Discount } from './useDiscountsList';
import { getTenantDateString, toTenantDateString, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';
import { useMessages } from '@/hooks/useMessages';

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
  handleSubmit: (onSubmit: (data: DiscountFormData) => Promise<true | string>) => Promise<void>;
  resetForm: () => void;
  initializeForm: (discount: Discount) => void;
}

/** A blank form running from today for 30 days, as days at the store. */
const emptyForm = (tz: string): DiscountFormData => ({
  code: '',
  name: '',
  description: '',
  type: 'percentage',
  value: 0,
  category: 'general',
  requiresIdVerification: false,
  minPurchaseAmount: 0,
  maxDiscountAmount: 0,
  validFrom: getTenantDateString(tz),
  validUntil: getTenantDateString(tz, -30),
  usageLimit: 0,
  isActive: true,
});

export function useDiscountsForm(timezone: string = DEFAULT_TENANT_TIMEZONE): UseDiscountsFormReturn {
  const t = useMessages();
  const [formData, setFormDataState] = useState<DiscountFormData>(() => emptyForm(timezone));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setFormData = useCallback((data: Partial<DiscountFormData>) => {
    setFormDataState(prev => ({ ...prev, ...data }));
  }, []);

  const resetForm = useCallback(() => {
    setFormDataState(emptyForm(timezone));
    setError('');
  }, [timezone]);

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
      validFrom: toTenantDateString(discount.validFrom, timezone),
      validUntil: toTenantDateString(discount.validUntil, timezone),
      usageLimit: discount.usageLimit || 0,
      isActive: discount.isActive,
    });
    setError('');
  }, [timezone]);

  const handleSubmit = useCallback(
    async (onSubmit: (data: DiscountFormData) => Promise<true | string>) => {
      setError('');

      // Validate required fields
      if (!formData.code.trim()) {
        setError(t('admin.discountCodeRequired', 'Code is required'));
        return;
      }
      if (!formData.value) {
        setError(t('admin.discountValueRequired', 'Value is required'));
        return;
      }

      setSubmitting(true);
      try {
        const payload: DiscountFormData = {
          code: formData.code.toUpperCase(),
          name: formData.name || '',
          description: formData.description || '',
          type: formData.type,
          value: formData.value,
          category: formData.category,
          requiresIdVerification: formData.requiresIdVerification,
          minPurchaseAmount: formData.minPurchaseAmount > 0 ? formData.minPurchaseAmount : 0,
          maxDiscountAmount: formData.maxDiscountAmount > 0 ? formData.maxDiscountAmount : 0,
          validFrom: formData.validFrom,
          validUntil: formData.validUntil,
          usageLimit: formData.usageLimit > 0 ? formData.usageLimit : 0,
          isActive: formData.isActive,
        };

        // SC20 / PWD20 are fixed by law; only the wording is sent for them
        if (isLegalDiscountCode(payload.code)) {
          for (const field of LOCKED_LEGAL_DISCOUNT_FIELDS) delete (payload as Partial<DiscountFormData>)[field];
        }

        const result = await onSubmit(payload);
        if (result !== true) {
          setError(result);
        }
      } catch {
        setError(t('common.errorWhileSaving', 'An error occurred while saving'));
      } finally {
        setSubmitting(false);
      }
    },
    [formData, t]
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
