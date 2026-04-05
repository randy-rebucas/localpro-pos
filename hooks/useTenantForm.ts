import { useCallback, useEffect, useState } from 'react';
import type { Tenant } from './useTenantsList';

export interface BusinessType {
  type: string;
  name: string;
  description?: string;
}

interface FormState {
  slug: string;
  name: string;
  domain: string;
  subdomain: string;
  currency: string;
  language: 'en' | 'es';
  email: string;
  phone: string;
  companyName: string;
  businessType: string;
}

export function useTenantForm(tenant: Tenant | null, onSuccess: () => void) {
  const [formState, setFormState] = useState<FormState>({
    slug: tenant?.slug || '',
    name: tenant?.name || '',
    domain: tenant?.domain || '',
    subdomain: tenant?.subdomain || '',
    currency: tenant?.settings.currency || 'USD',
    language: tenant?.settings.language || 'en',
    email: tenant?.settings.email || '',
    phone: tenant?.settings.phone || '',
    companyName: tenant?.settings.companyName || '',
    businessType: tenant?.settings.businessType || 'general',
  });

  const [businessTypes, setBusinessTypes] = useState<string[]>([]);
  const [businessTypesLoading, setBusinessTypesLoading] = useState(true);
  const [businessTypeWarning, setBusinessTypeWarning] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadBusinessTypes();
  }, []);

  const loadBusinessTypes = async () => {
    try {
      setBusinessTypesLoading(true);
      const res = await fetch('/api/business-types');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        // Extract type strings from objects or use as-is if they're already strings
        const types = data.data.map((item: { type?: string } | string) => 
          typeof item === 'string' ? item : (item.type || '')
        );
        setBusinessTypes(types);
      }
    } catch (err) {
      console.error('Failed to load business types:', err);
    } finally {
      setBusinessTypesLoading(false);
    }
  };

  const setTenant = useCallback((newTenant: Tenant | null) => {
    if (newTenant) {
      setFormState({
        slug: newTenant.slug || '',
        name: newTenant.name || '',
        domain: newTenant.domain || '',
        subdomain: newTenant.subdomain || '',
        currency: newTenant.settings.currency || 'USD',
        language: newTenant.settings.language || 'en',
        email: newTenant.settings.email || '',
        phone: newTenant.settings.phone || '',
        companyName: newTenant.settings.companyName || '',
        businessType: newTenant.settings.businessType || 'general',
      });
      setBusinessTypeWarning(null);
    }
  }, []);

  const updateField = useCallback(
    (key: string, value: unknown) => {
      if (key === 'businessType' && typeof value === 'string') {
        const oldType = tenant?.settings.businessType;
        if (value !== oldType) {
          setBusinessTypeWarning(
            `Changing business type to "${value}" will automatically configure features. This may enable or disable certain features based on the business type.`
          );
        } else {
          setBusinessTypeWarning(null);
        }
        setFormState((prev) => ({
          ...prev,
          [key]: value,
        }));
      } else {
        setFormState((prev) => ({
          ...prev,
          [key]: value,
        }));
      }
    },
    [tenant?.settings.businessType]
  );

  const saveTenant = useCallback(async () => {
    if (!tenant) {
      return;
    }

    setIsSaving(true);

    try {
      const url = `/api/tenants/${tenant.slug}`;
      const body: Record<string, unknown> = {
        name: formState.name,
        settings: {
          currency: formState.currency,
          language: formState.language,
          email: formState.email || undefined,
          phone: formState.phone || undefined,
          companyName: formState.companyName || undefined,
          businessType: formState.businessType || undefined,
        },
      };

      if (formState.domain) body.domain = formState.domain;
      if (formState.subdomain) body.subdomain = formState.subdomain;

      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        setIsSaving(false);
        onSuccess();
      } else {
        setIsSaving(false);
      }
    } catch (error) {
      setIsSaving(false);
    }
  }, [tenant, formState, onSuccess]);

  const reset = useCallback(() => {
    if (tenant) {
      setTenant(tenant);
    }
  }, [tenant, setTenant]);

  return {
    // Form state as individual properties
    slug: formState.slug,
    name: formState.name,
    domain: formState.domain,
    subdomain: formState.subdomain,
    currency: formState.currency,
    language: formState.language,
    email: formState.email,
    phone: formState.phone,
    companyName: formState.companyName,
    businessType: formState.businessType,
    // State properties
    businessTypes,
    businessTypesLoading,
    businessTypeWarning,
    isSaving,
    // Methods
    setTenant,
    updateField,
    saveTenant,
    reset,
  };
}
