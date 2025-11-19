'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
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
  };
}

export default function TenantsPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchTenants();
  }, [lang, tenant]);

  const fetchTenants = async () => {
    try {
      const res = await fetch('/api/tenants', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setTenants(data.data);
    } catch (error) {
      console.error('Error fetching tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTenant = async (tenantSlug: string) => {
    if (!confirm('Are you sure you want to delete this tenant?')) return;
    try {
      const res = await fetch(`/api/tenants/${tenantSlug}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Tenant deleted successfully' });
        fetchTenants();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete tenant' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete tenant' });
    }
  };

  const handleToggleTenantStatus = async (tenant: Tenant) => {
    try {
      const res = await fetch(`/api/tenants/${tenant.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !tenant.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Tenant ${!tenant.isActive ? 'activated' : 'deactivated'} successfully` });
        fetchTenants();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update tenant' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update tenant' });
    }
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.tenants || 'Tenants'}
              </h1>
              <p className="text-gray-600">{dict.admin?.tenantsSubtitle || 'Manage multi-tenant organizations'}</p>
            </div>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin`)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {dict.common?.back || 'Back'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{dict.admin?.tenants || 'Tenants'}</h2>
            <button
              onClick={() => {
                setEditingTenant(null);
                setShowTenantModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              {dict.common?.add || 'Add'} {dict.admin?.tenant || 'Tenant'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.name || 'Name'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.slug || 'Slug'}</th>
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
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{tenantItem.settings.currency}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${tenantItem.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {tenantItem.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingTenant(tenantItem);
                            setShowTenantModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          {dict.common?.edit || 'Edit'}
                        </button>
                        <button
                          onClick={() => handleToggleTenantStatus(tenantItem)}
                          className={tenantItem.isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                        >
                          {tenantItem.isActive ? (dict.admin?.deactivate || 'Deactivate') : (dict.admin?.activate || 'Activate')}
                        </button>
                        <button
                          onClick={() => handleDeleteTenant(tenantItem.slug)}
                          className="text-red-600 hover:text-red-900"
                        >
                          {dict.common?.delete || 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tenants.length === 0 && (
              <div className="text-center py-8 text-gray-500">{dict.common?.noResults || 'No tenants found'}</div>
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
  dict: any;
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
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const url = tenant ? `/api/tenants/${tenant.slug}` : '/api/tenants';
      const method = tenant ? 'PUT' : 'POST';
      const body: any = {
        name: formData.name,
        currency: formData.currency,
        language: formData.language,
      };
      if (!tenant) {
        body.slug = formData.slug;
      }
      if (formData.domain) body.domain = formData.domain;
      if (formData.subdomain) body.subdomain = formData.subdomain;
      if (formData.email) body.email = formData.email;
      if (formData.phone) body.phone = formData.phone;
      if (formData.companyName) body.companyName = formData.companyName;

      if (tenant) {
        body.settings = {
          currency: formData.currency,
          language: formData.language,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          companyName: formData.companyName || undefined,
        };
      }

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
        setError(data.error || 'Failed to save tenant');
      }
    } catch (error) {
      setError('Failed to save tenant');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {tenant ? (dict.admin?.editTenant || 'Edit Tenant') : (dict.admin?.addTenant || 'Add Tenant')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!tenant && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.slug || 'Slug'} (lowercase, numbers, hyphens only)
                </label>
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  pattern="[a-z0-9-]+"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.name || 'Name'}
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.email || 'Email'} (optional)
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && (
              <div className="bg-red-50 text-red-800 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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

