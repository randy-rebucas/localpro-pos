'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Building2, Globe, Pencil } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  ICON, DARK_KEY_PRIMARY, HINT, INPUT, KEY, KEY_PRIMARY, LABEL,
  RegisterPage, Sheet, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { isBusinessTypeSelectable } from '@/lib/business-types';
import { formatDate } from '@/lib/formatting';
import { usePermissions } from '@/hooks/usePermissions';

type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Tenant {
  _id: string;
  slug: string;
  name: string;
  domain?: string;
  subdomain?: string;
  isActive: boolean;
  createdAt: string;
  settings: {
    currency: string;
    language: 'en' | 'es';
    email?: string;
    phone?: string;
    companyName?: string;
    businessType?: string;
  };
}

interface BusinessTypeOption {
  type: string;
  name: string;
  description?: string;
}

/** The store's own profile: this page only ever shows and edits the current tenant. */
export default function TenantsPage() {
  const params = useParams();
  const slug = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(false);
  const [businessTypes, setBusinessTypes] = useState<BusinessTypeOption[]>([]);
  const [businessTypesState, setBusinessTypesState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const { settings } = useTenantSettings();
  const { canAccess } = usePermissions();
  const canManage = canAccess('tenant_profile.manage');

  const t = (key: string, fallback: string): string => dict?.admin?.[key] || fallback;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const fetchTenant = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenants/${slug}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.data?.settings) {
        setTenant(data.data);
        setLoadError('');
      } else {
        setLoadError(data.error || '');
      }
    } catch {
      setLoadError('');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  // Loaded once for both the tile (type name) and the edit sheet
  useEffect(() => {
    let cancelled = false;
    fetch('/api/business-types')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && Array.isArray(data.data)) {
          setBusinessTypes(data.data);
          setBusinessTypesState('ready');
        } else {
          setBusinessTypesState('failed');
        }
      })
      .catch(() => {
        if (!cancelled) setBusinessTypesState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!dict || loading) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const notSet = t('notSet', 'Not set');
  const typeName = (type?: string) => (type ? businessTypes.find((b) => b.type === type)?.name || type : notSet);
  const languageName = (code?: string) => (code === 'es' ? 'Español' : code === 'en' ? 'English' : notSet);
  const hosts = tenant ? [tenant.domain, tenant.subdomain ? `${tenant.subdomain}.*` : ''].filter(Boolean) : [];

  return (
    <RegisterPage
      tagNo="TN"
      tag={settings?.companyName || tenant?.name}
      title={t('tenantInfo', 'Tenant Information')}
      subtitle={t('tenantProfileSubtitle', 'Your store’s name, web address, currency and contact details')}
    >
      {canManage && tenant && (
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={() => setEditing(true)} className={DARK_KEY_PRIMARY}>
            <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
            {t('editTenant', 'Edit Tenant')}
          </button>
        </div>
      )}

      {!tenant ? (
        <div className="mt-6">
          <div className="bg-paper-white px-4 py-14 text-center text-ink">
            <Building2 className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
            <p className="font-receipt text-sm text-ink/60">
              {loadError || dict.common?.noData || 'No tenant information available'}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {/* The store, printed like the head of its own receipt */}
          <div className="min-w-0 text-ink">
            <div className="bg-paper-white">
              <div className={`flex items-center justify-between gap-2 px-4 py-1.5 font-receipt text-[11px] font-medium uppercase tracking-[0.08em] ${tenant.isActive ? 'bg-brand text-ink' : 'bg-stamp text-paper-white'}`}>
                <span>{typeName(tenant.settings.businessType)}</span>
                <span>{tenant.isActive ? t('active', 'Active') : t('inactive', 'Inactive')}</span>
              </div>
              <div className="px-4 pb-4 pt-3">
                <h2 className="break-words font-display text-4xl font-bold uppercase leading-none sm:text-5xl">{tenant.name}</h2>
                {tenant.settings.companyName && tenant.settings.companyName !== tenant.name && (
                  <p className="mt-1 text-sm text-ink/70">{tenant.settings.companyName}</p>
                )}
                <div className="mt-3 space-y-1 border-t border-dashed border-ink/30 pt-3 font-receipt text-xs">
                  <ReceiptRow label={t('slug', 'Slug')} value={tenant.slug} />
                  <ReceiptRow label={t('currency', 'Currency')} value={tenant.settings.currency || notSet} />
                  <ReceiptRow label={t('language', 'Language')} value={languageName(tenant.settings.language)} />
                  {tenant.createdAt && settings && (
                    <ReceiptRow label={t('storeSince', 'Since')} value={formatDate(tenant.createdAt, settings)} />
                  )}
                </div>
              </div>
            </div>
            <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
          </div>

          {/* How customers reach the store */}
          <div className="min-w-0 text-ink">
            <div className="bg-paper-white">
              <div className="flex items-center gap-2 bg-ink/10 px-4 py-1.5 font-receipt text-[11px] font-medium uppercase tracking-[0.08em] text-ink/70">
                <Globe className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                <span>{t('contactAndAddress', 'Contact & web address')}</span>
              </div>
              <div className="space-y-1 px-4 py-4 font-receipt text-xs">
                <ReceiptRow label={t('domain', 'Domain')} value={tenant.domain || notSet} />
                <ReceiptRow label={t('subdomain', 'Subdomain')} value={tenant.subdomain || notSet} />
                <ReceiptRow
                  label={t('email', 'Email')}
                  value={<span className="block max-w-[14rem] truncate" title={tenant.settings.email}>{tenant.settings.email || notSet}</span>}
                />
                <ReceiptRow label={t('phone', 'Phone')} value={tenant.settings.phone || notSet} />
                {hosts.length === 0 && (
                  <p className={HINT}>{t('noCustomHost', 'No custom domain or subdomain: the store is reached through its link.')}</p>
                )}
              </div>
            </div>
            <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
          </div>
        </div>
      )}

      {editing && tenant && (
        <TenantSheet
          tenant={tenant}
          businessTypes={businessTypes}
          businessTypesState={businessTypesState}
          dict={dict}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast.success(t('tenantSaved', 'Store details saved'));
            fetchTenant();
          }}
        />
      )}
    </RegisterPage>
  );
}

