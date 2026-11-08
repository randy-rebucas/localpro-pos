'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, History } from 'lucide-react';
import { showToast } from '@/lib/toast';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SlipPager from '@/components/ui/SlipPager';
import { DARK_FIELD, DARK_KEY, DARK_KEY_PRIMARY, DARK_LABEL, ICON, LedReadout, RegisterPage, Strip } from '@/components/admin/register-ui';
import { useLoyaltyCustomerData, type LoyaltyEntry } from '@/hooks/useLoyaltyCustomerData';
import { useLoyaltyAdjustment } from '@/hooks/useLoyaltyAdjustment';
import { getDictionaryClient } from '../../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDateTime } from '@/lib/formatting';

type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const typeLabel = (dict: Dict, type: LoyaltyEntry['type']) =>
  ({
    earn: dict.loyalty?.typeEarn || 'Earned',
    redeem: dict.loyalty?.typeRedeem || 'Redeemed',
    adjust: dict.loyalty?.typeAdjust || 'Adjusted',
  })[type] || type;

/** Earned points read in teal, redeemed in stamp red, and the sign is always printed. */
function Points({ value }: { value: number }) {
  return (
    <span className={`font-semibold ${value > 0 ? 'text-brand-hover' : value < 0 ? 'text-stamp' : 'text-ink/60'}`}>
      {value > 0 ? '+' : value < 0 ? '−' : ''}{Math.abs(value).toLocaleString()}
    </span>
  );
}

export default function LoyaltyCustomerPage() {
  const { settings: tenantSettings } = useTenantSettings();
  const dateSettings = tenantSettings || getDefaultTenantSettings();
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const customerId = params.customerId as string;
  const [dict, setDict] = useState<Dict>(null);
  const { canAccess } = usePermissions();
  const canView = canAccess('loyalty.manage');
  const canAdjust = canAccess('loyalty.adjust');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const { data, page, loading, setPage, refetch } = useLoyaltyCustomerData(customerId);
  const { form, saving: adjusting, updateForm, submitAdjustment } = useLoyaltyAdjustment(customerId);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    // Checked here too so the message is in the page language; the hook repeats the same checks.
    const points = parseInt(form.points);
    if (!points) {
      showToast.error(dict?.loyalty?.enterNonZeroPoints || 'Enter a non-zero point value');
      return;
    }
    if (!form.description.trim()) {
      showToast.error(dict?.loyalty?.reasonRequired || 'Add a reason for the adjustment');
      return;
    }
    const result = await submitAdjustment();
    if (result.success) {
      showToast.success(dict?.loyalty?.pointsAdjusted || 'Points adjusted');
      // Show the new entry: page 1 holds the newest. Changing the page fetches; on page 1 fetch directly.
      if (page === 1) refetch();
      else setPage(1);
    } else {
      showToast.error(result.error || dict?.loyalty?.adjustmentFailed || 'Adjustment failed');
    }
  };

  const backHref = `/${tenant}/${lang}/admin/loyalty`;

  if (!dict || (loading && !data)) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const backKey = (
    <Link href={backHref} className={`${DARK_KEY} w-fit`}>
      <ArrowLeft className={ICON} strokeWidth={1.75} aria-hidden />
      {/* The dictionary text carries its own arrow; the icon replaces it. */}
      {(dict.loyalty?.backToLoyaltyProgram || 'Back to Loyalty Program').replace(/^←\s*/, '')}
    </Link>
  );

  if (!canView || !data) {
    return (
      <RegisterPage tagNo="LP" tag={tenantSettings?.companyName} title={dict.loyalty?.title || 'Loyalty Program'}>
        <div className="mt-6 max-w-2xl space-y-4">
          <Strip tone="error">
            {!canView
              ? (dict.admin?.accessRestrictedLoyalty || "You don't have permission to view loyalty. Contact an admin or owner.")
              : (dict.loyalty?.customerNotFound || 'This loyalty account could not be loaded.')}
          </Strip>
          {backKey}
        </div>
      </RegisterPage>
    );
  }

  return (
    <RegisterPage
      tagNo="LP"
      tag={dict.loyalty?.loyaltyPointsAccount || 'Loyalty Points Account'}
      title={data.customerName}
      side={<LedReadout value={data.loyaltyPointsBalance.toLocaleString()} label={dict.loyalty?.pointsBalance || 'points balance'} />}
    >
      <div className="mt-6">{backKey}</div>

      {/* Manual adjustment, keyed in at the counter */}
      {canAdjust && (
        <form onSubmit={handleAdjust} className="mt-6 border-t border-white/15 pt-6">
          <h2 className="text-3xl text-paper-white">{dict.loyalty?.manualAdjustment || 'Manual Adjustment'}</h2>
          <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto]">
            <div>
              <label htmlFor="adjust-points" className={DARK_LABEL}>{dict.loyalty?.points || 'Points'}</label>
              <input
                id="adjust-points"
                type="number"
                inputMode="numeric"
                step="1"
                placeholder="+100 / -50"
                value={form.points}
                onChange={(e) => updateForm({ points: e.target.value })}
                className={DARK_FIELD}
              />
            </div>
            <div>
              <label htmlFor="adjust-reason" className={DARK_LABEL}>{dict.loyalty?.reasonPlaceholder || 'Reason / description'}</label>
              <input
                id="adjust-reason"
                type="text"
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                className={DARK_FIELD}
              />
            </div>
            <button type="submit" disabled={adjusting} className={`${DARK_KEY_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`}>
              {adjusting ? (dict.admin?.saving || 'Saving...') : (dict.loyalty?.apply || 'Apply')}
            </button>
          </div>
          <p className="mt-2 font-receipt text-xs text-white/60">{dict.loyalty?.pointsPlaceholder || 'Points (+ to add, - to deduct)'}</p>
        </form>
      )}

      {/* Points card: every earn, redeem and adjustment */}
      <section className="mt-6" aria-busy={loading}>
        <div className={`bg-paper-white text-ink transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <h2 className="border-b border-dashed border-ink/30 px-4 py-4 text-3xl">{dict.loyalty?.pointsHistory || 'Points History'}</h2>
          {data.history.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <History className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
              <p className="font-receipt text-sm text-ink/60">{dict.loyalty?.noHistory || 'No history yet.'}</p>
            </div>
          ) : (
            <ul className="divide-y divide-dashed divide-ink/20">
              {data.history.map(entry => (
                <li key={entry._id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm">{entry.description}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-receipt text-xs text-ink/60">
                      <span className={`border px-1.5 py-0.5 text-[11px] uppercase ${entry.type === 'redeem' ? 'border-stamp/50 text-stamp' : 'border-ink/25 text-ink/70'}`}>
                        {typeLabel(dict, entry.type)}
                      </span>
                      <span>{formatDateTime(entry.createdAt, dateSettings)}</span>
                      <span>{entry.balanceBefore.toLocaleString()} → {entry.balanceAfter.toLocaleString()}</span>
                    </p>
                  </div>
                  <p className="shrink-0 font-receipt text-lg"><Points value={entry.points} /></p>
                </li>
              ))}
            </ul>
          )}

          <SlipPager
            page={page}
            totalPages={data.pagination.totalPages}
            onPageChange={setPage}
            label={dict.admin?.page || 'Page'}
            previousLabel={dict.common?.previous || 'Previous'}
            nextLabel={dict.common?.next || 'Next'}
          />
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </section>
    </RegisterPage>
  );
}
