'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { useTenantsList, type Tenant } from '@/hooks/useTenantsList';
import { useTenantForm } from '@/hooks/useTenantForm';
import {
  getTenantStatusColor,
  getTenantStatusLabel,
  formatBusinessType,
  formatCurrency,
  validateTenantForm,
} from '@/lib/tenants-helpers';

export default function TenantsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const { settings: tenantSettings } = useTenantSettings();
  const primaryColor = (tenantSettings || getDefaultTenantSettings()).primaryColor || '#2563eb';

  const listHook = useTenantsList(tenant);
  const formHook = useTenantForm(editingTenant, () => {
    listHook.fetchTenants();
    setShowTenantModal(false);
    setEditingTenant(null);
  });

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    listHook.fetchTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  if (!dict || listHook.loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div
            className="inline-block animate-spin h-8 w-8"
            style={{
              borderTop: `2px solid ${primaryColor}`,
              borderRight: `2px solid ${primaryColor}`,
              borderBottom: '2px solid transparent',
              borderLeft: `2px solid ${primaryColor}`,
              borderRadius: '50%',
            }}
          />
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center font-medium mb-4 transition-colors"
            style={{ color: primaryColor }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.tenants || 'Tenants'}
              </h1>
              <p className="text-gray-600">{dict.admin?.tenantsSubtitle || 'View and manage your organization settings'}</p>
            </div>
          </div>
        </div>

        {listHook.message && (
          <div className={`mb-6 p-4 border ${listHook.message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {listHook.message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{dict.admin?.tenantInfo || 'Tenant Information'}</h2>
            {listHook.tenants.length > 0 && (
              <button
                onClick={() => {
                  setEditingTenant(listHook.tenants[0]);
                  setShowTenantModal(true);
                }}
                className="px-4 py-2 text-white font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: primaryColor,
                  borderColor: primaryColor,
                  border: `1px solid ${primaryColor}`,
                }}
              >
                {dict.common?.edit || 'Edit'} {dict.admin?.settings || 'Settings'}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.name || 'Name'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.slug || 'Slug'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.businessType || 'Business Type'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.currency || 'Currency'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {listHook.tenants.map((t) => (
                  <tr key={t._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{t.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{t.slug}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatBusinessType(t.settings?.businessType || '')}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatCurrency(t.settings?.currency || '')}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className="px-2 py-1 rounded text-white text-xs font-medium"
                        style={{ backgroundColor: getTenantStatusColor(t.isActive) }}
                      >
                        {getTenantStatusLabel(t.isActive, dict)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => {
                          setEditingTenant(t);
                          formHook.reset();
                          setShowTenantModal(true);
                        }}
                        className="text-white px-3 py-1 rounded text-sm transition-opacity hover:opacity-80"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {dict.common?.edit || 'Edit'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showTenantModal && editingTenant && (
        <TenantModal
          tenant={editingTenant}
          onClose={() => {
            setShowTenantModal(false);
            setEditingTenant(null);
          }}
          dict={dict}
          primaryColor={primaryColor}
          formHook={formHook}
        />
      )}
    </div>
  );
}

interface TenantModalProps {
  tenant: Tenant;
  onClose: () => void;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  primaryColor: string;
  formHook: ReturnType<typeof useTenantForm>;
}

function TenantModal({ tenant, onClose, dict, primaryColor, formHook }: TenantModalProps) {
  useEffect(() => {
    formHook.setTenant(tenant);
  }, [tenant, formHook]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    formHook.updateField(name, value);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validation = validateTenantForm(
      formHook.slug,
      formHook.name,
      formHook.currency
    );

    if (!validation.valid) {
      alert(`Validation errors:\n${validation.errors.join('\n')}`);
      return;
    }

    await formHook.saveTenant();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-screen overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-900">{dict.common?.edit || 'Edit'} Tenant</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-1">
              {dict.admin?.name || 'Name'} <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              name="name"
              value={formHook.name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-900 mb-1">
              {dict.admin?.slug || 'Slug'} <span className="text-red-500">*</span>
            </label>
            <input
              id="slug"
              type="text"
              name="slug"
              value={formHook.slug}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
            />
            <p className="text-xs text-gray-500 mt-1">{dict.admin?.slugHint || 'Slug cannot be changed'}</p>
          </div>

          <div>
            <label htmlFor="businessType" className="block text-sm font-medium text-gray-900 mb-1">
              {dict.admin?.businessType || 'Business Type'} <span className="text-red-500">*</span>
            </label>
            <select
              id="businessType"
              name="businessType"
              value={formHook.businessType}
              onChange={handleChange}
              disabled={formHook.businessTypesLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            >
              <option value="">
                {formHook.businessTypesLoading
                  ? dict.common?.loading || 'Loading...'
                  : dict.common?.select || 'Select...'}
              </option>
              {formHook.businessTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {formHook.businessTypeWarning && (
              <p className="text-xs text-amber-600 mt-1">{formHook.businessTypeWarning}</p>
            )}
          </div>

          <div>
            <label htmlFor="domain" className="block text-sm font-medium text-gray-900 mb-1">
              {dict.admin?.domain || 'Domain'}
            </label>
            <input
              id="domain"
              type="text"
              name="domain"
              value={formHook.domain}
              onChange={handleChange}
              placeholder="example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label htmlFor="subdomain" className="block text-sm font-medium text-gray-900 mb-1">
              {dict.admin?.subdomain || 'Subdomain'}
            </label>
            <input
              id="subdomain"
              type="text"
              name="subdomain"
              value={formHook.subdomain}
              onChange={handleChange}
              placeholder="subdomain"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-gray-900 mb-1">
              {dict.admin?.currency || 'Currency'} <span className="text-red-500">*</span>
            </label>
            <select
              id="currency"
              name="currency"
              value={formHook.currency}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            >
              <option value="">{dict.common?.select || 'Select...'}</option>
              {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'BRL', 'INR', 'COP', 'ARS'].map((curr) => (
                <option key={curr} value={curr}>
                  {curr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="language" className="block text-sm font-medium text-gray-900 mb-1">
              {dict.admin?.language || 'Language'} <span className="text-red-500">*</span>
            </label>
            <select
              id="language"
              name="language"
              value={formHook.language}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            >
              <option value="en">{dict.admin?.english || 'English'}</option>
              <option value="es">{dict.admin?.spanish || 'Spanish'}</option>
            </select>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-900 mb-1">
              {dict.common?.email || 'Email'}
            </label>
            <input
              id="email"
              type="email"
              name="email"
              value={formHook.email}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-900 mb-1">
              {dict.common?.phone || 'Phone'}
            </label>
            <input
              id="phone"
              type="tel"
              name="phone"
              value={formHook.phone}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label htmlFor="companyName" className="block text-sm font-medium text-gray-900 mb-1">
              {dict.admin?.companyName || 'Company Name'}
            </label>
            <input
              id="companyName"
              type="text"
              name="companyName"
              value={formHook.companyName}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div className="flex gap-4 pt-6">
            <button
              type="submit"
              disabled={formHook.isSaving}
              className="flex-1 px-4 py-2 text-white font-medium rounded transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: primaryColor }}
            >
              {formHook.isSaving ? dict.common?.saving || 'Saving...' : dict.common?.save || 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 font-medium border border-gray-300 rounded hover:bg-gray-50"
            >
              {dict.common?.cancel || 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

