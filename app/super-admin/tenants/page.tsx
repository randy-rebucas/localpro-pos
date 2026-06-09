'use client';

import { useEffect, useState, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';
import { showToast } from '@/lib/toast';

interface Tenant {
  _id: string;
  slug: string;
  name: string;
  settings: { businessType?: string; currency: string; language: string; email?: string; };
  isActive: boolean;
  onboardingStatus?: 'not_started' | 'in_progress' | 'complete';
  notes?: string;
  createdAt: string;
}

interface Pagination { page: number; limit: number; total: number; pages: number; }

interface TenantFormData {
  slug: string; name: string; currency: string; language: string;
  businessType: string; email: string;
  ownerEmail: string; ownerName: string; trialDays: string;
  notes: string;
}

const defaultForm: TenantFormData = {
  slug: '', name: '', currency: 'PHP', language: 'en',
  businessType: 'general', email: '',
  ownerEmail: '', ownerName: '', trialDays: '14',
  notes: '',
};

const ONBOARDING_BADGE: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-500 border-gray-200',
  in_progress: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  complete: 'bg-green-50 text-green-700 border-green-200',
};
const ONBOARDING_LABEL: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  complete: 'Complete',
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState<TenantFormData>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [provisioned, setProvisioned] = useState<{ subscription?: { planTier: string; trialDays: number } | null; ownerUser?: { email: string; tempPassword: string } | null } | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (activeFilter) params.set('active', activeFilter);
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));
      const res = await fetch(`/api/super-admin/tenants?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) { setTenants(data.data); if (data.pagination) setPagination(data.pagination); }
      else showToast.error(data.error || 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, [search, activeFilter, pagination.page, pagination.limit]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const openCreate = () => { setEditingTenant(null); setFormData(defaultForm); setFormError(''); setProvisioned(null); setShowModal(true); };

  const openEdit = (t: Tenant) => {
    setEditingTenant(t);
    setFormData({ slug: t.slug, name: t.name, currency: t.settings.currency || 'PHP', language: t.settings.language || 'en', businessType: t.settings.businessType || 'general', email: t.settings.email || '', ownerEmail: '', ownerName: '', trialDays: '14', notes: t.notes || '' });
    setFormError(''); setProvisioned(null); setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const isCreate = !editingTenant;
      const url = isCreate ? '/api/super-admin/tenants' : `/api/super-admin/tenants/${editingTenant!.slug}`;
      const body = isCreate
        ? { ...formData, trialDays: Number(formData.trialDays) }
        : { name: formData.name, notes: formData.notes, settings: { currency: formData.currency, language: formData.language, businessType: formData.businessType, email: formData.email || undefined } };

      const res = await fetch(url, { method: isCreate ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        showToast.success(isCreate ? 'Tenant created' : 'Tenant updated');
        fetchTenants();
        if (isCreate && data.provisioned) {
          setProvisioned(data.provisioned);
        } else {
          setShowModal(false);
        }
      } else {
        setFormError(data.error || 'Failed to save tenant');
      }
    } catch {
      setFormError('An error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (t: Tenant) => {
    const action = t.isActive ? 'deactivate' : 'activate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} tenant "${t.name}"?`)) return;
    const res = await fetch(`/api/super-admin/tenants/${t.slug}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ isActive: !t.isActive }) });
    const data = await res.json();
    if (data.success) { showToast.success(`Tenant ${!t.isActive ? 'activated' : 'deactivated'}`); fetchTenants(); }
    else showToast.error(data.error || 'Failed to update status');
  };

  const impersonate = async (t: Tenant) => {
    setImpersonating(t.slug);
    try {
      const res = await fetch('/api/super-admin/impersonate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ tenantSlug: t.slug }) });
      const data = await res.json();
      if (data.success) {
        const { token, user } = data.data;
        showToast.success(`Impersonating ${user.email} — token copied`);
        await navigator.clipboard.writeText(token).catch(() => {});
        // Open tenant app in new tab — adjust the URL format as needed
        window.open(`/${t.slug}/en?impersonate=${token}`, '_blank');
      } else {
        showToast.error(data.error || 'Failed to impersonate');
      }
    } finally {
      setImpersonating(null);
    }
  };

  const updateOnboarding = async (t: Tenant, status: string) => {
    const res = await fetch(`/api/super-admin/tenants/${t.slug}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ onboardingStatus: status }) });
    const data = await res.json();
    if (data.success) { showToast.success('Onboarding status updated'); fetchTenants(); }
    else showToast.error(data.error || 'Failed to update');
  };

  return (
    <SuperAdminShell title="Tenants">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-3">
            <input type="text" placeholder="Search by name or slug…" value={search} onChange={e => setSearch(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-56 focus:ring-2 focus:ring-brand-teal/30" />
            <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="">All statuses</option>
              <option value="true">Active only</option>
              <option value="false">Inactive only</option>
            </select>
          </div>
          <button onClick={openCreate} className="px-4 py-2 bg-brand-teal text-white rounded-lg text-sm font-medium hover:bg-brand-teal/90">
            + New Tenant
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{search || activeFilter ? 'No tenants match your filters.' : 'No tenants yet.'}</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  {['Name', 'Slug', 'Type', 'Onboarding', 'Status', 'Created', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tenants.map(t => (
                  <tr key={t._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{t.name}</p>
                      {t.notes && <p className="text-xs text-gray-400 truncate max-w-[160px]" title={t.notes}>{t.notes}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.slug}</td>
                    <td className="px-4 py-3">
                      {t.settings.businessType ? (
                        <span className="px-2 py-0.5 text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-full capitalize">{t.settings.businessType}</span>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={t.onboardingStatus || 'not_started'}
                        onChange={e => updateOnboarding(t, e.target.value)}
                        className={`text-xs border rounded-full px-2 py-0.5 cursor-pointer ${ONBOARDING_BADGE[t.onboardingStatus || 'not_started']}`}
                      >
                        <option value="not_started">Not Started</option>
                        <option value="in_progress">In Progress</option>
                        <option value="complete">Complete</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold border rounded-full ${t.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => openEdit(t)} className="text-xs text-brand-teal hover:underline">Edit</button>
                        <button onClick={() => toggleActive(t)} className={`text-xs hover:underline ${t.isActive ? 'text-red-500' : 'text-green-600'}`}>
                          {t.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => impersonate(t)} disabled={impersonating === t.slug}
                          className="text-xs text-purple-600 hover:underline disabled:opacity-50">
                          {impersonating === t.slug ? '…' : 'Impersonate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="border-t px-4 py-3 flex items-center justify-between text-sm text-gray-500">
                <span>Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</span>
                <div className="flex gap-2">
                  <button disabled={pagination.page === 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                    className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
                  <button disabled={pagination.page >= pagination.pages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                    className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {provisioned ? (
              <div className="p-6 space-y-4">
                <h2 className="text-lg font-semibold text-gray-900 text-green-700">Tenant Created!</h2>
                {provisioned.subscription && (
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                    <p className="text-sm font-medium text-teal-800">Subscription provisioned</p>
                    <p className="text-xs text-teal-600 mt-1">Plan: {provisioned.subscription.planTier} · Trial: {provisioned.subscription.trialDays} days</p>
                  </div>
                )}
                {provisioned.ownerUser && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <p className="text-sm font-medium text-yellow-800">Owner account created</p>
                    <p className="text-xs text-yellow-700 mt-1">Email: {provisioned.ownerUser.email}</p>
                    <p className="text-xs text-yellow-700 font-mono mt-1">Temp password: <strong>{provisioned.ownerUser.tempPassword}</strong></p>
                    <p className="text-xs text-yellow-500 mt-1">Share this with the tenant and ask them to change it immediately.</p>
                  </div>
                )}
                <button onClick={() => setShowModal(false)} className="w-full py-2 bg-brand-teal text-white rounded-lg text-sm">Done</button>
              </div>
            ) : (
              <form onSubmit={handleSave}>
                <div className="flex items-center justify-between px-6 py-4 border-b">
                  <h2 className="font-semibold text-gray-900">{editingTenant ? 'Edit Tenant' : 'Create New Tenant'}</h2>
                  <button type="button" onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                <div className="p-6 space-y-4">
                  {!editingTenant && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Slug *</label>
                      <input required value={formData.slug} onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                        className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="my-store" />
                      <p className="text-xs text-gray-400 mt-1">Lowercase letters, numbers, hyphens only</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                    <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="My Store" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                      <input value={formData.currency} maxLength={3} onChange={e => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                        className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="PHP" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Language</label>
                      <select value={formData.language} onChange={e => setFormData({ ...formData, language: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                        <option value="en">English</option>
                        <option value="es">Español</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Business Type</label>
                    <select value={formData.businessType} onChange={e => setFormData({ ...formData, businessType: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                      {['general', 'retail', 'restaurant', 'laundry', 'service'].map(t => (
                        <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contact Email</label>
                    <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="contact@store.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Internal Notes</label>
                    <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2}
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none" placeholder="Internal notes about this tenant…" />
                  </div>
                  {!editingTenant && (
                    <>
                      <hr className="border-gray-100" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Auto-Provisioning</p>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Owner Email (creates account)</label>
                        <input type="email" value={formData.ownerEmail} onChange={e => setFormData({ ...formData, ownerEmail: e.target.value })}
                          className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="owner@store.com" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Owner Name</label>
                          <input value={formData.ownerName} onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                            className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Jane Doe" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Trial Days</label>
                          <input type="number" min="1" max="365" value={formData.trialDays} onChange={e => setFormData({ ...formData, trialDays: e.target.value })}
                            className="w-full border rounded-lg px-3 py-2 text-sm" />
                        </div>
                      </div>
                    </>
                  )}
                  {formError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{formError}</div>}
                </div>
                <div className="flex gap-3 px-6 py-4 border-t justify-end">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-brand-teal text-white rounded-lg text-sm font-medium hover:bg-brand-teal/90 disabled:opacity-50">
                    {saving ? 'Saving…' : editingTenant ? 'Save Changes' : 'Create Tenant'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </SuperAdminShell>
  );
}
