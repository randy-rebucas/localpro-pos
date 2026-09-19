'use client';

import { useEffect, useState, useCallback } from 'react';
import { showToast } from '@/lib/toast';
import Win8Drawer from '@/components/admin/Win8Drawer';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  settings: { businessType?: string; currency: string; language: string; email?: string; };
  isActive: boolean;
  onboardingStatus?: 'not_started' | 'in_progress' | 'complete';
  notes?: string;
  createdAt: string;
}

interface Pagination { page: number; limit: number; total: number; pages: number; }

interface FeatureFlagOverride {
  id: string;
  feature: string;
  enabled: boolean;
  reason?: string | null;
  expiresAt?: string | null;
}

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
  not_started: 'bg-gray-500 text-white',
  in_progress: 'bg-win8-warning text-white',
  complete: 'bg-win8-success text-white',
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
  const [flagsTenant, setFlagsTenant] = useState<Tenant | null>(null);
  const [displayFlagsTenant, setDisplayFlagsTenant] = useState<Tenant | null>(null);
  const [flags, setFlags] = useState<FeatureFlagOverride[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [newFlag, setNewFlag] = useState({ feature: '', enabled: true, reason: '' });
  const [savingFlag, setSavingFlag] = useState(false);

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

  useEffect(() => { if (flagsTenant) setDisplayFlagsTenant(flagsTenant); }, [flagsTenant]);

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
        const { user } = data.data;
        showToast.success(`Impersonating ${user.email}`);
        // The response set an impersonation-token cookie (separate from this
        // tab's own super-admin session), so the new tab is already authenticated.
        window.open(`/${t.slug}/en`, '_blank');
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

  const openFlags = async (t: Tenant) => {
    setFlagsTenant(t);
    setNewFlag({ feature: '', enabled: true, reason: '' });
    setFlagsLoading(true);
    try {
      const res = await fetch(`/api/super-admin/feature-flags/${t.slug}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setFlags(data.data);
      else { showToast.error(data.error || 'Failed to load feature flags'); setFlags([]); }
    } finally {
      setFlagsLoading(false);
    }
  };

  const saveFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flagsTenant || !newFlag.feature.trim()) return;
    setSavingFlag(true);
    try {
      const res = await fetch(`/api/super-admin/feature-flags/${flagsTenant.slug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ feature: newFlag.feature.trim(), enabled: newFlag.enabled, reason: newFlag.reason || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        showToast.success('Feature flag saved');
        setNewFlag({ feature: '', enabled: true, reason: '' });
        openFlags(flagsTenant);
      } else showToast.error(data.error || 'Failed to save feature flag');
    } finally {
      setSavingFlag(false);
    }
  };

  const toggleFlag = async (flag: FeatureFlagOverride) => {
    if (!flagsTenant) return;
    const res = await fetch(`/api/super-admin/feature-flags/${flagsTenant.slug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ feature: flag.feature, enabled: !flag.enabled, reason: flag.reason || undefined }),
    });
    const data = await res.json();
    if (data.success) openFlags(flagsTenant);
    else showToast.error(data.error || 'Failed to update feature flag');
  };

  const removeFlag = async (flag: FeatureFlagOverride) => {
    if (!flagsTenant) return;
    if (!confirm(`Remove override for "${flag.feature}"?`)) return;
    const res = await fetch(`/api/super-admin/feature-flags/${flagsTenant.slug}?feature=${encodeURIComponent(flag.feature)}`, {
      method: 'DELETE', credentials: 'include',
    });
    const data = await res.json();
    if (data.success) { showToast.success('Override removed'); openFlags(flagsTenant); }
    else showToast.error(data.error || 'Failed to remove override');
  };

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
          <div className="flex gap-3">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
              </svg>
              <input type="text" placeholder="Search by name or slug…" aria-label="Search tenants" value={search} onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-56 focus:outline-none" />
            </div>
            <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)} aria-label="Filter by status"
              className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900">
              <option value="">All statuses</option>
              <option value="true">Active only</option>
              <option value="false">Inactive only</option>
            </select>
          </div>
          <button onClick={openCreate} className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors">
            + New Tenant
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto">
              <span /><span /><span /><span /><span />
            </div>
            <p className="mt-3 text-gray-400 text-sm">Loading tenants…</p>
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">{search || activeFilter ? 'No tenants match your filters.' : 'No tenants yet.'}</div>
        ) : (
          <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
                <tr>
                  {['Name', 'Slug', 'Type', 'Onboarding', 'Status', 'Created', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tenants.map(t => (
                  <tr key={t.id} className="hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{t.name}</p>
                      {t.notes && <p className="text-xs text-gray-500 truncate max-w-[160px]" title={t.notes}>{t.notes}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{t.slug}</td>
                    <td className="px-4 py-3">
                      {t.settings.businessType ? (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-brand text-white capitalize">{t.settings.businessType}</span>
                      ) : <span className="text-gray-500 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={t.onboardingStatus || 'not_started'}
                        onChange={e => updateOnboarding(t, e.target.value)}
                        aria-label={`Onboarding status for ${t.name}`}
                        className={`text-xs px-2 py-0.5 cursor-pointer border-0 font-semibold ${ONBOARDING_BADGE[t.onboardingStatus || 'not_started']}`}
                      >
                        {Object.entries(ONBOARDING_LABEL).map(([value, label]) => (
                          <option key={value} value={value} className="bg-white text-gray-900 font-normal">{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold text-white ${t.isActive ? 'bg-win8-success' : 'bg-win8-danger'}`}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => openEdit(t)} title="Edit" aria-label="Edit"
                          className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter]">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                          </svg>
                        </button>
                        <button onClick={() => toggleActive(t)} title={t.isActive ? 'Deactivate' : 'Activate'} aria-label={t.isActive ? 'Deactivate' : 'Activate'}
                          className={`inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 transition-[filter] ${t.isActive ? 'bg-win8-danger' : 'bg-win8-success'}`}>
                          {t.isActive ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" />
                            </svg>
                          )}
                        </button>
                        <button onClick={() => impersonate(t)} disabled={impersonating === t.slug} title="Impersonate" aria-label="Impersonate"
                          className="inline-flex items-center justify-center p-2.5 text-white bg-win8-accent hover:brightness-110 transition-[filter] disabled:opacity-50">
                          {impersonating === t.slug ? (
                            <span className="win8-spinner win8-spinner-sm">
                              <span /><span /><span /><span /><span />
                            </span>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8V6a4 4 0 0 0-8 0v2M5 8h14l-1 12H6L5 8Z" />
                            </svg>
                          )}
                        </button>
                        <button onClick={() => openFlags(t)} title="Feature Flags" aria-label="Feature Flags"
                          className="inline-flex items-center justify-center p-2.5 text-white bg-win8-warning hover:brightness-110 transition-[filter]">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h11l-2 4 2 4H5" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="border-t border-gray-300 px-4 py-3 flex items-center justify-between text-sm text-gray-500">
                <span>Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</span>
                <div className="flex gap-2">
                  <button disabled={pagination.page === 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                    className="px-3 py-1 border border-gray-300 disabled:opacity-40 hover:bg-gray-100">← Prev</button>
                  <button disabled={pagination.page >= pagination.pages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                    className="px-3 py-1 border border-gray-300 disabled:opacity-40 hover:bg-gray-100">Next →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Drawer */}
      <Win8Drawer open={showModal} onClose={() => setShowModal(false)}>
            {provisioned ? (
              <div className="p-6 space-y-4 overflow-y-auto">
                <h2 className="text-lg font-bold text-win8-success">Tenant Created!</h2>
                {provisioned.subscription && (
                  <div className="bg-brand text-white p-4">
                    <p className="text-sm font-medium">Subscription provisioned</p>
                    <p className="text-xs text-white/80 mt-1">Plan: {provisioned.subscription.planTier} · Trial: {provisioned.subscription.trialDays} days</p>
                  </div>
                )}
                {provisioned.ownerUser && (
                  <div className="bg-win8-warning text-white p-4">
                    <p className="text-sm font-medium">Owner account created</p>
                    <p className="text-xs text-white/90 mt-1">Email: {provisioned.ownerUser.email}</p>
                    <p className="text-xs text-white/90 font-mono mt-1">Temp password: <strong>{provisioned.ownerUser.tempPassword}</strong></p>
                    <p className="text-xs text-white/70 mt-1">Share this with the tenant and ask them to change it immediately.</p>
                  </div>
                )}
                <button onClick={() => setShowModal(false)} className="w-full py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors">Done</button>
              </div>
            ) : (
              <form onSubmit={handleSave} className="flex flex-col h-full min-h-0">
                <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
                  <h2 className="text-base font-semibold">{editingTenant ? 'Edit Tenant' : 'Create New Tenant'}</h2>
                  <button type="button" onClick={() => setShowModal(false)} title="Close" aria-label="Close" className="text-white/70 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                  {!editingTenant && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Slug *</label>
                      <input required value={formData.slug} onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                        className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="my-store" />
                      <p className="text-xs text-gray-400 mt-1">Lowercase letters, numbers, hyphens only</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                    <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="My Store" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                      <input value={formData.currency} maxLength={3} onChange={e => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                        className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="PHP" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Language</label>
                      <select value={formData.language} onChange={e => setFormData({ ...formData, language: e.target.value })}
                        className="w-full border border-gray-300 px-3 py-2 text-sm bg-white">
                        <option value="en">English</option>
                        <option value="es">Español</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Business Type</label>
                    <select value={formData.businessType} onChange={e => setFormData({ ...formData, businessType: e.target.value })}
                      className="w-full border border-gray-300 px-3 py-2 text-sm bg-white">
                      {['general', 'retail', 'restaurant', 'laundry', 'service'].map(t => (
                        <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contact Email</label>
                    <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="contact@store.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Internal Notes</label>
                    <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2}
                      className="w-full border border-gray-300 px-3 py-2 text-sm resize-none" placeholder="Internal notes about this tenant…" />
                  </div>
                  {!editingTenant && (
                    <>
                      <hr className="border-gray-300" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Auto-Provisioning</p>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Owner Email (creates account)</label>
                        <input type="email" value={formData.ownerEmail} onChange={e => setFormData({ ...formData, ownerEmail: e.target.value })}
                          className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="owner@store.com" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Owner Name</label>
                          <input value={formData.ownerName} onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                            className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="Jane Doe" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Trial Days</label>
                          <input type="number" min="1" max="365" value={formData.trialDays} onChange={e => setFormData({ ...formData, trialDays: e.target.value })}
                            className="w-full border border-gray-300 px-3 py-2 text-sm" />
                        </div>
                      </div>
                    </>
                  )}
                  {formError && <div className="bg-win8-danger text-white text-sm p-3">{formError}</div>}
                </div>
                <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 text-sm hover:bg-gray-100">Cancel</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors">
                    {saving ? 'Saving…' : editingTenant ? 'Save Changes' : 'Create Tenant'}
                  </button>
                </div>
              </form>
            )}
      </Win8Drawer>

      {/* Feature Flags Drawer */}
      <Win8Drawer open={!!flagsTenant} onClose={() => setFlagsTenant(null)}>
            <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
              <h2 className="text-base font-semibold">Feature Flags — {displayFlagsTenant?.name}</h2>
              <button type="button" onClick={() => setFlagsTenant(null)} title="Close" aria-label="Close" className="text-white/70 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              {flagsLoading ? (
                <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
              ) : flags.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No overrides set for this tenant.</p>
              ) : (
                <div className="border border-gray-300 divide-y divide-gray-200">
                  {flags.map(f => (
                    <div key={f.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{f.feature}</p>
                        {f.reason && <p className="text-xs text-gray-400 truncate" title={f.reason}>{f.reason}</p>}
                      </div>
                      <button onClick={() => toggleFlag(f)} className={`px-2 py-0.5 text-xs font-semibold text-white ${f.enabled ? 'bg-win8-success' : 'bg-win8-danger'}`}>
                        {f.enabled ? 'On' : 'Off'}
                      </button>
                      <button onClick={() => removeFlag(f)} className="text-xs text-win8-danger hover:underline">Remove</button>
                    </div>
                  ))}
                </div>
              )}

              <hr className="border-gray-300" />
              <form onSubmit={saveFlag} className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add / Update Override</p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Feature key *</label>
                  <input required value={newFlag.feature} onChange={e => setNewFlag({ ...newFlag, feature: e.target.value })}
                    className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="enableLoyaltyProgram" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="block text-xs font-medium text-gray-600">Enabled</label>
                  <input type="checkbox" className="checkbox-win8" checked={newFlag.enabled} onChange={e => setNewFlag({ ...newFlag, enabled: e.target.checked })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
                  <input value={newFlag.reason} onChange={e => setNewFlag({ ...newFlag, reason: e.target.value })}
                    className="w-full border border-gray-300 px-3 py-2 text-sm" placeholder="Optional note" />
                </div>
                <button type="submit" disabled={savingFlag} className="w-full py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors">
                  {savingFlag ? 'Saving…' : 'Save Override'}
                </button>
              </form>
            </div>
      </Win8Drawer>
    </>
  );
}
