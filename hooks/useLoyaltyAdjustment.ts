'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface AdjustmentForm {
  points: string;
  description: string;
}

export const useLoyaltyAdjustment = (customerId: string) => {
  const [form, setForm] = useState<AdjustmentForm>({
    points: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateForm = useCallback((updates: Partial<AdjustmentForm>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  }, []);

  const submitAdjustment = useCallback(async () => {
    const points = parseInt(form.points);

    // Validation
    if (!points || points === 0) {
      return { success: false, error: 'Enter a non-zero point value' };
    }
    if (!form.description.trim()) {
      return { success: false, error: 'Description is required' };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      abortControllerRef.current = controller;

      setSaving(true);

      const res = await fetch('/api/loyalty/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ customerId, points, description: form.description }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const json = await res.json();

      if (json.success) {
        setForm({ points: '', description: '' });
        return { success: true };
      } else {
        return { success: false, error: json.error || 'Adjustment failed' };
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error adjusting points:', error);
        return { success: false, error: 'Adjustment failed' };
      }
      return { success: false, error: 'Request cancelled' };
    } finally {
      setSaving(false);
    }
  }, [customerId, form]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    form,
    saving,
    updateForm,
    submitAdjustment,
  };
};
