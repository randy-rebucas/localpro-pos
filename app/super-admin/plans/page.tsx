'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Check, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  CHECKBOX,
  CHECK_ROW,
  DARK_KEY_PRIMARY,
  Empty,
  ICON,
  INPUT,
  KEY,
  KEY_PRIMARY,
  KEY_SM,
  KEY_SM_DANGER,
  LABEL,
  Printing,
  SELECT,
  SaPage,
  Sheet,
  Strip,
  Tag,
  peso,
} from '@/components/super-admin/ui';

const SECTION = 'mb-3 font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/70';

interface PlanFeatures {
  maxUsers: number;
  maxBranches: number;
  maxProducts: number;
  maxTransactions: number;
  enableInventory: boolean;
  enableCategories: boolean;
  enableDiscounts: boolean;
  enableLoyaltyProgram: boolean;
  enableCustomerManagement: boolean;
  enableBookingScheduling: boolean;
  enableReports: boolean;
  enableMultiBranch: boolean;
  enableHardwareIntegration: boolean;
  prioritySupport: boolean;
  customIntegrations: boolean;
  dedicatedAccountManager: boolean;
}

interface BirCompliance {
  ptuAssistance: boolean;
  receiptFormatting: boolean;
  birDocumentation: boolean;
  casReporting: boolean;
  auditTrailSystem: boolean;
  monthlySupport: boolean;
}

interface Plan {
  _id: string;
  name: string;
  tier: string;
  description?: string;
  price: { monthly: number; setupFee: number; currency: string };
  features: PlanFeatures;
  birCompliance: BirCompliance;
  isActive: boolean;
  isCustom: boolean;
  availableToNewTenants: boolean;
  yearlyDiscount: number;
  subscriberCount?: number;
}

const TIER_ORDER = ['starter', 'pro', 'business', 'enterprise'];

const BOOL_FEATURES: Array<{ key: keyof PlanFeatures; label: string }> = [
  { key: 'enableInventory', label: 'Inventory' },
  { key: 'enableCategories', label: 'Categories' },
  { key: 'enableDiscounts', label: 'Discounts' },
  { key: 'enableLoyaltyProgram', label: 'Loyalty Program' },
  { key: 'enableCustomerManagement', label: 'Customer Management' },
  { key: 'enableBookingScheduling', label: 'Booking & Scheduling' },
  { key: 'enableReports', label: 'Reports' },
  { key: 'enableMultiBranch', label: 'Multi-Branch' },
  { key: 'enableHardwareIntegration', label: 'Hardware Integration' },
  { key: 'prioritySupport', label: 'Priority Support' },
  { key: 'customIntegrations', label: 'Custom Integrations' },
  { key: 'dedicatedAccountManager', label: 'Dedicated Account Manager' },
];

const BIR_FIELDS: Array<{ key: keyof BirCompliance; label: string }> = [
  { key: 'ptuAssistance', label: 'PTU Assistance' },
  { key: 'receiptFormatting', label: 'Receipt Formatting' },
  { key: 'birDocumentation', label: 'BIR Documentation' },
  { key: 'casReporting', label: 'CAS Reporting' },
  { key: 'auditTrailSystem', label: 'Audit Trail System' },
  { key: 'monthlySupport', label: 'Monthly Support' },
];

const defaultFeatures: PlanFeatures = {
  maxUsers: 2, maxBranches: 1, maxProducts: 100, maxTransactions: 500,
  enableInventory: true, enableCategories: true, enableDiscounts: false,
  enableLoyaltyProgram: false, enableCustomerManagement: false,
  enableBookingScheduling: false, enableReports: true, enableMultiBranch: false,
  enableHardwareIntegration: false, prioritySupport: false,
  customIntegrations: false, dedicatedAccountManager: false,
};

const defaultBir: BirCompliance = {
  ptuAssistance: false, receiptFormatting: false, birDocumentation: false,
  casReporting: false, auditTrailSystem: false, monthlySupport: false,
};

