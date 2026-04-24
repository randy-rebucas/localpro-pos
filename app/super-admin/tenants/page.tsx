'use client';

import { useEffect, useState, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';
import { showToast } from '@/lib/toast';

interface Tenant {
  _id: string;
  slug: string;
  name: string;
  settings: {
    businessType?: string;
    currency: string;
    language: string;
    email?: string;
  };
  isActive: boolean;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface TenantFormData {
  slug: string;
  name: string;
  currency: string;
  language: string;
  businessType: string;
  email: string;
}

const defaultForm: TenantFormData = {
  slug: '',
  name: '',
  currency: 'PHP',
  language: 'en',
  businessType: 'general',
  email: '',
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState<TenantFormData>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (activeFilter) params.set('active', activeFilter);
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));
      const res = await fetch(`/api/super-admin/tenants?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setTenants(data.data);
        if (data.pagination) {
          setPagination(data.pagination);
        }
      } else {
        const errorMsg = data.error || 'Failed to load tenants';
        setError(errorMsg);
        showToast.error(errorMsg);
        setTenants([]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load tenants';
      setError(errorMsg);
      showToast.error(errorMsg);
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [search, activeFilter, pagination.page, pagination.limit]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const openCreate = () => {
    setEditingTenant(null);
    setFormData(defaultForm);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setFormData({
      slug: tenant.slug,
      name: tenant.name,
      currency: tenant.settings.currency || 'PHP',
      language: tenant.settings.language || 'en',
      businessType: tenant.settings.businessType || 'general',
      email: tenant.settings.email || '',
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const isCreate = !editingTenant;
      const url = isCreate
        ? '/api/super-admin/tenants'
        : `/api/super-admin/tenants/${editingTenant!.slug}`;
      const body = isCreate
        ? formData
        : {
            name: formData.name,
            settings: {
              currency: formData.currency,
              language: formData.language,
              businessType: formData.businessType,
              email: formData.email || undefined,
            },
          };

      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        showMsg('success', isCreate ? 'Tenant created' : 'Tenant updated');
        fetchTenants();
      } else {
        setFormError(data.error || 'Failed to save tenant');
      }
    } catch {
      setFormError('An error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (tenant: Tenant) => {
    const action = tenant.isActive ? 'deactivate' : 'activate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} tenant "${tenant.name}"?`)) return;
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenant.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !tenant.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', `Tenant ${!tenant.isActive ? 'activated' : 'deactivated'}`);
        fetchTenants();
      } else {
        showMsg('error', data.error || 'Failed to update status');
      }
    } catch {
      showMsg('error', 'Failed to update tenant status');
    }
  };

  return (
    <SuperAdminShell>
      <div className="p-6 w-full">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
            <p className="text-sm text-gray-500 mt-1">Manage all tenant accounts</p>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors whitespace-nowrap"
          >
            + New Tenant
          </button>
        </div>

        {message && (
          <div className={`mb-4 p-3 border text-sm ${message.type === 'success' ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-gray-200 px-4 py-3 flex flex-col sm:flex-row gap-3 mb-0 border-b-0">
          <input
            type="text"
            placeholder="Search by name or slug..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand bg-white w-full sm:w-64"
          />
          <select
            value={activeFilter}
            onChange={e => setActiveFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand bg-white"
          >
            <option value="">All statuses</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </select>
        </div>

        <div className="bg-white border border-gray-200">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin h-6 w-6 border-2 border-brand border-t-transparent rounded-full" />
              <p className="mt-3 text-gray-500 text-sm">Loading tenants...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <p className="text-red-600 text-sm font-medium">{error}</p>
              <button
                onClick={fetchTenants}
                className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover"
              >
                Retry
              </button>
            </div>
          ) : tenants.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              {search || activeFilter ? 'No tenants match your filters.' : 'No tenants yet. Create your first tenant.'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Name', 'Slug', 'Business Type', 'Currency', 'Status', 'Created', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tenants.map(tenant => (
                    <tr key={tenant._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">{tenant.name}</td>
                      <td className="px-4 py-4 text-sm text-gray-500 font-mono">{tenant.slug}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {tenant.settings.businessType ? (
                          <span className="px-2 py-0.5 text-xs bg-brand-soft text-brand-navy border border-teal-200 capitalize">
                            {tenant.settings.businessType}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">{tenant.settings.currency}</td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-0.5 text-xs font-semibold border ${tenant.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
                          {tenant.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {new Date(tenant.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="flex gap-3">
                          <button onClick={() => openEdit(tenant)} className="text-brand hover:text-brand-navy font-medium">
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(tenant)}
                            className={`font-medium ${tenant.isActive ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}
                          >
                            {tenant.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

              {/* Pagination */}
              <div className="border-t border-gray-200 px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="text-sm text-gray-500">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} tenants
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                    disabled={pagination.page === 1}
                    className="px-3 py-1 border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <div className="text-sm text-gray-600">
                    Page {pagination.page} of {pagination.pages}
                  </div>
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.pages, prev.page + 1) }))}
                    disabled={pagination.page >= pagination.pages}
                    className="px-3 py-1 border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-5">
                {editingTenant ? 'Edit Tenant' : 'Create New Tenant'}
              </h2>
              <form onSubmit={handleSave} className="space-y-4">
                {!editingTenant && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Slug <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.slug}
                      onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                      className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand bg-white"
                      placeholder="my-store"
                    />
                    <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, and hyphens only</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand bg-white"
                    placeholder="My Store"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                    <input
                      type="text"
                      value={formData.currency}
                      onChange={e => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                      maxLength={3}
                      className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand bg-white"
                      placeholder="PHP"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                    <select
                      value={formData.language}
                      onChange={e => setFormData({ ...formData, language: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand bg-white"
                    >
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Business Type</label>
                  <select
                    value={formData.businessType}
                    onChange={e => setFormData({ ...formData, businessType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand bg-white"
                  >
                    <option value="general">General</option>
                    <option value="retail">Retail</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="laundry">Laundry</option>
                    <option value="service">Service</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand bg-white"
                    placeholder="contact@mystore.com"
                  />
                </div>
                {formError && (
                  <div className="bg-red-50 border border-red-300 text-red-800 text-sm p-3">{formError}</div>
                )}
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : editingTenant ? 'Save Changes' : 'Create Tenant'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </SuperAdminShell>
  );
}
