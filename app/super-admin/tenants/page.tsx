'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Building2, LogIn, Pencil, Plus, Power, PowerOff, Search } from 'lucide-react';
import { showToast } from '@/lib/toast';
import { OFFERED_BUSINESS_TYPES, isBusinessTypeOffered } from '@/lib/business-types';
import {
  DARK_FIELD, DARK_KEY_PRIMARY, DARK_LABEL, Empty, HINT, ICON, INPUT, IconKey, KEY, KEY_PRIMARY,
  LABEL, Printing, SaPage, SELECT, Sheet, Slip, Strip, TABLE, TBODY, TD, TD_TEXT, TEXTAREA, TH, THEAD, TR, Tag,
} from '@/components/super-admin/ui';

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

const ONBOARDING_TONE: Record<string, string> = {
  not_started: 'border-ink/20 bg-ink/5 text-ink/70',
  in_progress: 'border-[#b7791f]/40 bg-[#fdf3dc] text-[#8a5a12]',
  complete: 'border-brand-hover/50 bg-brand-soft text-brand-hover',
};

const FORM_ID = 'tenant-form';

// The dashboard links here with ?active=true or ?active=false to open on that status.
export default function TenantsPage() {
  return (
    <Suspense>
      <TenantsRoll />
    </Suspense>
  );
}

