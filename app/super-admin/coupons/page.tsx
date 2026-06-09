'use client';

import { useEffect, useState, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';
import { showToast } from '@/lib/toast';

interface Coupon {
  _id: string;
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

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(c: Coupon) {
    setEditingId(c._id);
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
    const res = await fetch(`/api/super-admin/coupons/${c._id}`, {
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
    const res = await fetch(`/api/super-admin/coupons/${c._id}`, {
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
    <SuperAdminShell title="Coupons & Discounts">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2">
            {['', 'true', 'false'].map((v) => (
              <button
                key={v}
                onClick={() => setActiveFilter(v)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${activeFilter === v ? 'bg-brand-teal text-white border-brand-teal' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
              >
                {v === '' ? 'All' : v === 'true' ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-brand-teal text-white rounded-lg text-sm font-medium hover:bg-brand-teal/90 transition-colors"
          >
            + Create Coupon
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No coupons found.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  {['Code', 'Discount', 'Uses', 'Valid From', 'Valid Until', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {coupons.map((c) => (
                  <tr key={c._id} className="hover:bg-gray-50/50 transition-colors">
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
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${c.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(c)} className="text-xs text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => toggleActive(c)} className="text-xs text-gray-500 hover:underline">
                          {c.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => deleteCoupon(c)} className="text-xs text-red-500 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="font-semibold text-gray-900">{editingId ? 'Edit Coupon' : 'Create Coupon'}</h2>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Code *</label>
                    <input
                      className="w-full border rounded-lg px-3 py-2 text-sm uppercase"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      placeholder="SUMMER20"
                      disabled={!!editingId}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Discount Type *</label>
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm"
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
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.discountValue}
                      onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Max Uses</label>
                    <input
                      type="number"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
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
                    className="w-full border rounded-lg px-3 py-2 text-sm"
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
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.validFrom}
                      onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valid Until</label>
                    <input
                      type="date"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.validUntil}
                      onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t justify-end">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
                <button
                  onClick={save}
                  disabled={saving || !form.code || !form.discountValue}
                  className="px-4 py-2 text-sm bg-brand-teal text-white rounded-lg hover:bg-brand-teal/90 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Coupon'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SuperAdminShell>
  );
}
