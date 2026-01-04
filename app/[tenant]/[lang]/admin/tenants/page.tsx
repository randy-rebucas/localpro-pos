'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';

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

export default function TenantsPage() {
  const params = useParams();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Record<string, unknown> | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [message, _setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  const fetchTenants = async () => {
    try {
      // Fetch current tenant only (tenant-level admin)
      const res = await fetch(`/api/tenants/${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        // Set as single-item array for consistency with existing UI
        setTenants([data.data]);
      }
    } catch (error) {
      console.error('Error fetching tenant:', error);
    } finally {
      setLoading(false);
    }
  };


  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition-colors"
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

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{dict.admin?.tenantInfo || 'Tenant Information'}</h2>
            {tenants.length > 0 && (
              <button
                onClick={() => {
                  setEditingTenant(tenants[0]);
                  setShowTenantModal(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium border border-blue-700"
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
              <tbody className="bg-white divide-y divide-gray-200">
                {tenants.map((tenantItem) => (
                  <tr key={tenantItem._id}>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{tenantItem.name}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{tenantItem.slug}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {tenantItem.settings.businessType ? (
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 border border-blue-300">
                          {tenantItem.settings.businessType}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{tenantItem.settings.currency}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${tenantItem.isActive ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'}`}>
                        {tenantItem.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          setEditingTenant(tenantItem);
                          setShowTenantModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        {dict.common?.edit || 'Edit'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tenants.length === 0 && (
              <div className="text-center py-8 text-gray-500">{dict.common?.noData || 'No tenant information available'}</div>
            )}
          </div>
        </div>

        {showTenantModal && (
          <TenantModal
            tenant={editingTenant}
            onClose={() => {
              setShowTenantModal(false);
              setEditingTenant(null);
            }}
            onSave={() => {
              fetchTenants();
              setShowTenantModal(false);
              setEditingTenant(null);
            }}
            dict={dict}
          />
        )}
      </div>
    </div>
  );
}

function TenantModal({
  tenant,
  onClose,
  onSave,
  dict,
}: {
  tenant: Tenant | null;
  onClose: () => void;
  onSave: () => void;
  dict: Record<string, unknown>;
}) {
  const [formData, setFormData] = useState({
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [businessTypes, setBusinessTypes] = useState<Array<Record<string, unknown>>>([]);
  const [loadingBusinessTypes, setLoadingBusinessTypes] = useState(true);
  const [businessTypeWarning, setBusinessTypeWarning] = useState<string | null>(null);

  useEffect(() => {
    loadBusinessTypes();
  }, []);

  const loadBusinessTypes = async () => {
    try {
      setLoadingBusinessTypes(true);
      const res = await fetch('/api/business-types');
      const data = await res.json();
      if (data.success) {
        setBusinessTypes(data.data);
      }
    } catch (err) {
      console.error('Failed to load business types:', err);
    } finally {
      setLoadingBusinessTypes(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      // Tenant-level: only allow editing current tenant
      if (!tenant) {
        setError(dict?.admin?.cannotEditTenant || 'Cannot edit: tenant information not available');
        return;
      }
      const url = `/api/tenants/${tenant.slug}`;
      const method = 'PUT';
      const body: Record<string, unknown> = {
        name: formData.name,
        settings: {
          currency: formData.currency,
          language: formData.language,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          companyName: formData.companyName || undefined,
          businessType: formData.businessType || undefined,
        },
      };
      if (formData.domain) body.domain = formData.domain;
      if (formData.subdomain) body.subdomain = formData.subdomain;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        onSave();
      } else {
        setError(data.error || dict?.admin?.failedToSaveTenant || 'Failed to save tenant');
      }
    } catch {
      setError(dict?.admin?.failedToSaveTenant || 'Failed to save tenant');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {tenant ? (dict.admin?.editTenant || 'Edit Tenant') : (dict.admin?.addTenant || 'Add Tenant')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.name || 'Name'}
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.domain || 'Domain'} (optional)
              </label>
              <input
                type="text"
                value={formData.domain}
                onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.subdomain || 'Subdomain'} (optional)
              </label>
              <input
                type="text"
                value={formData.subdomain}
                onChange={(e) => setFormData({ ...formData, subdomain: e.target.value.toLowerCase() })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.currency || 'Currency'}
              </label>
              <input
                type="text"
                required
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                maxLength={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.language || 'Language'}
              </label>
              <select
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value as 'en' | 'es' })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.businessType || 'Business Type'} <span className="text-red-500">*</span>
              </label>
              {loadingBusinessTypes ? (
                <div className="w-full px-3 py-2 border border-gray-300 bg-gray-50 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent animate-spin"></div>
                  <span className="text-xs text-gray-600">Loading business types...</span>
                </div>
              ) : (
                <>
                  <select
                    value={formData.businessType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      if (newType !== tenant?.settings.businessType) {
                        setBusinessTypeWarning(
                          `Changing business type to "${newType}" will automatically configure features. This may enable or disable certain features based on the business type.`
                        );
                      } else {
                        setBusinessTypeWarning(null);
                      }
                      setFormData({ ...formData, businessType: newType });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {businessTypes.map((type) => (
                      <option key={type.type} value={type.type}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                  {businessTypeWarning && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-300 text-yellow-800 text-xs">
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>{businessTypeWarning}</span>
                      </div>
                    </div>
                  )}
                  {formData.businessType && !loadingBusinessTypes && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200">
                      <p className="text-xs text-blue-900 font-medium mb-1">
                        {businessTypes.find((t) => t.type === formData.businessType)?.name || 'Business Type'}
                      </p>
                      <p className="text-xs text-blue-700">
                        {businessTypes.find((t) => t.type === formData.businessType)?.description || ''}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.email || 'Email'} (optional)
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.phone || 'Phone'} (optional)
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.companyName || 'Company Name'} (optional)
              </label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            {error && (
              <div className="bg-red-50 text-red-800 border border-red-300 p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 border border-blue-700"
              >
                {saving ? (dict.common?.loading || 'Saving...') : (dict.common?.save || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