const defaultPlan = {
  name: '', tier: 'starter', description: '',
  price: { monthly: 0, setupFee: 0, currency: 'PHP' },
  features: defaultFeatures,
  birCompliance: defaultBir,
  isActive: true, isCustom: false,
  availableToNewTenants: true, yearlyDiscount: 0,
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState(defaultPlan);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/plans', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setPlans(data.data.sort((a: Plan, b: Plan) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const openCreate = () => {
    setEditingPlan(null);
    setFormData(defaultPlan);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      tier: plan.tier,
      description: plan.description || '',
      price: { ...plan.price },
      features: { ...plan.features },
      birCompliance: { ...plan.birCompliance },
      isActive: plan.isActive,
      isCustom: plan.isCustom,
      availableToNewTenants: plan.availableToNewTenants ?? true,
      yearlyDiscount: plan.yearlyDiscount ?? 0,
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const url = editingPlan ? `/api/super-admin/plans/${editingPlan._id}` : '/api/super-admin/plans';
      const method = editingPlan ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        showMsg('success', editingPlan ? 'Plan updated' : 'Plan created');
        fetchPlans();
      } else {
        setFormError(data.error || 'Failed to save plan');
      }
    } catch {
      setFormError('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (plan: Plan) => {
    if (!confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/super-admin/plans/${plan._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', data.message || 'Plan deleted');
        fetchPlans();
      } else {
        showMsg('error', data.error || 'Failed to delete plan');
      }
    } catch {
      showMsg('error', 'An error occurred');
    }
  };

  const setFeature = (key: keyof PlanFeatures, value: boolean | number) =>
    setFormData(f => ({ ...f, features: { ...f.features, [key]: value } }));

  const setBir = (key: keyof BirCompliance, value: boolean) =>
    setFormData(f => ({ ...f, birCompliance: { ...f.birCompliance, [key]: value } }));

  const formatLimit = (v: number) => v === -1 ? '∞' : v.toLocaleString();

  const priceLabel = (plan: Plan) =>
    plan.price.monthly === 0 ? 'Free' : peso(plan.price.monthly, plan.price.currency || 'PHP');

  return (
    <SaPage
      tagNo="06"
      tag="Price list"
      title="Plans"
      subtitle="The tiers tenants subscribe to, with what each one includes."
      side={
        <button type="button" onClick={openCreate} className={DARK_KEY_PRIMARY}>
          <Plus className={ICON} strokeWidth={1.75} aria-hidden />
          New plan
        </button>
      }
    >
      {message && (
        <div className="mt-6 max-w-2xl">
          <Strip tone={message.type === 'success' ? 'ok' : 'error'}>{message.text}</Strip>
        </div>
      )}

      <section className="mt-8" aria-busy={loading}>
        {loading ? (
          <div className="bg-paper-white text-ink">
            <Printing label="Loading plans…" />
          </div>
        ) : plans.length === 0 ? (
          <div className="bg-paper-white text-ink">
            <Empty icon={<ClipboardList className="h-8 w-8" strokeWidth={1.75} aria-hidden />}>
              No plans found. Use Settings, then Seed Plans, to create the defaults.
            </Empty>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan, i) => {
              const included = BOOL_FEATURES.filter(f => plan.features[f.key]);
              const bir = BIR_FIELDS.filter(f => plan.birCompliance?.[f.key]);
              const currency = plan.price.currency || 'PHP';
              return (
                <article key={plan._id}>
                  <div className="bg-paper-white text-ink">
                    <header className="border-b border-dashed border-ink/30 px-5 pb-4 pt-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-receipt text-xs text-ink/50">{String(i + 1).padStart(2, '0')}</span>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Tag tone="info">{plan.tier}</Tag>
                          <Tag tone={plan.isActive ? 'ok' : 'muted'}>{plan.isActive ? 'Active' : 'Inactive'}</Tag>
                        </div>
                      </div>
                      <h2 className="mt-2 text-4xl">{plan.name}</h2>
                      {plan.description && <p className="mt-1 text-sm text-ink/65">{plan.description}</p>}
                      <p className="mt-3 font-receipt text-2xl font-semibold">
                        {priceLabel(plan)}
                        {plan.price.monthly !== 0 && <span className="text-sm font-normal text-ink/60"> / month</span>}
                      </p>
                    </header>

                    <div className="space-y-1.5 px-5 py-4 font-receipt text-sm">
                      <ReceiptRow label="Setup fee" value={plan.price.setupFee ? peso(plan.price.setupFee, currency) : '—'} />
                      <ReceiptRow label="Yearly discount" value={plan.yearlyDiscount ? `${plan.yearlyDiscount}% off` : '—'} />
                      <ReceiptRow
                        label="Subscribers"
                        value={
                          <span className="inline-flex items-center gap-1">
                            {plan.subscriberCount ?? 0}
                            {!plan.availableToNewTenants && (
                              <span title="Not available to new tenants" className="inline-flex text-stamp">
                                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                                <span className="sr-only">Not available to new tenants</span>
                              </span>
                            )}
                          </span>
                        }
                      />
                      <ReceiptRow label="New tenants" value={plan.availableToNewTenants ? 'Open' : 'Closed'} />
                    </div>

                    <div className="space-y-1.5 border-t border-dashed border-ink/30 px-5 py-4 font-receipt text-sm">
                      <p className="mb-1 text-xs uppercase tracking-[0.14em] text-ink/60">Limits</p>
                      <ReceiptRow label="Users" value={formatLimit(plan.features.maxUsers)} />
                      <ReceiptRow label="Branches" value={formatLimit(plan.features.maxBranches)} />
                      <ReceiptRow label="Products" value={formatLimit(plan.features.maxProducts)} />
                      <ReceiptRow label="Transactions" value={formatLimit(plan.features.maxTransactions)} />
                    </div>

                    <div className="border-t border-dashed border-ink/30 px-5 py-4">
                      <p className="mb-2 font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">Includes · {included.length}</p>
                      {included.length === 0 ? (
                        <p className="font-receipt text-sm text-ink/50">No extra features</p>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {included.map(f => (
                            <li key={f.key} className="flex items-center gap-2">
                              <Check className="h-3.5 w-3.5 shrink-0 text-brand-hover" strokeWidth={1.75} aria-hidden />
                              {f.label}
                            </li>
                          ))}
                        </ul>
                      )}
                      {bir.length > 0 && (
                        <>
                          <p className="mb-2 mt-4 font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">BIR · {bir.length}</p>
                          <ul className="space-y-1 text-sm">
                            {bir.map(f => (
                              <li key={f.key} className="flex items-center gap-2">
                                <Check className="h-3.5 w-3.5 shrink-0 text-brand-hover" strokeWidth={1.75} aria-hidden />
                                {f.label}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>

                    <div className="flex gap-2 border-t border-dashed border-ink/30 px-5 py-3">
                      <button type="button" onClick={() => openEdit(plan)} className={`${KEY_SM} flex-1`}>
                        <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(plan)} className={`${KEY_SM_DANGER} flex-1`}>
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Create / Edit sheet */}
      {showModal && (
        <Sheet
          title={editingPlan ? 'Edit plan' : 'Create plan'}
          onClose={() => setShowModal(false)}
          closeLabel="Close"
          wide
          footer={
            <>
              <button type="button" onClick={() => setShowModal(false)} className={KEY}>
                Cancel
              </button>
              <button type="submit" form="plan-form" disabled={saving} className={KEY_PRIMARY}>
                {saving ? 'Saving…' : editingPlan ? 'Save changes' : 'Create plan'}
              </button>
            </>
          }
        >
          <form id="plan-form" onSubmit={handleSave} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="plan-name" className={LABEL}>Name <span className="text-stamp">*</span></label>
                <input
                  id="plan-name"
                  type="text" required
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  className={INPUT}
                  placeholder="Pro"
                />
              </div>
              <div>
                <label htmlFor="plan-tier" className={LABEL}>Tier <span className="text-stamp">*</span></label>
                <select
                  id="plan-tier"
                  value={formData.tier}
                  onChange={e => setFormData(f => ({ ...f, tier: e.target.value }))}
                  disabled={!!editingPlan}
                  className={`${SELECT} w-full capitalize disabled:bg-ink/5 disabled:text-ink/50`}
                >
                  {TIER_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="plan-desc" className={LABEL}>Description</label>
              <input
                id="plan-desc"
                type="text"
                value={formData.description}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                className={INPUT}
                placeholder="Short description"
              />
            </div>

            <fieldset className="border-t border-dashed border-ink/30 pt-4">
              <legend className={SECTION}>Pricing</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="plan-monthly" className={LABEL}>Monthly price</label>
                  <input
                    id="plan-monthly"
                    type="number" min="0"
                    value={formData.price.monthly}
                    onChange={e => setFormData(f => ({ ...f, price: { ...f.price, monthly: Number(e.target.value) } }))}
                    className={`${INPUT} font-receipt`}
                  />
                </div>
                <div>
                  <label htmlFor="plan-setup" className={LABEL}>Setup fee</label>
                  <input
                    id="plan-setup"
                    type="number" min="0"
                    value={formData.price.setupFee}
                    onChange={e => setFormData(f => ({ ...f, price: { ...f.price, setupFee: Number(e.target.value) } }))}
                    className={`${INPUT} font-receipt`}
                  />
                </div>
                <div>
                  <label htmlFor="plan-currency" className={LABEL}>Currency</label>
                  <input
                    id="plan-currency"
                    type="text" maxLength={3}
                    value={formData.price.currency}
                    onChange={e => setFormData(f => ({ ...f, price: { ...f.price, currency: e.target.value.toUpperCase() } }))}
                    className={`${INPUT} font-receipt`}
                  />
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="plan-yearly" className={LABEL}>Yearly discount (%)</label>
                  <input
                    id="plan-yearly"
                    type="number" min="0" max="100"
                    value={formData.yearlyDiscount}
                    onChange={e => setFormData(f => ({ ...f, yearlyDiscount: Number(e.target.value) }))}
                    className={`${INPUT} font-receipt`}
                    placeholder="0"
                  />
                </div>
                <div className="flex items-end">
                  <label className={CHECK_ROW}>
                    <input
                      type="checkbox"
                      checked={formData.availableToNewTenants}
                      onChange={e => setFormData(f => ({ ...f, availableToNewTenants: e.target.checked }))}
                      className={CHECKBOX}
                    />
                    Available to new tenants
                  </label>
                </div>
              </div>
            </fieldset>

            <fieldset className="border-t border-dashed border-ink/30 pt-4">
              <legend className={SECTION}>
                Limits <span className="normal-case tracking-normal text-ink/50">(-1 = unlimited)</span>
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['maxUsers', 'maxBranches', 'maxProducts', 'maxTransactions'] as const).map(key => (
                  <div key={key}>
                    <label htmlFor={`plan-${key}`} className={LABEL}>{key.replace('max', 'Max ')}</label>
                    <input
                      id={`plan-${key}`}
                      type="number" min="-1"
                      value={formData.features[key] as number}
                      onChange={e => setFeature(key, parseInt(e.target.value))}
                      className={`${INPUT} font-receipt`}
                    />
                  </div>
                ))}
              </div>
            </fieldset>

            <fieldset className="border-t border-dashed border-ink/30 pt-4">
              <legend className={SECTION}>Features</legend>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {BOOL_FEATURES.map(({ key, label }) => (
                  <label key={key} className={CHECK_ROW}>
                    <input
                      type="checkbox"
                      checked={formData.features[key] as boolean}
                      onChange={e => setFeature(key, e.target.checked)}
                      className={CHECKBOX}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="border-t border-dashed border-ink/30 pt-4">
              <legend className={SECTION}>BIR compliance</legend>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {BIR_FIELDS.map(({ key, label }) => (
                  <label key={key} className={CHECK_ROW}>
                    <input
                      type="checkbox"
                      checked={formData.birCompliance[key]}
                      onChange={e => setBir(key, e.target.checked)}
                      className={CHECKBOX}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="border-t border-dashed border-ink/30 pt-4">
              <label className={CHECK_ROW}>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={e => setFormData(f => ({ ...f, isActive: e.target.checked }))}
                  className={CHECKBOX}
                />
                Plan is active (visible to tenants)
              </label>
            </div>

            {formError && <Strip tone="error">{formError}</Strip>}
          </form>
        </Sheet>
      )}
    </SaPage>
  );
}
