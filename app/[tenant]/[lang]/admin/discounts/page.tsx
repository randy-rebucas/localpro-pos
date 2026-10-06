'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import { useDiscountsList, type Discount } from '@/hooks/useDiscountsList';
import { useDiscountsForm } from '@/hooks/useDiscountsForm';
import { usePermissions } from '@/hooks/usePermissions';
import { showToast } from '@/lib/toast';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import {
  getStatusBadgeClass,
  getStatusLabel,
  getTypeBadgeClass,
  getTypeLabel,
  getDeleteConfirmMessage,
  getDeleteSuccessMessage,
  getSaveSuccessMessage,
  getToggleStatusMessage,
  getToggleButtonLabel,
  getToggleButtonClass,
  formatDate,
} from '@/lib/discounts-helpers';

const SPINNER_SM = (
  <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>
);

export default function DiscountsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const { canAccess } = usePermissions();
  const canCreate = canAccess('discounts.create');
  // Edit and activate/deactivate both go through PUT /api/discounts/[id].
  const canEdit = canAccess('discounts.edit');
  const canDelete = canAccess('discounts.delete');
  const showRowActions = canEdit || canDelete;

  const {
    discounts,
    loading,
    error,
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

  // Action failures from the list hook surface as toasts; successes are
  // toasted below with localized text, so the hook's own copy is dropped.
  useEffect(() => {
    if (!message) return;
    if (message.type === 'error') showToast.error(message.text);
    clearMessage();
  }, [message, clearMessage]);

  const openForm = (discount: Discount | null) => {
    clearMessage();
    setEditingDiscount(discount);
    setFormKey(k => k + 1);
    setShowForm(true);
  };

  const handleDeleteDiscount = async (discount: Discount) => {
    if (!dict) return;
    if (!confirm(getDeleteConfirmMessage(dict, discount.code))) return;

    setBusyId(discount._id);
    const success = await deleteDiscount(discount._id);
    if (success) {
      showToast.success(getDeleteSuccessMessage(dict));
      await fetchDiscounts();
    }
    setBusyId(null);
  };

  const handleToggleDiscountStatus = async (discount: Discount) => {
    setBusyId(discount._id);
    const success = await toggleDiscountStatus(discount._id, !discount.isActive);
    if (success) {
      showToast.success(getToggleStatusMessage(!discount.isActive, dict));
      await fetchDiscounts();
    }
    setBusyId(null);
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const filtered = query
    ? discounts.filter(d => d.code.toLowerCase().includes(query) || (d.name || '').toLowerCase().includes(query))
    : discounts;

  const renderBody = () => {
    if (loading && discounts.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingDiscounts || 'Loading discounts…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            onClick={() => fetchDiscounts()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {query
            ? (dict.admin?.noDiscountsMatch || 'No discounts match your search.')
            : (dict.admin?.noDiscountsYet || 'No discounts yet.')}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.code || 'Code'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.name || 'Name'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.common?.type || 'Type'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.admin?.value || 'Value'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.validPeriod || 'Valid Period'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.admin?.usage || 'Usage'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
              {showRowActions && (
                <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.map((discount) => {
              const toggleLabel = getToggleButtonLabel(discount.isActive, dict);
              const editLabel = dict.common?.edit || 'Edit';
              const deleteLabel = dict.common?.delete || 'Delete';
              const busy = busyId === discount._id;
              return (
                <tr
                  key={discount._id}
                  className={`hover:bg-gray-100 transition-colors ${showForm && editingDiscount?._id === discount._id ? 'bg-brand-soft' : ''}`}
                >
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs font-bold text-gray-900">{discount.code}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{discount.name || '—'}</p>
                    {discount.description && (
                      <p className="text-xs text-gray-500 max-w-[240px] truncate" title={discount.description}>
                        {discount.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-xs font-semibold ${getTypeBadgeClass(discount.type)}`}>
                      {getTypeLabel(discount.type, dict)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-900">
                    {discount.type === 'percentage' ? `${discount.value}%` : <Currency amount={discount.value} />}
                    {discount.maxDiscountAmount && discount.type === 'percentage' ? (
                      <p className="text-xs text-gray-500">{dict.admin?.maxLabel || 'Max'}: <Currency amount={discount.maxDiscountAmount} /></p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">
                    <p>{formatDate(discount.validFrom)}</p>
                    <p className="text-gray-500">{dict.admin?.to || 'to'} {formatDate(discount.validUntil)}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700">
                    {discount.usageCount.toLocaleString()} / {discount.usageLimit ? discount.usageLimit.toLocaleString() : '∞'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClass(discount)}`}>
                      {getStatusLabel(discount, dict)}
                    </span>
                  </td>
                  {showRowActions && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {canEdit && (<button
                          onClick={() => openForm(discount)}
                          disabled={!discountsEnabled}
                          title={editLabel}
                          aria-label={`${editLabel} ${discount.code}`}
                          className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 disabled:opacity-50 transition-[filter]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                          </svg>
                        </button>)}
                        {canEdit && (<button
                          onClick={() => handleToggleDiscountStatus(discount)}
                          disabled={busy}
                          title={toggleLabel}
                          aria-label={`${toggleLabel} ${discount.code}`}
                          className={`inline-flex items-center justify-center p-2.5 text-white ${getToggleButtonClass(discount.isActive)} hover:brightness-110 disabled:opacity-50 transition-[filter]`}
                        >
                          {busy ? SPINNER_SM : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d={discount.isActive ? 'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10' : 'm5 12 5 5L20 7'}
                              />
                            </svg>
                          )}
                        </button>)}
                        {canDelete && (<button
                          onClick={() => handleDeleteDiscount(discount)}
                          disabled={busy}
                          title={deleteLabel}
                          aria-label={`${deleteLabel} ${discount.code}`}
                          className="inline-flex items-center justify-center p-2.5 text-white bg-win8-danger hover:brightness-110 disabled:opacity-50 transition-[filter]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z" />
                          </svg>
                        </button>)}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.discounts || 'Discounts'}
          description={dict.admin?.discountsSubtitle || 'Manage discount codes and promotions'}
        />

        <div className="space-y-4">
          {!discountsEnabled && (
            <div className="p-4 bg-white border border-win8-warning">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 shrink-0 mt-0.5 text-win8-warning" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h2 className="text-base font-bold text-win8-warning mb-1">
                    {dict.admin?.discountsNotAvailable || 'Discounts Not Available'}
                  </h2>
                  <p className="text-sm text-gray-700">
                    {(dict.admin?.discountsNotAvailableDesc || 'Discounts are not enabled for {businessType}.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {dict.admin?.discountsNotAvailableHint || 'If you need discounts, please enable it in Settings or update your business type.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={dict.admin?.searchDiscounts || 'Search by code or name…'}
                aria-label={dict.admin?.searchDiscounts || 'Search by code or name…'}
                className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-56"
              />
            </div>
            {discountsEnabled && canCreate && (
              <button
                onClick={() => openForm(null)}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
              >
                + {dict.admin?.addDiscount || 'Add Discount'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={showForm && discountsEnabled} onClose={() => setShowForm(false)}>
        <DiscountForm
          key={formKey}
          discount={editingDiscount}
          onClose={() => setShowForm(false)}
          onSave={async () => {
            showToast.success(getSaveSuccessMessage(!!editingDiscount, dict));
            setShowForm(false);
            await fetchDiscounts();
          }}
          dict={dict}
          settings={settings}
        />
      </Win8Drawer>
    </>
  );
}

function DiscountForm({
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
  const { formData, setFormData, error, submitting, handleSubmit, initializeForm, resetForm } = useDiscountsForm({
    codeRequired: dict.validation?.discountCodeRequired,
    valueRequired: dict.admin?.discountValueRequired,
    saveFailed: dict.admin?.discountSaveFailed,
  });
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
    // Save errors are shown inline in the drawer via `error`.
    await handleSubmit(async (payload) => {
      const isEdit = !!discount;
      const result = isEdit ? await updateDiscount(discount._id, payload) : await createDiscount(payload);
      if (result === true) {
        await onSave();
      }
      return result;
    });
  };

  const closeLabel = dict.common?.close || 'Close';
  const required = <span className="text-win8-danger">*</span>;

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
        <h2 className="text-base font-semibold">
          {discount ? (dict.admin?.editDiscount || 'Edit Discount') : (dict.admin?.addDiscount || 'Add Discount')}
        </h2>
        <button type="button" onClick={onClose} title={closeLabel} aria-label={closeLabel} className="text-white/70 hover:text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="discount-code" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.code || 'Code'} {required}
              </label>
              <input
                id="discount-code"
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ code: e.target.value.toUpperCase() })}
                readOnly={!!discount}
                maxLength={50}
                className={`w-full border border-gray-300 px-3 py-2 text-sm font-mono ${discount ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
                placeholder={dict?.admin?.discountCodePlaceholder || 'DISCOUNT10'}
              />
            </div>
            <div>
              <label htmlFor="discount-type" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.common?.type || 'Type'} {required}
              </label>
              <select
                id="discount-type"
                value={formData.type}
                onChange={(e) => setFormData({ type: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
                className="w-full border border-gray-300 px-3 py-2 text-sm bg-white"
              >
                <option value="percentage">{dict.admin?.percentage || 'Percentage'}</option>
                <option value="fixed">{dict.admin?.fixed || 'Fixed Amount'}</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="discount-name" className="block text-xs font-medium text-gray-600 mb-1">
              {dict.admin?.name || 'Name'}
            </label>
            <input
              id="discount-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ name: e.target.value })}
              maxLength={100}
              className="w-full border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="discount-description" className="block text-xs font-medium text-gray-600 mb-1">
              {dict.admin?.description || 'Description'}
            </label>
            <textarea
              id="discount-description"
              value={formData.description}
              onChange={(e) => setFormData({ description: e.target.value })}
              rows={2}
              className="w-full border border-gray-300 px-3 py-2 text-sm resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="discount-category" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.category || 'Category'}
              </label>
              <select
                id="discount-category"
                value={formData.category}
                onChange={(e) => setFormData({ category: e.target.value as 'general' | 'senior' | 'pwd' | 'employee' | 'promo' })}
                className="w-full border border-gray-300 px-3 py-2 text-sm bg-white"
              >
                <option value="general">{dict.admin?.categoryGeneral || 'General'}</option>
                <option value="senior">{dict.admin?.categorySenior || 'Senior Citizen (RA 9994)'}</option>
                <option value="pwd">{dict.admin?.categoryPwd || 'PWD (RA 10754)'}</option>
                <option value="employee">{dict.admin?.categoryEmployee || 'Employee'}</option>
                <option value="promo">{dict.admin?.categoryPromo || 'Promo'}</option>
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="checkbox-win8"
                  checked={formData.requiresIdVerification}
                  onChange={(e) => setFormData({ requiresIdVerification: e.target.checked })}
                />
                {dict.admin?.requiresId || 'Requires ID verification'}
              </label>
            </div>
          </div>

          <hr className="border-gray-300" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="discount-value" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.value || 'Value'} {required} {formData.type === 'percentage' ? '(%)' : `(${settings?.currency || 'USD'})`}
              </label>
              <input
                id="discount-value"
                type="number"
                step="0.01"
                min="0"
                required
                value={formData.value}
                onChange={(e) => setFormData({ value: parseFloat(e.target.value) || 0 })}
                className="w-full border border-gray-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            {formData.type === 'percentage' && (
              <div>
                <label htmlFor="discount-max" className="block text-xs font-medium text-gray-600 mb-1">
                  {dict.admin?.maxDiscount || 'Max Discount Amount'} ({settings?.currencySymbol || '$'})
                </label>
                <input
                  id="discount-max"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.maxDiscountAmount}
                  onChange={(e) => setFormData({ maxDiscountAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-gray-300 px-3 py-2 text-sm tabular-nums"
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="discount-min-purchase" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.minPurchase || 'Min Purchase Amount'} ({settings?.currencySymbol || '$'})
              </label>
              <input
                id="discount-min-purchase"
                type="number"
                step="0.01"
                min="0"
                value={formData.minPurchaseAmount}
                onChange={(e) => setFormData({ minPurchaseAmount: parseFloat(e.target.value) || 0 })}
                className="w-full border border-gray-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="discount-usage-limit" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.usageLimit || 'Usage Limit'}
              </label>
              <input
                id="discount-usage-limit"
                type="number"
                min="0"
                value={formData.usageLimit}
                onChange={(e) => setFormData({ usageLimit: parseInt(e.target.value) || 0 })}
                className="w-full border border-gray-300 px-3 py-2 text-sm tabular-nums"
                placeholder={dict.admin?.unlimited || 'Unlimited if 0'}
              />            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="discount-valid-from" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.validFrom || 'Valid From'} {required}
              </label>
              <input
                id="discount-valid-from"
                type="date"
                required
                value={formData.validFrom}
                onChange={(e) => setFormData({ validFrom: e.target.value })}
                className="w-full border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="discount-valid-until" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.validUntil || 'Valid Until'} {required}
              </label>
              <input
                id="discount-valid-until"
                type="date"
                required
                value={formData.validUntil}
                onChange={(e) => setFormData({ validUntil: e.target.value })}
                className="w-full border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <hr className="border-gray-300" />

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox-win8"
              checked={formData.isActive}
              onChange={(e) => setFormData({ isActive: e.target.checked })}
            />
            {dict.admin?.active || 'Active'}
          </label>

          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100"
          >
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {submitting
              ? (dict.common?.saving || 'Saving…')
              : discount
                ? (dict.common?.save || 'Save')
                : (dict.admin?.addDiscount || 'Add Discount')}
          </button>
        </div>
      </form>
    </>
  );
}
