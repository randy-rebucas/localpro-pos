'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, TicketPercent } from 'lucide-react';
import { showToast } from '@/lib/toast';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  DARK_KEY, DARK_KEY_PRIMARY, Empty, INPUT, KEY, KEY_PRIMARY, KEY_SM, KEY_SM_DANGER, LABEL, Printing, SaPage, SELECT, Sheet, Tag,
} from '@/components/super-admin/ui';

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
    <SaPage
      tagNo="07"
      tag="Coupon book"
      title="Coupons"
      subtitle="Discount codes stores can use on their subscription."
      side={
        <button type="button" onClick={openCreate} className={DARK_KEY_PRIMARY}>
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Create coupon
        </button>
      }
    >
      <div role="group" aria-label="Show coupons" className="mt-8 flex flex-wrap gap-2">
        {['', 'true', 'false'].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setActiveFilter(v)}
            aria-pressed={activeFilter === v}
            className={
              activeFilter === v
                ? 'flex min-h-[44px] items-center border border-brand bg-brand px-4 font-receipt text-xs font-semibold uppercase tracking-[0.08em] text-ink'
                : DARK_KEY
            }
          >
            {v === '' ? 'All' : v === 'true' ? 'Active' : 'Inactive'}
          </button>
        ))}
      </div>

      <section aria-label="Coupons" aria-busy={loading} className="mt-6">
        {loading ? (
          <div className="bg-paper-white text-ink"><Printing label="Loading…" /></div>
        ) : coupons.length === 0 ? (
          <div className="bg-paper-white text-ink">
            <Empty icon={<TicketPercent className="h-8 w-8" strokeWidth={1.75} aria-hidden />}>No coupons found.</Empty>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {coupons.map((c) => (
              <li key={c._id} className={c.isActive ? '' : 'opacity-80'}>
                <article className="flex h-full flex-col border-2 border-dashed border-ink/30 bg-paper-white text-ink">
                  <div className="flex items-start justify-between gap-3 border-b border-dashed border-ink/30 px-4 pb-3 pt-4">
                    <div className="min-w-0">
                      <p className="font-receipt text-[11px] uppercase tracking-[0.14em] text-ink/50">Code</p>
                      <h2 className="mt-1 break-all font-receipt! text-2xl! font-semibold! normal-case! leading-tight! tracking-[0.06em]!">{c.code}</h2>
                    </div>
                    <Tag tone={c.isActive ? 'ok' : 'muted'}>{c.isActive ? 'Active' : 'Inactive'}</Tag>
                  </div>

                  <div className="flex-1 px-4 py-3">
                    <p className="flex items-baseline gap-2">
                      {c.discountType === 'percentage' ? (
                        <span className="font-led text-5xl leading-none">{c.discountValue}%</span>
                      ) : (
                        <span className="font-receipt text-3xl font-semibold leading-none">₱{c.discountValue}</span>
                      )}
                      <span className="font-receipt text-xs uppercase tracking-[0.14em] text-ink/50">off</span>
                    </p>
                    {c.description && <p className="mt-2 text-sm text-ink/70">{c.description}</p>}

                    <div className="mt-3 space-y-1 font-receipt text-xs text-ink/80">
                      <ReceiptRow label="Uses" value={`${c.usedCount}${c.maxUses ? ` / ${c.maxUses}` : ''}`} />
                      <ReceiptRow label="Valid from" value={fmt(c.validFrom)} />
                      <ReceiptRow label="Valid until" value={c.validUntil ? fmt(c.validUntil) : '—'} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 border-t border-dashed border-ink/30 px-4 py-3">
                    <button type="button" onClick={() => openEdit(c)} className={KEY_SM}>Edit</button>
                    <button type="button" onClick={() => toggleActive(c)} className={KEY_SM}>
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" onClick={() => deleteCoupon(c)} className={`${KEY_SM_DANGER} ml-auto`}>Delete</button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showForm && (
        <Sheet
          title={editingId ? 'Edit coupon' : 'Create coupon'}
          onClose={() => setShowForm(false)}
          closeLabel="Close"
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className={KEY}>Cancel</button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !form.code || !form.discountValue}
                className={KEY_PRIMARY}
              >
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create coupon'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="coupon-code" className={LABEL}>Code *</label>
                <input
                  id="coupon-code"
                  className={`${INPUT} font-receipt uppercase`}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="SUMMER20"
                  disabled={!!editingId}
                />
              </div>
              <div>
                <label htmlFor="coupon-type" className={LABEL}>Discount type *</label>
                <select
                  id="coupon-type"
                  className={`${SELECT} w-full`}
                  value={form.discountType}
                  onChange={(e) => setForm({ ...form, discountType: e.target.value as 'percentage' | 'fixed' })}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (₱)</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="coupon-value" className={LABEL}>Discount value *</label>
                <input
                  id="coupon-value"
                  type="number"
                  className={`${INPUT} font-receipt`}
                  value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                  min={0}
                />
              </div>
              <div>
                <label htmlFor="coupon-max" className={LABEL}>Max uses</label>
                <input
                  id="coupon-max"
                  type="number"
                  className={`${INPUT} font-receipt`}
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                  placeholder="Unlimited"
                  min={1}
                />
              </div>
            </div>

            <div>
              <label htmlFor="coupon-desc" className={LABEL}>Description</label>
              <input
                id="coupon-desc"
                className={INPUT}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="coupon-from" className={LABEL}>Valid from *</label>
                <input
                  id="coupon-from"
                  type="date"
                  className={INPUT}
                  value={form.validFrom}
                  onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="coupon-until" className={LABEL}>Valid until</label>
                <input
                  id="coupon-until"
                  type="date"
                  className={INPUT}
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                />
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </SaPage>
  );
}