function TenantSheet({
  tenant,
  businessTypes,
  businessTypesState,
  dict,
  onClose,
  onSaved,
}: {
  tenant: Tenant;
  businessTypes: BusinessTypeOption[];
  businessTypesState: 'loading' | 'ready' | 'failed';
  dict: Dict;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = (key: string, fallback: string): string => dict?.admin?.[key] || fallback;
  const optional = t('optionalField', 'optional');
  const [formData, setFormData] = useState({
    name: tenant.name || '',
    domain: tenant.domain || '',
    subdomain: tenant.subdomain || '',
    currency: tenant.settings.currency || 'PHP',
    language: tenant.settings.language || 'en',
    email: tenant.settings.email || '',
    phone: tenant.settings.phone || '',
    companyName: tenant.settings.companyName || '',
    // The tenant's own type; never a guessed default the user didn't pick
    businessType: tenant.settings.businessType || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (patch: Partial<typeof formData>) => setFormData((prev) => ({ ...prev, ...patch }));
  const typesReady = businessTypesState === 'ready';
  const choices = businessTypes.filter((type) => isBusinessTypeSelectable(type.type, tenant.settings.businessType));
  const chosen = businessTypes.find((type) => type.type === formData.businessType);
  const typeChanged = !!formData.businessType && formData.businessType !== tenant.settings.businessType;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      const body = {
        name: formData.name,
        settings: {
          currency: formData.currency,
          language: formData.language,
          // '' clears a field; undefined would be dropped and keep the old value
          email: formData.email,
          phone: formData.phone,
          companyName: formData.companyName,
          // Only sent once the list loaded and a type is picked, so a failed
          // list can't change the store's type behind the user's back
          businessType: typesReady && formData.businessType ? formData.businessType : undefined,
        },
        domain: formData.domain,
        subdomain: formData.subdomain,
      };

      const res = await fetch(`/api/tenants/${tenant.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        onSaved();
      } else {
        setError(data.error || t('failedToSaveTenant', 'Failed to save tenant'));
      }
    } catch {
      setError(t('failedToSaveTenant', 'Failed to save tenant'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={t('editTenant', 'Edit Tenant')}
      subtitle={tenant.slug}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" form="tenant-form" disabled={saving} className={KEY_PRIMARY}>
            {saving ? (dict.common?.saving || 'Saving...') : (dict.common?.save || 'Save')}
          </button>
        </>
      }
    >
      <form id="tenant-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="tenant-name" className={LABEL}>{t('name', 'Name')} *</label>
          <input
            id="tenant-name"
            type="text"
            required
            maxLength={120}
            value={formData.name}
            onChange={(e) => update({ name: e.target.value })}
            className={INPUT}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tenant-domain" className={LABEL}>{t('domain', 'Domain')} ({optional})</label>
            <input
              id="tenant-domain"
              type="text"
              inputMode="url"
              autoComplete="off"
              placeholder="shop.example.com"
              value={formData.domain}
              onChange={(e) => update({ domain: e.target.value.trim().toLowerCase() })}
              className={`${INPUT} font-receipt`}
            />
          </div>
          <div>
            <label htmlFor="tenant-subdomain" className={LABEL}>{t('subdomain', 'Subdomain')} ({optional})</label>
            <input
              id="tenant-subdomain"
              type="text"
              autoComplete="off"
              value={formData.subdomain}
              onChange={(e) => update({ subdomain: e.target.value.trim().toLowerCase() })}
              className={`${INPUT} font-receipt`}
            />
          </div>
        </div>
        <p className={HINT}>{t('hostHint', 'Leave empty to remove. Letters, numbers and hyphens only.')}</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tenant-currency" className={LABEL}>{t('currency', 'Currency')} *</label>
            <input
              id="tenant-currency"
              type="text"
              required
              minLength={3}
              maxLength={3}
              pattern="[A-Za-z]{3}"
              value={formData.currency}
              onChange={(e) => update({ currency: e.target.value.toUpperCase() })}
              className={`${INPUT} font-receipt uppercase tracking-[0.08em]`}
            />
          </div>
          <div>
            <label htmlFor="tenant-language" className={LABEL}>{t('language', 'Language')}</label>
            <select
              id="tenant-language"
              value={formData.language}
              onChange={(e) => update({ language: e.target.value as 'en' | 'es' })}
              className={INPUT}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="tenant-type" className={LABEL}>{t('businessType', 'Business Type')}</label>
          {businessTypesState === 'loading' ? (
            <div className={`${INPUT} flex items-center gap-2 text-ink/60`}>
              <LoadingSpinner size="sm" />
              <span className="font-receipt text-xs">{dict.settings?.loadingBusinessTypes || 'Loading business types...'}</span>
            </div>
          ) : (
            <select
              id="tenant-type"
              value={formData.businessType}
              disabled={!typesReady}
              onChange={(e) => update({ businessType: e.target.value })}
              className={INPUT}
              aria-describedby="tenant-type-hint"
            >
              {!formData.businessType && <option value="">{t('notSet', 'Not set')}</option>}
              {!typesReady && formData.businessType && (
                <option value={formData.businessType}>{formData.businessType}</option>
              )}
              {choices.map((type) => (
                <option key={type.type} value={type.type}>{type.name}</option>
              ))}
            </select>
          )}
          <div id="tenant-type-hint">
            {businessTypesState === 'failed' && (
              <p className={HINT}>{t('businessTypesUnavailable', 'Business types could not be loaded, so the type stays as it is.')}</p>
            )}
            {typesReady && chosen?.description && <p className={HINT}>{chosen.description}</p>}
          </div>
          {typesReady && typeChanged && (
            <div className="mt-2">
              <Strip tone="error">
                {t('businessTypeWarning', 'Changing business type to "{type}" will automatically configure features. This may enable or disable certain features based on the business type.')
                  .replace('{type}', chosen?.name || formData.businessType)}
              </Strip>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-dashed border-ink/30 pt-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tenant-email" className={LABEL}>{t('email', 'Email')} ({optional})</label>
            <input
              id="tenant-email"
              type="email"
              value={formData.email}
              onChange={(e) => update({ email: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="tenant-phone" className={LABEL}>{t('phone', 'Phone')} ({optional})</label>
            <input
              id="tenant-phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => update({ phone: e.target.value })}
              className={INPUT}
            />
          </div>
        </div>
        <div>
          <label htmlFor="tenant-company" className={LABEL}>{t('companyName', 'Company Name')} ({optional})</label>
          <input
            id="tenant-company"
            type="text"
            maxLength={200}
            value={formData.companyName}
            onChange={(e) => update({ companyName: e.target.value })}
            className={INPUT}
          />
        </div>

        {error && <Strip tone="error">{error}</Strip>}
      </form>
    </Sheet>
  );
}
