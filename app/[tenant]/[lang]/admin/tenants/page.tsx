'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';
import { usePermissions } from '@/hooks/usePermissions';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  domain?: string | null;
  subdomain?: string | null;
  isActive: boolean;
  createdAt: string;
  settings: {
    currency: string;
    language: 'en' | 'es';
    email?: string | null;
    phone?: string | null;
    companyName?: string | null;
    businessType?: string | null;
  } | null;
}

const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

export default function TenantsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [tenantInfo, setTenantInfo] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { canAccess } = usePermissions();
  const canManage = canAccess('tenant_profile.edit');

  const fetchTenant = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Tenant-level admin: only the current tenant.
      const res = await fetch(`/api/tenants/${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setTenantInfo(data.data);
      } else {
        setError(data.error || 'Failed to load tenant');
      }
    } catch {
      setError('Failed to load tenant');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const notSet = <span className="text-gray-400">—</span>;

  const renderBody = () => {
    if (loading && !tenantInfo) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.common?.loading || 'Loading…'}</p>
        </div>
      );
    }

    if (error || !tenantInfo) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error || (dict.admin?.cannotEditTenant || 'Tenant information not available')}</p>
          <button
            type="button"
            onClick={() => fetchTenant()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    const s = tenantInfo.settings;
    const rows: [string, React.ReactNode][] = [
      [dict.admin?.name || 'Name', tenantInfo.name],
      [dict.admin?.slug || 'Slug', <span key="slug" className="font-mono text-xs">{tenantInfo.slug}</span>],
      [dict.admin?.companyName || 'Company Name', s?.companyName || notSet],
      [dict.admin?.businessType || 'Business Type', s?.businessType
        ? <span key="bt" className="px-2 py-0.5 text-xs font-semibold bg-brand text-white capitalize">{s.businessType}</span>
        : notSet],
      [dict.admin?.currency || 'Currency', <span key="cur" className="font-mono text-xs">{s?.currency || '—'}</span>],
      [dict.admin?.language || 'Language', s?.language === 'es' ? 'Español' : 'English'],
      [dict.admin?.domain || 'Domain', tenantInfo.domain ? <span key="dom" className="font-mono text-xs">{tenantInfo.domain}</span> : notSet],
      [dict.admin?.subdomain || 'Subdomain', tenantInfo.subdomain ? <span key="sub" className="font-mono text-xs">{tenantInfo.subdomain}</span> : notSet],
      [dict.admin?.email || 'Email', s?.email || notSet],
      [dict.admin?.phone || 'Phone', s?.phone || notSet],
      [dict.admin?.status || 'Status', (
        <span key="st" className={`px-2 py-0.5 text-xs font-semibold text-white ${tenantInfo.isActive ? 'bg-win8-success' : 'bg-win8-danger'}`}>
          {tenantInfo.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
        </span>
      )],
    ];

    return (
      <section className="bg-white border border-gray-300">
        <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">{dict.admin?.tenantInfo || 'Tenant Information'}</h2>
            <p className="text-sm text-gray-500">{dict.admin?.tenantInfoDesc || 'Your organization’s identity, locale and contact details'}</p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => { setFormKey((k) => k + 1); setShowForm(true); }}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
            >
              {dict.common?.edit || 'Edit'}
            </button>
          )}
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 divide-y divide-gray-200 sm:divide-y-0">
          {rows.map(([label, value]) => (
            <div key={label} className="px-6 py-3 sm:border-b sm:border-gray-200">
              <dt className="text-xs font-medium text-gray-500">{label}</dt>
              <dd className="mt-0.5 text-sm text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.tenants || 'Tenants'}
          description={dict.admin?.tenantsSubtitle || 'View and manage your organization settings'}
        />
        <div className="space-y-4">{renderBody()}</div>
      </div>

      <Win8Drawer open={showForm} onClose={() => setShowForm(false)}>
        {tenantInfo && (
          <TenantForm
            key={formKey}
            tenant={tenantInfo}
            dict={dict}
            onClose={() => setShowForm(false)}
            onSave={async () => {
              showToast.success(dict.admin?.tenantSaved || 'Tenant settings saved');
              setShowForm(false);
              await fetchTenant();
            }}
          />
        )}
      </Win8Drawer>
    </>
  );
}

function TenantForm({
  tenant,
  onClose,
  onSave,
  dict,
}: {
  tenant: Tenant;
  onClose: () => void;
  onSave: () => Promise<void>;
  dict: TranslationDict;
}) {
  const [formData, setFormData] = useState({
    name: tenant.name || '',
    domain: tenant.domain || '',
    subdomain: tenant.subdomain || '',
    currency: tenant.settings?.currency || 'USD',
    language: tenant.settings?.language || 'en',
    email: tenant.settings?.email || '',
    phone: tenant.settings?.phone || '',
    companyName: tenant.settings?.companyName || '',
    businessType: tenant.settings?.businessType || 'general',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [businessTypes, setBusinessTypes] = useState<{ type: string; name: string; description?: string }[]>([]);
  const [loadingBusinessTypes, setLoadingBusinessTypes] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/business-types');
        const data = await res.json();
        if (data.success) setBusinessTypes(data.data);
      } catch {
        // Falls back to the current type only (see the select below).
      } finally {
        setLoadingBusinessTypes(false);
      }
    })();
  }, []);

  const businessTypeChanged = formData.businessType !== (tenant.settings?.businessType || 'general');
  const selectedType = businessTypes.find((t) => t.type === formData.businessType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      // Always send every editable field. Empty strings are how a field gets
      // cleared — the API turns empty domain/subdomain into null. Omitting
      // (or sending undefined, which JSON drops) would leave the old value.
      const body = {
        name: formData.name,
        domain: formData.domain,
        subdomain: formData.subdomain,
        settings: {
          currency: formData.currency,
          language: formData.language,
          email: formData.email,
          phone: formData.phone,
          companyName: formData.companyName,
          businessType: formData.businessType,
        },
      };

      const res = await fetch(`/api/tenants/${tenant.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        await onSave();
      } else {
        setError(data.error || dict.admin?.failedToSaveTenant || 'Failed to save tenant');
      }
    } catch {
      setError(dict.admin?.failedToSaveTenant || 'Failed to save tenant');
    } finally {
      setSaving(false);
    }
  };

  const optional = <span className="text-gray-400 font-normal">({dict.common?.optional || 'optional'})</span>;

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
        <h2 className="text-base font-semibold">{dict.admin?.editTenant || 'Edit Tenant'}</h2>
        <button
          type="button"
          onClick={onClose}
          title={dict.common?.close || 'Close'}
          aria-label={dict.common?.close || 'Close'}
          className="text-white/70 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <label htmlFor="tenant-name" className={LABEL}>{dict.admin?.name || 'Name'} <span className="text-win8-danger">*</span></label>
            <input id="tenant-name" type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={INPUT} />
          </div>
          <div>
            <label htmlFor="tenant-company" className={LABEL}>{dict.admin?.companyName || 'Company Name'} {optional}</label>
            <input id="tenant-company" type="text" value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} className={INPUT} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="tenant-currency" className={LABEL}>{dict.admin?.currency || 'Currency'} <span className="text-win8-danger">*</span></label>
              <input
                id="tenant-currency"
                type="text"
                required
                maxLength={3}
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                className={`${INPUT} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="tenant-language" className={LABEL}>{dict.admin?.language || 'Language'}</label>
              <select
                id="tenant-language"
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value as 'en' | 'es' })}
                className={INPUT}
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="tenant-business-type" className={LABEL}>{dict.admin?.businessType || 'Business Type'} <span className="text-win8-danger">*</span></label>
            {loadingBusinessTypes ? (
              <div className="flex items-center gap-2 border border-gray-300 px-3 py-2 bg-gray-100">
                <span className="win8-spinner win8-spinner-sm text-brand"><span /><span /><span /><span /><span /></span>
                <span className="text-xs text-gray-600">{dict.settings?.loadingBusinessTypes || 'Loading business types…'}</span>
              </div>
            ) : (
              <select
                id="tenant-business-type"
                value={formData.businessType}
                onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                className={INPUT}
              >
                {businessTypes.length === 0 && <option value={formData.businessType}>{formData.businessType}</option>}
                {businessTypes.map((type) => (
                  <option key={type.type} value={type.type}>{type.name}</option>
                ))}
              </select>
            )}
            {selectedType?.description && <p className="text-xs text-gray-400 mt-1">{selectedType.description}</p>}
            {businessTypeChanged && (
              <div className="mt-2 p-3 bg-white border border-win8-warning text-win8-warning text-sm">
                {(dict.admin?.businessTypeWarning || 'Changing business type to "{type}" will automatically configure features. This may enable or disable certain features based on the business type.').replace('{type}', selectedType?.name || formData.businessType)}
              </div>
            )}
          </div>
          <hr className="border-gray-300" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="tenant-email" className={LABEL}>{dict.admin?.email || 'Email'} {optional}</label>
              <input id="tenant-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={INPUT} />
            </div>
            <div>
              <label htmlFor="tenant-phone" className={LABEL}>{dict.admin?.phone || 'Phone'} {optional}</label>
              <input id="tenant-phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="tenant-domain" className={LABEL}>{dict.admin?.domain || 'Domain'} {optional}</label>
              <input id="tenant-domain" type="text" value={formData.domain} onChange={(e) => setFormData({ ...formData, domain: e.target.value })} className={`${INPUT} font-mono`} />
            </div>
            <div>
              <label htmlFor="tenant-subdomain" className={LABEL}>{dict.admin?.subdomain || 'Subdomain'} {optional}</label>
              <input
                id="tenant-subdomain"
                type="text"
                value={formData.subdomain}
                onChange={(e) => setFormData({ ...formData, subdomain: e.target.value.toLowerCase() })}
                className={`${INPUT} font-mono`}
              />
            </div>
          </div>
          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors">
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors">
            {saving ? (dict.common?.saving || 'Saving…') : (dict.common?.save || 'Save')}
          </button>
        </div>
      </form>
    </>
  );
}
