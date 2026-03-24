'use client';

import { useEffect, useState, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';

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

  return (
    <SuperAdminShell>
      <div className="p-6 w-full">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
            <p className="text-sm text-gray-500 mt-1">Manage subscription tiers and pricing</p>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            + New Plan
          </button>
        </div>

        {message && (
          <div className={`mb-4 p-3 border text-sm ${message.type === 'success' ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-200">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
              <p className="mt-3 text-gray-500 text-sm">Loading plans...</p>
            </div>
          ) : plans.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              No plans found. Use Settings → Seed Plans to create defaults.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Name', 'Tier', 'Monthly Price', 'Max Users', 'Max Branches', 'Active', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {plans.map(plan => (
                    <tr key={plan._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-gray-900">{plan.name}</p>
                        {plan.description && <p className="text-xs text-gray-400 mt-0.5">{plan.description}</p>}
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200 capitalize">
                          {plan.tier}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">
                        {plan.price.monthly === 0 ? 'Free' : `${plan.price.currency} ${plan.price.monthly.toLocaleString()}`}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">{formatLimit(plan.features.maxUsers)}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{formatLimit(plan.features.maxBranches)}</td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-0.5 text-xs font-semibold border ${plan.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                          {plan.isActive ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="flex gap-3">
                          <button onClick={() => openEdit(plan)} className="text-blue-600 hover:text-blue-800 font-medium">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(plan)} className="text-red-600 hover:text-red-800 font-medium">
                            Delete
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

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-5">
                {editingPlan ? 'Edit Plan' : 'Create Plan'}
              </h2>
              <form onSubmit={handleSave} className="space-y-5">
                {/* Basic info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                    <input
                      type="text" required
                      value={formData.name}
                      onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="Pro"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tier <span className="text-red-500">*</span></label>
                    <select
                      value={formData.tier}
                      onChange={e => setFormData(f => ({ ...f, tier: e.target.value }))}
                      disabled={!!editingPlan}
                      className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50"
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
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
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
                        className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Setup Fee</label>
                      <input
                        type="number" min="0"
                        value={formData.price.setupFee}
                        onChange={e => setFormData(f => ({ ...f, price: { ...f.price, setupFee: Number(e.target.value) } }))}
                        className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Currency</label>
                      <input
                        type="text" maxLength={3}
                        value={formData.price.currency}
                        onChange={e => setFormData(f => ({ ...f, price: { ...f.price, currency: e.target.value.toUpperCase() } }))}
                        className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                      />
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
                          className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
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
                          className="rounded border-gray-300 text-blue-600"
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
                          className="rounded border-gray-300 text-blue-600"
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
                    className="rounded border-gray-300 text-blue-600"
                  />
                  Plan is active (visible to tenants)
                </label>

                {formError && <div className="bg-red-50 border border-red-300 text-red-800 text-sm p-3">{formError}</div>}

                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 bg-white">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Saving...' : editingPlan ? 'Save Changes' : 'Create Plan'}
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
