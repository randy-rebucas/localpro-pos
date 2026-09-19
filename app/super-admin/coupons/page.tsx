'use client';

import { useEffect, useState, useCallback } from 'react';
import { showToast } from '@/lib/toast';
import Win8Drawer from '@/components/admin/Win8Drawer';

interface Coupon {
  id: string;
  code: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  appliesTo: 'all_plans' | 'specific_plans';
  maxUses?: number;
  usedCount: number;
  validFrom: string;
  validUntil?: string;
  isActive: boolean;
}

const EMPTY_FORM = {
  code: '',
  description: '',
  discountType: 'percentage' as 'percentage' | 'fixed',
  discountValue: 10,
  appliesTo: 'all_plans' as 'all_plans' | 'specific_plans',
  maxUses: '',
  validFrom: new Date().toISOString().slice(0, 10),
  validUntil: '',
};

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [activeFilter, setActiveFilter] = useState('');
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (activeFilter) params.set('active', activeFilter);
      const res = await fetch(`/api/super-admin/coupons?${params}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) setCoupons(json.data);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => { load(); }, [load]);

  async function seedCoupons() {
    setSeeding(true);
    try {
      const res = await fetch('/api/super-admin/system/seed', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'coupons' }),
      });
      const json = await res.json();
      if (json.success) {
        showToast.success(`Seeded ${json.seeded.length} sample coupons`);
        load();
      } else {
        showToast.error(json.error || 'Failed to seed coupons');
      }
    } finally {
      setSeeding(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(c: Coupon) {
    setEditingId(c.id);
    setForm({
      code: c.code,
      description: c.description || '',
      discountType: c.discountType,
      discountValue: c.discountValue,
      appliesTo: c.appliesTo,
      maxUses: c.maxUses ? String(c.maxUses) : '',
      validFrom: c.validFrom.slice(0, 10),
      validUntil: c.validUntil ? c.validUntil.slice(0, 10) : '',
    });
    setShowForm(true);
  }

  async function save() {
    if (form.discountType === 'percentage' && (form.discountValue <= 0 || form.discountValue > 100)) {
      showToast.error('Percentage discount must be between 1 and 100');
      return;
    }
    if (form.discountType === 'fixed' && form.discountValue <= 0) {
      showToast.error('Fixed discount must be greater than 0');
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        discountValue: Number(form.discountValue),
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        validUntil: form.validUntil || undefined,
      };
      const url = editingId ? `/api/super-admin/coupons/${editingId}` : '/api/super-admin/coupons';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        showToast.success(editingId ? 'Coupon updated' : 'Coupon created');
        setShowForm(false);
        load();
      } else {
        showToast.error(json.error || 'Failed to save coupon');
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: Coupon) {
    const res = await fetch(`/api/super-admin/coupons/${c.id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    const json = await res.json();
    if (json.success) {
      showToast.success(`Coupon ${c.isActive ? 'deactivated' : 'activated'}`);
      load();
    }
  }

  async function deleteCoupon(c: Coupon) {
    if (!confirm(`Delete coupon "${c.code}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/super-admin/coupons/${c.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const json = await res.json();
    if (json.success) {
      showToast.success('Coupon deleted');
      load();
    } else {
      showToast.error(json.error || 'Failed to delete');
    }
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString();

  return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2">
            {['', 'true', 'false'].map((v) => (
              <button
                key={v}
                onClick={() => setActiveFilter(v)}
                className={`px-3 py-1.5 text-sm border transition-colors ${activeFilter === v ? 'bg-brand text-white border-brand' : 'border-gray-300 text-gray-600 hover:border-gray-400 bg-white'}`}
              >
                {v === '' ? 'All' : v === 'true' ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {coupons.length === 0 && !loading && (
              <button
                onClick={seedCoupons}
                disabled={seeding}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors bg-white"
              >
                {seeding ? 'Seeding…' : 'Seed Sample Coupons'}
              </button>
            )}
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
            >
              + Create Coupon
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto">
              <span /><span /><span /><span /><span />
            </div>
            <p className="mt-3 text-gray-500 text-sm">Loading coupons…</p>
          </div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-white border border-gray-300">No coupons found.</div>
        ) : (
          <div className="overflow-x-auto border border-gray-300 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide">
                <tr>
                  {['Code', 'Discount', 'Uses', 'Valid From', 'Valid Until', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {coupons.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900">{c.code}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.discountType === 'percentage' ? `${c.discountValue}%` : `₱${c.discountValue}`}
                      {c.description && <div className="text-xs text-gray-400 truncate max-w-[150px]">{c.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmt(c.validFrom)}</td>
                    <td className="px-4 py-3 text-gray-600">{c.validUntil ? fmt(c.validUntil) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold ${c.isActive ? 'bg-win8-success text-white' : 'bg-gray-500 text-white'}`}>
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => openEdit(c)} title="Edit" aria-label="Edit"
                          className="inline-flex items-center justify-center p-2 text-white bg-brand hover:brightness-110 transition-[filter]">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                          </svg>
                        </button>
                        <button onClick={() => toggleActive(c)} title={c.isActive ? 'Deactivate' : 'Activate'} aria-label={c.isActive ? 'Deactivate' : 'Activate'}
                          className={`inline-flex items-center justify-center p-2 text-white hover:brightness-110 transition-[filter] ${c.isActive ? 'bg-gray-500' : 'bg-win8-success'}`}>
                          {c.isActive ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v14M16 5v14" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="currentColor" stroke="none" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          )}
                        </button>
                        <button onClick={() => deleteCoupon(c)} title="Delete" aria-label="Delete"
                          className="inline-flex items-center justify-center p-2 text-white bg-win8-danger hover:brightness-110 transition-[filter]">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Form Drawer */}
        <Win8Drawer open={showForm} onClose={() => setShowForm(false)}>
          <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
            <h2 className="text-base font-semibold">{editingId ? 'Edit Coupon' : 'Create Coupon'}</h2>
            <button onClick={() => setShowForm(false)} title="Close" aria-label="Close" className="text-white/70 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Code *</label>
                <input
                  className="w-full border border-gray-300 px-3 py-2 text-sm uppercase focus:outline-none bg-white disabled:bg-gray-100"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="SUMMER20"
                  disabled={!!editingId}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Discount Type *</label>
                <select
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none bg-white"
                  value={form.discountType}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value as 'percentage' | 'fixed' })}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (₱)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Discount Value *</label>
                <input
                  type="number"
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none bg-white"
                  value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                  min={0}
                  max={form.discountType === 'percentage' ? 100 : undefined}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Uses</label>
                <input
                  type="number"
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none bg-white"
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                  placeholder="Unlimited"
                  min={1}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input
                className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none bg-white"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Valid From *</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none bg-white"
                  value={form.validFrom}
                  onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Valid Until</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none bg-white"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-200 justify-end shrink-0">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors">Cancel</button>
            <button
              onClick={save}
              disabled={saving || !form.code || !form.discountValue}
              className="px-4 py-2 text-sm bg-brand text-white font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Coupon'}
            </button>
          </div>
        </Win8Drawer>
      </div>
  );
}
