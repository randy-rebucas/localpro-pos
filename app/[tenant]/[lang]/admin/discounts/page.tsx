'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { isLegalDiscountCode } from '@/lib/legal-discounts';
import { BadgePercent, IdCard, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  ICON, DARK_KEY_PRIMARY, LABEL, INPUT, CHECKBOX, CHECK_ROW, HINT, KEY, KEY_PRIMARY, ROW_KEY,
  RegisterPage, LedReadout, Sheet, Strip,
} from '@/components/admin/register-ui';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature, getBusinessType } from '@/lib/business-type-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDate } from '@/lib/formatting';
import { useConfirm } from '@/lib/confirm';
import { useDiscountsList, type Discount } from '@/hooks/useDiscountsList';
import { useDiscountsForm } from '@/hooks/useDiscountsForm';
import { usePermissions } from '@/hooks/usePermissions';
import { getDeleteConfirmMessage, getToggleButtonLabel } from '@/lib/discounts-helpers';

type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type DiscountState = 'valid' | 'scheduled' | 'expired' | 'inactive';

/** Where a discount stands right now, using the same comparison the checkout uses. */
function discountState(discount: Discount, now = new Date()): DiscountState {
  if (!discount.isActive) return 'inactive';
  if (now < new Date(discount.validFrom)) return 'scheduled';
  if (now > new Date(discount.validUntil)) return 'expired';
  return 'valid';
}

const STATE_TONES: Record<DiscountState, string> = {
  valid: 'bg-ink text-[#7df0d6]',
  scheduled: 'border border-ink/40 text-ink',
  expired: 'border border-stamp text-stamp',
  inactive: 'border border-dashed border-ink/40 text-ink/60',
};

const stateLabel = (dict: Dict, state: DiscountState) => ({
  valid: dict.admin?.valid || 'Valid',
  scheduled: dict.admin?.scheduled || 'Scheduled',
  expired: dict.admin?.expired || 'Expired',
  inactive: dict.admin?.inactive || 'Inactive',
}[state]);

const categoryLabel = (dict: Dict, category?: Discount['category']) => ({
  general: dict.admin?.categoryGeneral || 'General',
  senior: dict.admin?.categorySenior || 'Senior Citizen (RA 9994)',
  pwd: dict.admin?.categoryPwd || 'PWD (RA 10754)',
  employee: dict.admin?.categoryEmployee || 'Employee',
  promo: dict.admin?.categoryPromo || 'Promo',
}[category || 'general']);

