import { useCallback, useRef, useState } from 'react';
import type { TaxRule } from './useTaxRulesList';

interface FormState {
  name: string;
  rate: string;
  label: string;
  appliesTo: 'all' | 'products' | 'services' | 'categories';
  priority: string;
  isActive: boolean;
  country: string;
  state: string;
  city: string;
  zipCodes: string;
  loading: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function useTaxRuleForm(tenant: string, onSuccess: () => void) {
  const [editing, setEditing] = useState<TaxRule | null>(null);
  const [formState, setFormState] = useState<FormState>({
    name: '',
    rate: '0',
    label: 'Tax',
    appliesTo: 'all',
    priority: '0',
    isActive: true,
    country: '',
    state: '',
    city: '',
    zipCodes: '',
    loading: false,
    message: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const initializeForm = useCallback((rule: TaxRule | null) => {
    if (rule) {
      setEditing(rule);
      setFormState({
        name: rule.name,
        rate: rule.rate.toString(),
        label: rule.label,
        appliesTo: rule.appliesTo || 'all',
        priority: rule.priority.toString(),
        isActive: rule.isActive !== false,
        country: rule.region?.country || '',
        state: rule.region?.state || '',
        city: rule.region?.city || '',
        zipCodes: rule.region?.zipCodes?.join(', ') || '',
        loading: false,
        message: null,
      });
    } else {
      setEditing(null);
      setFormState({
        name: '',
        rate: '0',
        label: 'Tax',
        appliesTo: 'all',
        priority: '0',
        isActive: true,
        country: '',
        state: '',
        city: '',
        zipCodes: '',
        loading: false,
        message: null,
      });
    }
  }, []);

  const updateField = useCallback(
    <K extends keyof Omit<FormState, 'loading' | 'message'>>(key: K, value: FormState[K]) => {
      setFormState((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const saveRule = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    abortControllerRef.current = controller;

    try {
      setFormState((prev) => ({ ...prev, loading: true, message: null }));
      const url = `/api/tenants/${tenant}/tax-rules`;
      const method = editing ? 'PUT' : 'POST';
      const body = editing
        ? { id: editing.id, ...buildRulePayload() }
        : buildRulePayload();

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.success) {
        setFormState((prev) => ({
          ...prev,
          loading: false,
          message: {
            type: 'success',
            text: `Tax rule ${editing ? 'updated' : 'created'} successfully`,
          },
        }));
        setEditing(null);
        onSuccess();
      } else {
        setFormState((prev) => ({
          ...prev,
          loading: false,
          message: { type: 'error', text: data.error || 'Failed to save tax rule' },
        }));
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return;
      clearTimeout(timeoutId);
      setFormState((prev) => ({
        ...prev,
        loading: false,
        message: {
          type: 'error',
          text: error instanceof Error ? error.message : 'Failed to save tax rule',
        },
      }));
    }
  }, [tenant, editing, onSuccess]);

  const buildRulePayload = () => ({
    name: formState.name,
    rate: parseFloat(formState.rate),
    label: formState.label,
    appliesTo: formState.appliesTo,
    priority: parseInt(formState.priority) || 0,
    isActive: formState.isActive,
    region:
      formState.country || formState.state || formState.city || formState.zipCodes
        ? {
            country: formState.country || undefined,
            state: formState.state || undefined,
            city: formState.city || undefined,
            zipCodes: formState.zipCodes
              ? formState.zipCodes.split(',').map((z) => z.trim()).filter(Boolean)
              : undefined,
          }
        : undefined,
  });

  const clearMessage = useCallback(() => {
    setFormState((prev) => ({ ...prev, message: null }));
  }, []);

  const resetForm = useCallback(() => {
    initializeForm(null);
  }, [initializeForm]);

  return {
    editing,
    formState,
    initializeForm,
    updateField,
    saveRule,
    clearMessage,
    resetForm,
  };
}
