'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import { useDiscountsList, type Discount } from '@/hooks/useDiscountsList';
import { useDiscountsForm } from '@/hooks/useDiscountsForm';
import {
  getStatusBadgeClass,
  getStatusLabel,
  getDeleteConfirmMessage,
  getToggleButtonLabel,
  getToggleButtonClass,
  formatDate,
} from '@/lib/discounts-helpers';

export default function DiscountsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);

  const {
    discounts,
    loading,
    message,
    fetchDiscounts,
    deleteDiscount,
    toggleDiscountStatus,
    clearMessage,
  } = useDiscountsList();

  const { settings } = useTenantSettings();
  const discountsEnabled = supportsFeature(settings ?? undefined, 'discounts');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchDiscounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  const handleDeleteDiscount = async (discountId: string) => {
    if (!dict) return;
    if (!confirm(getDeleteConfirmMessage(dict))) return;

    const success = await deleteDiscount(discountId);
    if (success) {
      clearMessage();
      await fetchDiscounts();
    }
  };

  const handleToggleDiscountStatus = async (discount: Discount) => {
    const success = await toggleDiscountStatus(discount._id, !discount.isActive);
    if (success) {
      clearMessage();
      await fetchDiscounts();
    }
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-brand hover:text-brand-hover font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.discounts || 'Discounts'}
              </h1>
              <p className="text-gray-600">{dict.admin?.discountsSubtitle || 'Manage discount codes and promotions'}</p>
            </div>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        {!discountsEnabled && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-300 text-yellow-800">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                  {dict.admin?.discountsNotAvailable || 'Discounts Not Available'}
                </h3>
                <p className="text-yellow-800">
                  {(dict.admin?.discountsNotAvailableDesc || 'Discounts are not enabled for {businessType}.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
                </p>
                <p className="text-sm text-yellow-700 mt-2">
                  {dict.admin?.discountsNotAvailableHint || 'If you need discounts, please enable it in Settings or update your business type.'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{dict.admin?.discounts || 'Discounts'}</h2>
            {discountsEnabled && (
              <button
                onClick={() => {
                  setEditingDiscount(null);
                  setShowDiscountModal(true);
                }}
                className="px-4 py-2 bg-brand text-white hover:bg-brand-hover font-medium border border-brand-hover"
              >
                {dict.common?.add || 'Add'} {dict.admin?.discount || 'Discount'}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.code || 'Code'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.name || 'Name'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.type || 'Type'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.value || 'Value'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.validPeriod || 'Valid Period'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.usage || 'Usage'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {discounts.map((discount) => {
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
                        <span className="px-2 py-1 text-xs font-semibold border border-teal-300 bg-brand-soft text-brand-navy">
                          {discount.type}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {discount.type === 'percentage' ? `${discount.value}%` : <Currency amount={discount.value} />}
                        {discount.maxDiscountAmount && discount.type === 'percentage' && (
                          <div className="text-xs text-gray-500">{dict.admin?.maxLabel || 'Max'}: <Currency amount={discount.maxDiscountAmount} /></div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>{formatDate(discount.validFrom)}</div>
                        <div className="text-xs">{dict.admin?.to || 'to'} {formatDate(discount.validUntil)}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {discount.usageCount} / {discount.usageLimit || '∞'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold border ${getStatusBadgeClass(discount)}`}>
                          {getStatusLabel(discount, dict)}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingDiscount(discount);
                              setShowDiscountModal(true);
                            }}
                            className="text-brand hover:text-brand-navy-deep"
                          >
                            {dict.common?.edit || 'Edit'}
                          </button>
                          <button
                            onClick={() => handleToggleDiscountStatus(discount)}
                            className={getToggleButtonClass(discount.isActive)}
                          >
                            {getToggleButtonLabel(discount.isActive, dict)}
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

        {showDiscountModal && discountsEnabled && (
          <DiscountModal
            discount={editingDiscount}
            onClose={() => {
              setShowDiscountModal(false);
              setEditingDiscount(null);
            }}
            onSave={async () => {
              await fetchDiscounts();
              setShowDiscountModal(false);
              setEditingDiscount(null);
            }}
            dict={dict}
            settings={settings}
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
  settings,
}: {
  discount: Discount | null;
  onClose: () => void;
  onSave: () => Promise<void>;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  settings: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const { formData, setFormData, error, submitting, handleSubmit, initializeForm, resetForm } = useDiscountsForm();
  const { createDiscount, updateDiscount } = useDiscountsList();

  useEffect(() => {
    if (discount) {
      initializeForm(discount);
    } else {
      resetForm();
    }
  }, [discount, initializeForm, resetForm]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit(async (payload) => {
      const isEdit = !!discount;
      const success = isEdit ? await updateDiscount(discount._id, payload) : await createDiscount(payload);
      if (success) {
        await onSave();
      }
      return success;
    });
  };

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {discount ? (dict.admin?.editDiscount || 'Edit Discount') : (dict.admin?.addDiscount || 'Add Discount')}
          </h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.code || 'Code'} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ code: e.target.value.toUpperCase() })}
                  readOnly={!!discount}
                  maxLength={50}
                  className={`w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand ${discount ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
                  placeholder={dict?.admin?.discountCodePlaceholder || 'DISCOUNT10'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.common?.type || 'Type'} *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ type: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                >
                  <option value="percentage">{dict.admin?.percentage || 'Percentage'}</option>
                  <option value="fixed">{dict.admin?.fixed || 'Fixed Amount'}</option>
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
                onChange={(e) => setFormData({ name: e.target.value })}
                maxLength={100}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.category || 'Category'}
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ category: e.target.value as 'general' | 'senior' | 'pwd' | 'employee' | 'promo' })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                >
                  <option value="general">{dict.admin?.categoryGeneral || 'General'}</option>
                  <option value="senior">{dict.admin?.categorySenior || 'Senior Citizen (RA 9994)'}</option>
                  <option value="pwd">{dict.admin?.categoryPwd || 'PWD (RA 10754)'}</option>
                  <option value="employee">{dict.admin?.categoryEmployee || 'Employee'}</option>
                  <option value="promo">{dict.admin?.categoryPromo || 'Promo'}</option>
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.requiresIdVerification}
                    onChange={(e) => setFormData({ requiresIdVerification: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">{dict.admin?.requiresId || 'Requires ID verification'}</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.description || 'Description'}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.value || 'Value'} * {formData.type === 'percentage' ? '(%)' : `(${settings?.currency || 'USD'})`}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.value}
                  onChange={(e) => setFormData({ value: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
              {formData.type === 'percentage' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dict.admin?.maxDiscount || 'Max Discount Amount'} ({settings?.currencySymbol || '$'})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.maxDiscountAmount}
                    onChange={(e) => setFormData({ maxDiscountAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dict.admin?.minPurchase || 'Min Purchase Amount'} ({settings?.currencySymbol || '$'})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.minPurchaseAmount}
                  onChange={(e) => setFormData({ minPurchaseAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.usageLimit || 'Usage Limit'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.usageLimit}
                  onChange={(e) => setFormData({ usageLimit: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                  placeholder={dict.admin?.unlimited || 'Unlimited if 0'}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.validFrom || 'Valid From'} *
                </label>
                <input
                  type="date"
                  required
                  value={formData.validFrom}
                  onChange={(e) => setFormData({ validFrom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.validUntil || 'Valid Until'} *
                </label>
                <input
                  type="date"
                  required
                  value={formData.validUntil}
                  onChange={(e) => setFormData({ validUntil: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
            </div>
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ isActive: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">
                  {dict.admin?.active || 'Active'}
                </span>
              </label>
            </div>
            {error && (
              <div className="bg-red-50 text-red-800 border border-red-300 p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-brand text-white hover:bg-brand-hover disabled:opacity-50 border border-brand-hover"
              >
                {submitting ? (dict.common?.saving || 'Saving...') : (dict.common?.save || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