function TenantsRoll() {
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState(() => {
    const active = searchParams.get('active');
    return active === 'true' || active === 'false' ? active : '';
  });
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

  const closeModal = () => setShowModal(false);

  const onboardingSelect = (t: Tenant, id: string) => (
    <select
      id={id}
      aria-label={`Onboarding for ${t.name}`}
      value={t.onboardingStatus || 'not_started'}
      onChange={e => updateOnboarding(t, e.target.value)}
      className={`min-h-[36px] cursor-pointer border px-2 py-1 font-receipt text-xs uppercase ${ONBOARDING_TONE[t.onboardingStatus || 'not_started']}`}
    >
      <option value="not_started">Not started</option>
      <option value="in_progress">In progress</option>
      <option value="complete">Complete</option>
    </select>
  );

  const rowKeys = (t: Tenant) => (
    <div className="flex flex-wrap gap-2">
      <IconKey icon={Pencil} label={`Edit ${t.name}`} onClick={() => openEdit(t)} />
      <IconKey
        icon={LogIn}
        label={impersonating === t.slug ? `Opening ${t.name}…` : `Open ${t.name} as its owner`}
        onClick={() => impersonate(t)}
        busy={impersonating === t.slug}
      />
      {t.isActive ? (
        <IconKey icon={PowerOff} tone="danger" label={`Deactivate ${t.name}`} onClick={() => toggleActive(t)} />
      ) : (
        <IconKey icon={Power} label={`Activate ${t.name}`} onClick={() => toggleActive(t)} />
      )}
    </div>
  );

  const typeTag = (t: Tenant) =>
    t.settings.businessType ? <Tag tone="info">{t.settings.businessType}</Tag> : <span className="font-receipt text-xs text-ink/40">—</span>;

  const statusTag = (t: Tenant) => <Tag tone={t.isActive ? 'ok' : 'bad'}>{t.isActive ? 'Active' : 'Inactive'}</Tag>;

  return (
    <SaPage
      tagNo="02"
      tag="Store roll"
      title="Tenants"
      subtitle="Every store on the platform. Edit details, switch a store on or off, or open it as its owner."
      side={
        <button type="button" onClick={openCreate} className={DARK_KEY_PRIMARY}>
          <Plus className={ICON} strokeWidth={1.75} aria-hidden />
          New tenant
        </button>
      }
    >
      {/* Filters */}
      <section aria-label="Filters" className="mt-8 grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem] lg:max-w-2xl">
        <div>
          <label htmlFor="tenant-search" className={DARK_LABEL}>Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" strokeWidth={1.75} aria-hidden />
            <input
              id="tenant-search"
              type="text"
              placeholder="Name or slug…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`${DARK_FIELD} pl-9 placeholder:text-ink/40`}
            />
          </div>
        </div>
        <div>
          <label htmlFor="tenant-status" className={DARK_LABEL}>Status</label>
          <select id="tenant-status" value={activeFilter} onChange={e => setActiveFilter(e.target.value)} className={DARK_FIELD}>
            <option value="">All statuses</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </select>
        </div>
      </section>

      {/* The roll */}
      <Slip
        className="mt-6"
        title={loading ? 'Tenants' : `${pagination.total.toLocaleString()} tenant${pagination.total === 1 ? '' : 's'}`}
        tear
      >
        {loading ? (
          <Printing label="Loading tenants…" />
        ) : tenants.length === 0 ? (
          <Empty icon={<Building2 className="h-8 w-8" strokeWidth={1.75} aria-hidden />}>
            {search || activeFilter ? 'No tenants match your filters.' : 'No tenants yet.'}
          </Empty>
        ) : (
          <>
            {/* Below xl: one printed entry per tenant */}
            <ul className={`${TBODY} xl:hidden`}>
              {tenants.map(t => (
                <li key={t._id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{t.name}</p>
                      <p className="mt-0.5 break-all font-receipt text-xs text-ink/60">
                        {t.slug} · Created {new Date(t.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {typeTag(t)}
                      {statusTag(t)}
                    </div>
                  </div>
                  {t.notes && <p className="mt-2 text-sm text-ink/60">{t.notes}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label htmlFor={`onb-m-${t._id}`} className="font-receipt text-xs uppercase tracking-[0.08em] text-ink/60">Onboarding</label>
                    {onboardingSelect(t, `onb-m-${t._id}`)}
                  </div>
                  <div className="mt-3">{rowKeys(t)}</div>
                </li>
              ))}
            </ul>

            {/* From xl: the full table */}
            <div className="hidden overflow-x-auto xl:block" role="region" aria-label="Tenants" tabIndex={0}>
              <table className={TABLE}>
                <thead className={THEAD}>
                  <tr>
                    {['Name', 'Slug', 'Type', 'Onboarding', 'Status', 'Created', 'Actions'].map(h => (
                      <th key={h} scope="col" className={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {tenants.map(t => (
                    <tr key={t._id} className={TR}>
                      <td className={`${TD_TEXT} min-w-[12rem]`}>
                        <p className="font-medium">{t.name}</p>
                        {t.notes && <p className="mt-0.5 max-w-[14rem] truncate text-xs text-ink/60" title={t.notes}>{t.notes}</p>}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-ink/70`}>{t.slug}</td>
                      <td className={TD}>{typeTag(t)}</td>
                      <td className="px-4 py-2.5">{onboardingSelect(t, `onb-${t._id}`)}</td>
                      <td className={TD}>{statusTag(t)}</td>
                      <td className={`${TD} whitespace-nowrap text-ink/70`}>{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5">{rowKeys(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ink/30 px-4 py-2 sm:px-5">
                <span className="font-receipt text-xs text-ink/60">
                  {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </span>
                <div className="flex gap-2">
                  <button type="button" disabled={pagination.page === 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))} className={KEY}>
                    Previous
                  </button>
                  <button type="button" disabled={pagination.page >= pagination.pages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))} className={KEY}>
                    Next
                  </button>
                </div>
              </nav>
            )}
          </>
        )}
      </Slip>

      {/* Create/Edit sheet */}
      {showModal && (provisioned ? (
        <Sheet
          title="Tenant created"
          onClose={closeModal}
          closeLabel="Close"
          footer={<button type="button" onClick={closeModal} className={KEY_PRIMARY}>Done</button>}
        >
          <div className="space-y-3">
            {provisioned.subscription && (
              <Strip tone="ok">
                <p className="font-semibold">Subscription provisioned</p>
                <p className="mt-1 text-ink/70">Plan: {provisioned.subscription.planTier} · Trial: {provisioned.subscription.trialDays} days</p>
              </Strip>
            )}
            {provisioned.ownerUser && (
              <div className="border border-dashed border-ink/40 bg-paper px-4 py-3 font-receipt text-sm">
                <p className="font-semibold uppercase tracking-[0.08em]">Owner account created</p>
                <p className="mt-2 break-all">Email: {provisioned.ownerUser.email}</p>
                <p className="mt-1">Temp password: <strong className="select-all">{provisioned.ownerUser.tempPassword}</strong></p>
                <p className="mt-2 text-xs text-ink/60">Share this with the tenant and ask them to change it immediately.</p>
              </div>
            )}
          </div>
        </Sheet>
      ) : (
        <Sheet
          title={editingTenant ? 'Edit tenant' : 'New tenant'}
          subtitle={editingTenant ? <span className="font-receipt">{editingTenant.slug}</span> : undefined}
          onClose={closeModal}
          closeLabel="Close"
          footer={
            <>
              <button type="button" onClick={closeModal} className={KEY}>Cancel</button>
              <button type="submit" form={FORM_ID} disabled={saving} className={KEY_PRIMARY}>
                {saving ? 'Saving…' : editingTenant ? 'Save changes' : 'Create tenant'}
              </button>
            </>
          }
        >
          <form id={FORM_ID} onSubmit={handleSave} className="space-y-4">
            {!editingTenant && (
              <div>
                <label htmlFor="t-slug" className={LABEL}>Slug *</label>
                <input id="t-slug" required value={formData.slug} onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                  className={INPUT} placeholder="my-store" />
                <p className={HINT}>Lowercase letters, numbers, hyphens only</p>
              </div>
            )}
            <div>
              <label htmlFor="t-name" className={LABEL}>Name *</label>
              <input id="t-name" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                className={INPUT} placeholder="My Store" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="t-currency" className={LABEL}>Currency</label>
                <input id="t-currency" value={formData.currency} maxLength={3} onChange={e => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                  className={INPUT} placeholder="PHP" />
              </div>
              <div>
                <label htmlFor="t-language" className={LABEL}>Language</label>
                <select id="t-language" value={formData.language} onChange={e => setFormData({ ...formData, language: e.target.value })}
                  className={`${SELECT} w-full`}>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="t-type" className={LABEL}>Business type</label>
              <select id="t-type" value={formData.businessType} onChange={e => setFormData({ ...formData, businessType: e.target.value })}
                className={`${SELECT} w-full`}>
                {OFFERED_BUSINESS_TYPES.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
                {/* A tenant already on a closed type keeps it until someone picks an offered one. */}
                {editingTenant && formData.businessType && !isBusinessTypeOffered(formData.businessType) && (
                  <option value={formData.businessType}>
                    {formData.businessType.charAt(0).toUpperCase() + formData.businessType.slice(1)} (no longer offered)
                  </option>
                )}
              </select>
            </div>
            <div>
              <label htmlFor="t-email" className={LABEL}>Contact email</label>
              <input id="t-email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                className={INPUT} placeholder="contact@store.com" />
            </div>
            <div>
              <label htmlFor="t-notes" className={LABEL}>Internal notes</label>
              <textarea id="t-notes" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2}
                className={`${TEXTAREA} resize-none`} placeholder="Internal notes about this tenant…" />
            </div>
            {!editingTenant && (
              <fieldset className="space-y-4 border-t border-dashed border-ink/30 pt-4">
                <legend className="pr-2 font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70">Auto-provisioning</legend>
                <div>
                  <label htmlFor="t-owner-email" className={LABEL}>Owner email (creates account)</label>
                  <input id="t-owner-email" type="email" value={formData.ownerEmail} onChange={e => setFormData({ ...formData, ownerEmail: e.target.value })}
                    className={INPUT} placeholder="owner@store.com" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="t-owner-name" className={LABEL}>Owner name</label>
                    <input id="t-owner-name" value={formData.ownerName} onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                      className={INPUT} placeholder="Jane Doe" />
                  </div>
                  <div>
                    <label htmlFor="t-trial" className={LABEL}>Trial days</label>
                    <input id="t-trial" type="number" min="1" max="365" value={formData.trialDays} onChange={e => setFormData({ ...formData, trialDays: e.target.value })}
                      className={INPUT} />
                  </div>
                </div>
              </fieldset>
            )}
            {formError && <Strip tone="error">{formError}</Strip>}
          </form>
        </Sheet>
      ))}
    </SaPage>
  );
}
