'use client';

import { useState, useCallback } from 'react';
import type { Customer } from '@/types/customer';

export interface CustomerFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  tags: string;
  notes: string;
  /** Empty string = no credit limit */
  creditLimit: string;
}

interface UseCustomersFormReturn {
  formData: CustomerFormData;
  setFormData: (data: Partial<CustomerFormData>) => void;
  error: string;
  submitting: boolean;
  handleSubmit: (onSubmit: (data: CustomerFormData) => Promise<boolean>) => Promise<void>;
  resetForm: () => void;
  initializeForm: (customer: Customer) => void;
}

export function useCustomersForm(): UseCustomersFormReturn {
  const [formData, setFormDataState] = useState<CustomerFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    tags: '',
    notes: '',
    creditLimit: '',
  });

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setFormData = useCallback((data: Partial<CustomerFormData>) => {
    setFormDataState(prev => ({ ...prev, ...data }));
  }, []);

  const resetForm = useCallback(() => {
    setFormDataState({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      tags: '',
      notes: '',
      creditLimit: '',
    });
    setError('');
  }, []);

  const initializeForm = useCallback((customer: Customer) => {
    setFormDataState({
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      tags: (customer.tags || []).join(', '),
      notes: customer.notes ?? '',
      creditLimit:
        customer.creditLimit != null && !Number.isNaN(Number(customer.creditLimit))
          ? String(customer.creditLimit)
          : '',
    });
    setError('');
  }, []);

  const handleSubmit = useCallback(
    async (onSubmit: (data: CustomerFormData) => Promise<boolean>) => {
      setError('');

      // Validate required fields
      if (!formData.firstName.trim()) {
        setError('First name is required');
        return;
      }
      if (!formData.lastName.trim()) {
        setError('Last name is required');
        return;
      }

      setSubmitting(true);
      try {
        const success = await onSubmit(formData);
        if (!success) {
          setError('Failed to save customer');
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
