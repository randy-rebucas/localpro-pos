'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

interface Discount {
  _id: string;
  code: string;
  name?: string;
  description?: string;
  type: 'percentage' | 'fixed';
  value: number;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  validFrom: string;
  validUntil: string;
  usageLimit?: number;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
}

export default function DiscountsPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const { settings } = useTenantSettings();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchDiscounts();
  }, [lang, tenant]);

  const fetchDiscounts = async () => {
    try {
      const res = await fetch('/api/discounts', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setDiscounts(data.data);
    } catch (error) {
      console.error('Error fetching discounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDiscount = async (discountId: string) => {
    if (!confirm('Are you sure you want to delete this discount?')) return;
    try {
      const res = await fetch(`/api/discounts/${discountId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Discount deleted successfully' });
        fetchDiscounts();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete discount' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete discount' });
    }
  };

  const handleToggleDiscountStatus = async (discount: Discount) => {
    try {
      const res = await fetch(`/api/discounts/${discount._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !discount.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Discount ${!discount.isActive ? 'activated' : 'deactivated'} successfully` });
        fetchDiscounts();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update discount' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update discount' });
    }
  };

  const isDiscountValid = (discount: Discount) => {
    const now = new Date();
    const validFrom = new Date(discount.validFrom);
    const validUntil = new Date(discount.validUntil);
    return now >= validFrom && now <= validUntil && discount.isActive;
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.discounts || 'Discounts'}
              </h1>
              <p className="text-gray-600">{dict.admin?.discountsSubtitle || 'Manage discount codes and promotions'}</p>
            </div>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin`)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {dict.common?.back || 'Back'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{dict.admin?.discounts || 'Discounts'}</h2>
            <button
              onClick={() => {
                setEditingDiscount(null);
                setShowDiscountModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              {dict.common?.add || 'Add'} {dict.admin?.discount || 'Discount'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.name || 'Name'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.type || 'Type'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valid Period</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {discounts.map((discount) => {
                  const isValid = isDiscountValid(discount);
                  return (
                    <tr key={discount._id}>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono font-bold text-gray-900">{discount.code}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">{discount.name || '-'}</div>
                        {discount.description && (
                          <div className="text-xs text-gray-500 mt-1">{discount.description.substring(0, 50)}...</div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {discount.type}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {discount.type === 'percentage' ? `${discount.value}%` : <Currency amount={discount.value} />}
                        {discount.maxDiscountAmount && discount.type === 'percentage' && (
                          <div className="text-xs text-gray-500">Max: <Currency amount={discount.maxDiscountAmount} /></div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>{new Date(discount.validFrom).toLocaleDateString()}</div>
                        <div className="text-xs">to {new Date(discount.validUntil).toLocaleDateString()}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {discount.usageCount} / {discount.usageLimit || '∞'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          isValid ? 'bg-green-100 text-green-800' : 
                          !discount.isActive ? 'bg-red-100 text-red-800' : 
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {isValid ? 'Valid' : !discount.isActive ? 'Inactive' : 'Expired'}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingDiscount(discount);
                              setShowDiscountModal(true);
                            }}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            {dict.common?.edit || 'Edit'}
                          </button>
                          <button
                            onClick={() => handleToggleDiscountStatus(discount)}
                            className={discount.isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}
                          >
                            {discount.isActive ? (dict.admin?.deactivate || 'Deactivate') : (dict.admin?.activate || 'Activate')}
                          </button>
                          <button
                            onClick={() => handleDeleteDiscount(discount._id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            {dict.common?.delete || 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {discounts.length === 0 && (
              <div className="text-center py-8 text-gray-500">{dict.common?.noResults || 'No discounts found'}</div>
            )}
          </div>
        </div>

        {showDiscountModal && (
          <DiscountModal
            discount={editingDiscount}
            onClose={() => {
              setShowDiscountModal(false);
              setEditingDiscount(null);
            }}
            onSave={() => {
              fetchDiscounts();
              setShowDiscountModal(false);
              setEditingDiscount(null);
            }}
            dict={dict}
          />
        )}
      </div>
    </div>
  );
}

function DiscountModal({
  discount,
  onClose,
  onSave,
  dict,
}: {
  discount: Discount | null;
  onClose: () => void;
  onSave: () => void;
  dict: any;
}) {
  const [formData, setFormData] = useState({
    code: discount?.code || '',
    name: discount?.name || '',
    description: discount?.description || '',
    type: discount?.type || 'percentage',
    value: discount?.value || 0,
    minPurchaseAmount: discount?.minPurchaseAmount || 0,
    maxDiscountAmount: discount?.maxDiscountAmount || 0,
    validFrom: discount ? new Date(discount.validFrom).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    validUntil: discount ? new Date(discount.validUntil).toISOString().split('T')[0] : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    usageLimit: discount?.usageLimit || 0,
    isActive: discount?.isActive !== undefined ? discount.isActive : true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { settings } = useTenantSettings();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const url = discount ? `/api/discounts/${discount._id}` : '/api/discounts';
      const method = discount ? 'PUT' : 'POST';
      const body = {
        code: formData.code.toUpperCase(),
        name: formData.name || undefined,
        description: formData.description || undefined,
        type: formData.type,
        value: formData.value,
        minPurchaseAmount: formData.minPurchaseAmount > 0 ? formData.minPurchaseAmount : undefined,
        maxDiscountAmount: formData.maxDiscountAmount > 0 ? formData.maxDiscountAmount : undefined,
        validFrom: new Date(formData.validFrom),
        validUntil: new Date(formData.validUntil),
        usageLimit: formData.usageLimit > 0 ? formData.usageLimit : undefined,
        isActive: formData.isActive,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        onSave();
      } else {
        setError(data.error || 'Failed to save discount');
      }
    } catch (error) {
      setError('Failed to save discount');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {discount ? (dict.admin?.editDiscount || 'Edit Discount') : (dict.admin?.addDiscount || 'Add Discount')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Code *
                </label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="DISCOUNT10"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.common?.type || 'Type'} *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.name || 'Name'}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.description || 'Description'}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Value * {formData.type === 'percentage' ? '(%)' : `(${settings?.currency || 'USD'})`}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {formData.type === 'percentage' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Discount Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.maxDiscountAmount}
                    onChange={(e) => setFormData({ ...formData, maxDiscountAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Purchase Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.minPurchaseAmount}
                  onChange={(e) => setFormData({ ...formData, minPurchaseAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Usage Limit
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.usageLimit}
                  onChange={(e) => setFormData({ ...formData, usageLimit: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="Unlimited if 0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valid From *
                </label>
                <input
                  type="date"
                  required
                  value={formData.validFrom}
                  onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valid Until *
                </label>
                <input
                  type="date"
                  required
                  value={formData.validUntil}
                  onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">
                  {dict.admin?.active || 'Active'}
                </span>
              </label>
            </div>
            {error && (
              <div className="bg-red-50 text-red-800 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (dict.common?.loading || 'Saving...') : (dict.common?.save || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