export default function DiscountsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict>(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { canAccess } = usePermissions();
  const canManage = canAccess('discounts.manage');
  const { confirm, Dialog: confirmDialog } = useConfirm();

  const {
    discounts,
    loading,
    message,
    fetchDiscounts,
    deleteDiscount,
    toggleDiscountStatus,
    clearMessage,
    setMessage,
  } = useDiscountsList();

  const { settings } = useTenantSettings();
  const dateSettings = settings || getDefaultTenantSettings();
  const discountsEnabled = supportsFeature(settings ?? undefined, 'discounts');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchDiscounts().finally(() => setLoadedOnce(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  const handleDeleteDiscount = async (discount: Discount) => {
    if (!dict) return;
    const confirmed = await confirm(
      dict.admin?.deleteDiscountTitle || 'Delete discount?',
      `${getDeleteConfirmMessage(dict)} (${discount.code})`,
      { variant: 'danger', confirmText: dict.common?.delete || 'Delete', cancelText: dict.common?.cancel || 'Cancel' }
    );
    if (!confirmed) return;

    setBusyId(discount._id);
    try {
      const success = await deleteDiscount(discount._id);
      if (success) await fetchDiscounts();
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleDiscountStatus = async (discount: Discount) => {
    setBusyId(discount._id);
    try {
      const success = await toggleDiscountStatus(discount._id, !discount.isActive);
      if (success) await fetchDiscounts();
    } finally {
      setBusyId(null);
    }
  };

  if (!dict || !loadedOnce) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const now = new Date();
  const validCount = discounts.filter((discount) => discountState(discount, now) === 'valid').length;
  const openForm = (discount: Discount | null) => {
    clearMessage();
    setEditingDiscount(discount);
    setShowDiscountModal(true);
  };

  return (
    <RegisterPage
      tagNo="DC"
      tag={settings?.companyName}
      title={dict.admin?.discounts || 'Discounts'}
      subtitle={dict.admin?.discountsSubtitle || 'Manage discount codes and promotions'}
      side={<LedReadout value={validCount} label={dict.admin?.validNow || 'Valid now'} />}
    >
      {confirmDialog}

      {message && (
        <div className="mt-6">
          <Strip tone={message.type === 'success' ? 'ok' : 'error'}>{message.text}</Strip>
        </div>
      )}

      {!discountsEnabled && (
        <div className="mt-6 max-w-3xl">
          <Strip tone="error">
            <p className="font-semibold uppercase">{dict.admin?.discountsNotAvailable || 'Discounts Not Available'}</p>
            <p className="mt-1 font-body">
              {(dict.admin?.discountsNotAvailableDesc || 'Discounts are not enabled for {businessType}.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
            </p>
            <p className="mt-1 font-body text-ink/70">
              {dict.admin?.discountsNotAvailableHint || 'If you need discounts, please enable it in Settings or update your business type.'}
            </p>
          </Strip>
        </div>
      )}

      {discountsEnabled && canManage && (
        <div className="mt-6 flex">
          <button type="button" onClick={() => openForm(null)} className={`${DARK_KEY_PRIMARY} w-full sm:w-auto`}>
            <Plus className={ICON} strokeWidth={1.75} aria-hidden />
            {dict.admin?.addDiscount || 'Add Discount'}
          </button>
        </div>
      )}

      {/* Each code printed as a coupon */}
      <section className="mt-6" aria-busy={loading} aria-label={dict.admin?.discounts || 'Discounts'}>
        {discounts.length === 0 ? (
          <div className="max-w-2xl">
            <div className="bg-paper-white px-4 py-14 text-center text-ink">
              <BadgePercent className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
              <p className="font-receipt text-sm text-ink/60">{dict.admin?.noDiscountsYet || 'No discounts yet'}</p>
              {discountsEnabled && canManage && (
                <button type="button" onClick={() => openForm(null)} className={`${KEY_PRIMARY} mx-auto mt-4`}>
                  <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                  {dict.admin?.addDiscount || 'Add Discount'}
                </button>
              )}
            </div>
            <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
          </div>
        ) : (
          <ul className={`grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
            {discounts.map((discount) => {
              const state = discountState(discount, now);
              const used = discount.usageCount || 0;
              const limit = discount.usageLimit || 0;
              const usedShare = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
              return (
                <li key={discount._id} className="min-w-0">
                  <article className={`flex h-full flex-col bg-paper-white ${state === 'valid' ? 'text-ink' : 'text-ink/75'}`}>
                    {/* Code and value, as the face of the coupon */}
                    <div className="flex items-start justify-between gap-3 border-b-2 border-dashed border-ink/40 px-4 pb-3 pt-4">
                      <div className="min-w-0">
                        <p className="break-all font-receipt text-xl font-semibold tracking-[0.08em] text-ink">{discount.code}</p>
                        {discount.name && <p className="mt-0.5 text-sm">{discount.name}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        {discount.type === 'percentage' ? (
                          <p className="font-led text-4xl leading-none text-ink">{discount.value}%</p>
                        ) : (
                          <p className="font-receipt text-2xl font-semibold leading-none text-ink"><Currency amount={discount.value} /></p>
                        )}
                        <p className="mt-1 font-receipt text-[11px] uppercase tracking-[0.14em] text-ink/60">
                          {discount.type === 'percentage' ? (dict.admin?.percentOff || 'off') : (dict.admin?.amountOff || 'off')}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 px-4 py-3 font-receipt text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-1.5 py-0.5 font-semibold uppercase ${STATE_TONES[state]}`}>{stateLabel(dict, state)}</span>
                        <span className="border border-ink/25 px-1.5 py-0.5 uppercase text-ink/70">{categoryLabel(dict, discount.category)}</span>
                        {discount.requiresIdVerification && (
                          <span className="flex items-center gap-1 text-ink/70" title={dict.admin?.requiresId || 'Requires ID verification'}>
                            <IdCard className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                            {dict.admin?.idCheck || 'ID check'}
                          </span>
                        )}
                      </div>
                      {discount.description && <p className="font-body text-sm text-ink/65 line-clamp-2">{discount.description}</p>}
                      <dl className="space-y-1 pt-1">
                        <div className="flex items-baseline gap-2">
                          <dt className="uppercase text-ink/60">{dict.admin?.validPeriod || 'Valid Period'}</dt>
                          <span className="mk-leader" aria-hidden />
                          <dd className="whitespace-nowrap">{formatDate(discount.validFrom, dateSettings)} – {formatDate(discount.validUntil, dateSettings)}</dd>
                        </div>
                        {!!discount.minPurchaseAmount && (
                          <div className="flex items-baseline gap-2">
                            <dt className="uppercase text-ink/60">{dict.admin?.minPurchase || 'Min Purchase Amount'}</dt>
                            <span className="mk-leader" aria-hidden />
                            <dd className="whitespace-nowrap"><Currency amount={discount.minPurchaseAmount} /></dd>
                          </div>
                        )}
                        {discount.type === 'percentage' && !!discount.maxDiscountAmount && (
                          <div className="flex items-baseline gap-2">
                            <dt className="uppercase text-ink/60">{dict.admin?.maxLabel || 'Max'}</dt>
                            <span className="mk-leader" aria-hidden />
                            <dd className="whitespace-nowrap"><Currency amount={discount.maxDiscountAmount} /></dd>
                          </div>
                        )}
                        <div className="flex items-baseline gap-2">
                          <dt className="uppercase text-ink/60">{dict.admin?.usage || 'Usage'}</dt>
                          <span className="mk-leader" aria-hidden />
                          <dd className="whitespace-nowrap">{used} / {limit || '∞'}</dd>
                        </div>
                      </dl>
                      {limit > 0 && (
                        <div className="h-1.5 bg-ink/10" aria-hidden>
                          <div className={`h-full ${usedShare >= 100 ? 'bg-stamp' : 'bg-brand-hover'}`} style={{ width: `${usedShare}%` }} />
                        </div>
                      )}
                    </div>

                    {canManage && (
                      <div className="mt-auto flex items-center justify-end gap-1 border-t border-ink/10 px-2 py-1">
                        <button
                          type="button"
                          onClick={() => openForm(discount)}
                          disabled={!discountsEnabled}
                          className={`${ROW_KEY} disabled:opacity-40`}
                          title={dict.common?.edit || 'Edit'}
                          aria-label={`${dict.common?.edit || 'Edit'}: ${discount.code}`}
                        >
                          <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
                        </button>
                        {!(isLegalDiscountCode(discount.code) && discount.isActive) && (
                        <button
                          type="button"
                          onClick={() => handleToggleDiscountStatus(discount)}
                          disabled={busyId === discount._id}
                          className={`${ROW_KEY} w-auto gap-2 px-3 font-receipt text-xs uppercase disabled:opacity-40`}
                          aria-label={`${getToggleButtonLabel(discount.isActive, dict)}: ${discount.code}`}
                        >
                          <Power className={ICON} strokeWidth={1.75} aria-hidden />
                          {getToggleButtonLabel(discount.isActive, dict)}
                        </button>
                        )}
                        {!isLegalDiscountCode(discount.code) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDiscount(discount)}
                          disabled={busyId === discount._id}
                          className={`${ROW_KEY} hover:text-stamp disabled:opacity-40`}
                          title={dict.common?.delete || 'Delete'}
                          aria-label={`${dict.common?.delete || 'Delete'}: ${discount.code}`}
                        >
                          <Trash2 className={ICON} strokeWidth={1.75} aria-hidden />
                        </button>
                        )}
                      </div>
                    )}
                  </article>
                  <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showDiscountModal && discountsEnabled && (
        <DiscountModal
          discount={editingDiscount}
          onClose={() => {
            setShowDiscountModal(false);
            setEditingDiscount(null);
          }}
          onSave={async () => {
            setMessage({
              type: 'success',
              text: editingDiscount
                ? (dict.admin?.updateSuccess || 'Discount updated successfully')
                : (dict.admin?.saveSuccess || 'Discount created successfully'),
            });
            await fetchDiscounts();
            setShowDiscountModal(false);
            setEditingDiscount(null);
          }}
          dict={dict}
          settings={settings}
        />
      )}
    </RegisterPage>
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
  dict: Dict;
  settings: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const { formData, setFormData, error, submitting, handleSubmit, initializeForm, resetForm } = useDiscountsForm(settings?.timezone);
  const { createDiscount, updateDiscount } = useDiscountsList();
  const symbol = settings?.currencySymbol || '₱';
  // SC20 / PWD20: rate and terms fixed by law (the server refuses changes too)
  const legal = !!discount && isLegalDiscountCode(discount.code);

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
      const result = isEdit ? await updateDiscount(discount._id, payload) : await createDiscount(payload);
      if (result === true) {
        await onSave();
      }
      return result;
    });
  };

  return (
    <Sheet
      wide
      title={discount ? (dict.admin?.editDiscount || 'Edit Discount') : (dict.admin?.addDiscount || 'Add Discount')}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" form="discount-form" disabled={submitting} className={KEY_PRIMARY}>
            {submitting ? (dict.common?.saving || 'Saving...') : (dict.common?.save || 'Save')}
          </button>
        </>
      }
    >
      <form id="discount-form" onSubmit={onSubmit} className="space-y-4">
        {legal && (
          <p className="border-l-2 border-ink/40 pl-2 font-receipt text-xs text-ink/70">
            {dict.admin?.legalDiscountNote || 'Required by law (RA 9994 / RA 10754): the 20% rate and its terms are fixed. Only the name and description can be changed.'}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="discount-code" className={LABEL}>{dict.admin?.code || 'Code'} *</label>
            <input
              id="discount-code"
              type="text"
              required
              value={formData.code}
              onChange={(e) => setFormData({ code: e.target.value.toUpperCase() })}
              readOnly={!!discount}
              maxLength={50}
              aria-describedby={discount ? 'discount-code-hint' : undefined}
              className={`${INPUT} font-receipt tracking-[0.08em] ${discount ? 'cursor-not-allowed bg-ink/5 text-ink/60' : ''}`}
              placeholder={dict?.admin?.discountCodePlaceholder || 'DISCOUNT10'}
            />
            {discount && <p id="discount-code-hint" className={HINT}>{dict.admin?.codeLocked || 'A code cannot change once it is created.'}</p>}
          </div>
          <div>
            <label htmlFor="discount-type" className={LABEL}>{dict.common?.type || 'Type'} *</label>
            <select
              id="discount-type"
              disabled={legal}
              value={formData.type}
              onChange={(e) => setFormData({ type: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
              className={INPUT}
            >
              <option value="percentage">{dict.admin?.percentage || 'Percentage'}</option>
              <option value="fixed">{dict.admin?.fixed || 'Fixed Amount'}</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="discount-name" className={LABEL}>{dict.admin?.name || 'Name'}</label>
          <input
            id="discount-name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ name: e.target.value })}
            maxLength={100}
            className={INPUT}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
          <div>
            <label htmlFor="discount-category" className={LABEL}>{dict.admin?.category || 'Category'}</label>
            <select
              id="discount-category"
              disabled={legal}
              value={formData.category}
              onChange={(e) => setFormData({ category: e.target.value as 'general' | 'senior' | 'pwd' | 'employee' | 'promo' })}
              className={INPUT}
            >
              <option value="general">{categoryLabel(dict, 'general')}</option>
              <option value="senior">{categoryLabel(dict, 'senior')}</option>
              <option value="pwd">{categoryLabel(dict, 'pwd')}</option>
              <option value="employee">{categoryLabel(dict, 'employee')}</option>
              <option value="promo">{categoryLabel(dict, 'promo')}</option>
            </select>
          </div>
          <label className={CHECK_ROW}>
            <input
              type="checkbox"
              checked={formData.requiresIdVerification}
              disabled={legal}
              onChange={(e) => setFormData({ requiresIdVerification: e.target.checked })}
              className={CHECKBOX}
            />
            {dict.admin?.requiresId || 'Requires ID verification'}
          </label>
        </div>
        <div>
          <label htmlFor="discount-description" className={LABEL}>{dict.admin?.description || 'Description'}</label>
          <textarea
            id="discount-description"
            value={formData.description}
            onChange={(e) => setFormData({ description: e.target.value })}
            rows={2}
            className={INPUT}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="discount-value" className={LABEL}>
              {dict.admin?.value || 'Value'} * {formData.type === 'percentage' ? '(%)' : `(${symbol})`}
            </label>
            <input
              id="discount-value"
              disabled={legal}
              type="number"
              step="0.01"
              min="0"
              max={formData.type === 'percentage' ? 100 : undefined}
              required
              value={formData.value}
              onChange={(e) => setFormData({ value: parseFloat(e.target.value) || 0 })}
              className={`${INPUT} font-receipt`}
            />
          </div>
          {formData.type === 'percentage' && (
            <div>
              <label htmlFor="discount-max" className={LABEL}>{dict.admin?.maxDiscount || 'Max Discount Amount'} ({symbol})</label>
              <input
                id="discount-max"
              disabled={legal}
                type="number"
                step="0.01"
                min="0"
                value={formData.maxDiscountAmount}
                onChange={(e) => setFormData({ maxDiscountAmount: parseFloat(e.target.value) || 0 })}
                className={`${INPUT} font-receipt`}
              />
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="discount-min" className={LABEL}>{dict.admin?.minPurchase || 'Min Purchase Amount'} ({symbol})</label>
            <input
              id="discount-min"
              disabled={legal}
              type="number"
              step="0.01"
              min="0"
              value={formData.minPurchaseAmount}
              onChange={(e) => setFormData({ minPurchaseAmount: parseFloat(e.target.value) || 0 })}
              className={`${INPUT} font-receipt`}
            />
          </div>
          <div>
            <label htmlFor="discount-limit" className={LABEL}>{dict.admin?.usageLimit || 'Usage Limit'}</label>
            <input
              id="discount-limit"
              disabled={legal}
              type="number"
              min="0"
              value={formData.usageLimit}
              onChange={(e) => setFormData({ usageLimit: parseInt(e.target.value) || 0 })}
              aria-describedby="discount-limit-hint"
              className={`${INPUT} font-receipt`}
            />
            <p id="discount-limit-hint" className={HINT}>{dict.admin?.usageLimitHint || '0 means no limit'}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="discount-from" className={LABEL}>{dict.admin?.validFrom || 'Valid From'} *</label>
            <input
              id="discount-from"
              disabled={legal}
              type="date"
              required
              value={formData.validFrom}
              max={formData.validUntil || undefined}
              onChange={(e) => setFormData({ validFrom: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="discount-until" className={LABEL}>{dict.admin?.validUntil || 'Valid Until'} *</label>
            <input
              id="discount-until"
              disabled={legal}
              type="date"
              required
              value={formData.validUntil}
              min={formData.validFrom || undefined}
              onChange={(e) => setFormData({ validUntil: e.target.value })}
              className={INPUT}
            />
          </div>
        </div>
        <label className={CHECK_ROW}>
          <input
            type="checkbox"
            checked={formData.isActive}
            disabled={legal}
            onChange={(e) => setFormData({ isActive: e.target.checked })}
            className={CHECKBOX}
          />
          <span className="font-medium">{dict.admin?.active || 'Active'}</span>
        </label>
        {error && <Strip tone="error">{error}</Strip>}
      </form>
    </Sheet>
  );
}
