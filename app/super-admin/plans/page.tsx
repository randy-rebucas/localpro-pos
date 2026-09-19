'use client';

import { useEffect, useState, useCallback } from 'react';
import { showToast } from '@/lib/toast';
import Win8Drawer from '@/components/admin/Win8Drawer';

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
  id: string;
  name: string;
  tier: string;
  description?: string;
  priceMonthly: number;
  priceSetupFee: number;
  priceCurrency: string;
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
  birPtuAssistance: boolean;
  birReceiptFormatting: boolean;
  birDocumentation: boolean;
  birCasReporting: boolean;
  birAuditTrailSystem: boolean;
  birMonthlySupport: boolean;
  isActive: boolean;
  isCustom: boolean;
  availableToNewTenants: boolean;
  yearlyDiscount: number;
  subscriberCount?: number;
}

const TIER_ORDER = ['starter', 'pro', 'business', 'enterprise'];

const TIER_BADGE: Record<string, string> = {
  starter: 'bg-gray-500 text-white',
  pro: 'bg-brand text-white',
  business: 'bg-win8-accent text-white',
  enterprise: 'bg-brand-navy text-white',
};

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
      price: { monthly: plan.priceMonthly, setupFee: plan.priceSetupFee, currency: plan.priceCurrency },
      features: {
        maxUsers: plan.maxUsers,
        maxBranches: plan.maxBranches,
        maxProducts: plan.maxProducts,
        maxTransactions: plan.maxTransactions,
        enableInventory: plan.enableInventory,
        enableCategories: plan.enableCategories,
        enableDiscounts: plan.enableDiscounts,
        enableLoyaltyProgram: plan.enableLoyaltyProgram,
        enableCustomerManagement: plan.enableCustomerManagement,
        enableBookingScheduling: plan.enableBookingScheduling,
        enableReports: plan.enableReports,
        enableMultiBranch: plan.enableMultiBranch,
        enableHardwareIntegration: plan.enableHardwareIntegration,
        prioritySupport: plan.prioritySupport,
        customIntegrations: plan.customIntegrations,
        dedicatedAccountManager: plan.dedicatedAccountManager,
      },
      birCompliance: {
        ptuAssistance: plan.birPtuAssistance,
        receiptFormatting: plan.birReceiptFormatting,
        birDocumentation: plan.birDocumentation,
        casReporting: plan.birCasReporting,
        auditTrailSystem: plan.birAuditTrailSystem,
        monthlySupport: plan.birMonthlySupport,
      },
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
      const url = editingPlan ? `/api/super-admin/plans/${editingPlan.id}` : '/api/super-admin/plans';
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
        showToast.success(editingPlan ? 'Plan updated' : 'Plan created');
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
      const res = await fetch(`/api/super-admin/plans/${plan.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        showToast.success(data.message || 'Plan deleted');
        fetchPlans();
      } else {
        showToast.error(data.error || 'Failed to delete plan');
      }
    } catch {
      showToast.error('An error occurred');
    }
  };

  const setFeature = (key: keyof PlanFeatures, value: boolean | number) =>
    setFormData(f => ({ ...f, features: { ...f.features, [key]: value } }));

  const setBir = (key: keyof BirCompliance, value: boolean) =>
    setFormData(f => ({ ...f, birCompliance: { ...f.birCompliance, [key]: value } }));

  const formatLimit = (v: number) => v === -1 ? '∞' : v.toLocaleString();

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <button onClick={openCreate} className="px-4 py-2 bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors">
            + New Plan
          </button>
        </div>

        <div className="bg-white border border-gray-300">
          {loading ? (
            <div className="p-12 text-center">
              <div className="win8-spinner text-brand mx-auto">
                <span /><span /><span /><span /><span />
              </div>
              <p className="mt-3 text-gray-500 text-sm">Loading plans...</p>
            </div>
          ) : plans.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              No plans found. Use Settings → Seed Plans to create defaults.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-brand-navy text-white">
                  <tr>
                    {['Name', 'Tier', 'Monthly Price', 'Yearly Disc.', 'Subscribers', 'Max Users', 'Active', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {plans.filter(Boolean).map(plan => (
                    <tr key={plan.id} className="hover:bg-gray-100 transition-colors">
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-gray-900">{plan.name}</p>
                        {plan.description && <p className="text-xs text-gray-400 mt-0.5">{plan.description}</p>}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-0.5 text-xs font-semibold capitalize ${TIER_BADGE[plan.tier] || 'bg-gray-500 text-white'}`}>
                          {plan.tier}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">
                        {Number(plan.priceMonthly) === 0 ? 'Free' : `${plan.priceCurrency} ${Number(plan.priceMonthly).toLocaleString()}`}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {plan.yearlyDiscount ? <span className="text-win8-success font-medium">{plan.yearlyDiscount}% off</span> : '—'}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700 font-medium">
                        {plan.subscriberCount ?? 0}
                        {!plan.availableToNewTenants && <span className="ml-1 text-xs text-win8-warning" title="Not available to new tenants">⚠</span>}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">{formatLimit(plan.maxUsers)}</td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-0.5 text-xs font-semibold ${plan.isActive ? 'bg-win8-success text-white' : 'bg-gray-500 text-white'}`}>
                          {plan.isActive ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => openEdit(plan)} title="Edit" aria-label="Edit"
                            className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDelete(plan)} title="Delete" aria-label="Delete"
                            className="inline-flex items-center justify-center p-2.5 text-white bg-win8-danger hover:brightness-110 transition-[filter]">
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
        </div>
      </div>

      {/* Create / Edit Drawer */}
      <Win8Drawer open={showModal} onClose={() => setShowModal(false)}>
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">{editingPlan ? 'Edit Plan' : 'Create Plan'}</h2>
          <button onClick={() => setShowModal(false)} title="Close" aria-label="Close" className="text-white/70 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-win8-danger">*</span></label>
                <input
                  type="text" required
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none bg-white"
                  placeholder="Pro"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tier <span className="text-win8-danger">*</span></label>
                <select
                  value={formData.tier}
                  onChange={e => setFormData(f => ({ ...f, tier: e.target.value }))}
                  disabled={!!editingPlan}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none bg-white disabled:bg-gray-100"
                >
                  {TIER_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none bg-white"
                placeholder="Short description"
              />
            </div>

            {/* Pricing */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Pricing</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Monthly Price</label>
                  <input
                    type="number" min="0"
                    value={formData.price.monthly}
                    onChange={e => setFormData(f => ({ ...f, price: { ...f.price, monthly: Number(e.target.value) } }))}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Setup Fee</label>
                  <input
                    type="number" min="0"
                    value={formData.price.setupFee}
                    onChange={e => setFormData(f => ({ ...f, price: { ...f.price, setupFee: Number(e.target.value) } }))}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Currency</label>
                  <input
                    type="text" maxLength={3}
                    value={formData.price.currency}
                    onChange={e => setFormData(f => ({ ...f, price: { ...f.price, currency: e.target.value.toUpperCase() } }))}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none bg-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Yearly Discount (%)</label>
                  <input
                    type="number" min="0" max="100"
                    value={formData.yearlyDiscount}
                    onChange={e => setFormData(f => ({ ...f, yearlyDiscount: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none bg-white"
                    placeholder="0"
                  />
                </div>
                <div className="flex items-end pb-2 gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={formData.availableToNewTenants}
                      onChange={e => setFormData(f => ({ ...f, availableToNewTenants: e.target.checked }))}
                      className="checkbox-win8" />
                    Available to new tenants
                  </label>
                </div>
              </div>
            </div>

            {/* Limits */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Limits <span className="text-xs text-gray-400 font-normal">(-1 = unlimited)</span></p>
              <div className="grid grid-cols-2 gap-3">
                {(['maxUsers', 'maxBranches', 'maxProducts', 'maxTransactions'] as const).map(key => (
                  <div key={key}>
                    <label className="block text-xs text-gray-500 mb-1 capitalize">{key.replace('max', 'Max ')}</label>
                    <input
                      type="number" min="-1"
                      value={formData.features[key] as number}
                      onChange={e => setFeature(key, parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none bg-white"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Features */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Features</p>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                {BOOL_FEATURES.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.features[key] as boolean}
                      onChange={e => setFeature(key, e.target.checked)}
                      className="checkbox-win8"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* BIR Compliance */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">BIR Compliance</p>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                {BIR_FIELDS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.birCompliance[key]}
                      onChange={e => setBir(key, e.target.checked)}
                      className="checkbox-win8"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Active */}
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={e => setFormData(f => ({ ...f, isActive: e.target.checked }))}
                className="checkbox-win8"
              />
              Plan is active (visible to tenants)
            </label>

            {formError && <div className="bg-white border border-win8-danger text-win8-danger text-sm p-3">{formError}</div>}
          </div>

          <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-200 shrink-0">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 bg-white transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : editingPlan ? 'Save Changes' : 'Create Plan'}
            </button>
          </div>
        </form>
      </Win8Drawer>
    </>
  );
}
