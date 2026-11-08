'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Search, Star } from 'lucide-react';
import { showToast } from '@/lib/toast';
import Currency from '@/components/Currency';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SlipPager from '@/components/ui/SlipPager';
import { ReceiptRow } from '@/components/marketing/primitives';
import { HINT, INPUT, KEY_PRIMARY, LABEL, RegisterPage } from '@/components/admin/register-ui';
import { useLoyaltyConfig } from '@/hooks/useLoyaltyConfig';
import { useLoyaltyCustomers } from '@/hooks/useLoyaltyCustomers';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';

type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** One figure on the display panel: LED for counts, printed type for money. */
function Readout({ label, children, led = false }: { label: string; children: React.ReactNode; led?: boolean }) {
  return (
    <div className="border-b border-r border-white/15 px-4 py-3">
      <p className="font-receipt text-[11px] uppercase tracking-[0.14em] text-white/60">{label}</p>
      <p className={`mt-1 leading-none ${led ? 'mk-led-glow font-led text-4xl text-[#7df0d6]' : 'font-receipt text-2xl font-semibold text-paper-white'}`}>
        {children}
      </p>
    </div>
  );
}

export default function LoyaltyPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const canManage = canAccess('loyalty.config');
  const canView = canAccess('loyalty.manage');
  const [dict, setDict] = useState<Dict>(null);
  const { settings } = useTenantSettings();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const { config, configForm, loading: configLoading, saving: savingConfig, dirty: configDirty, fetchConfig, updateConfigForm, saveConfig } = useLoyaltyConfig();
  const { customers, search, page, totalPages, totalCustomers, loading, enrolledCount, totalPoints, setSearch, setPage } = useLoyaltyCustomers();

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleConfigSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await saveConfig(configForm);
    if (result.success) {
      showToast.success(dict?.loyalty?.settingsSaved || 'Loyalty settings saved');
    } else {
      showToast.error(result.error || dict?.loyalty?.settingsSaveFailed || 'Failed to save settings');
    }
  };

  if (!dict || configLoading) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const title = dict.loyalty?.title || 'Loyalty Program';

  if (!canView) {
    return (
      <RegisterPage tagNo="LP" tag={settings?.companyName} title={title}>
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink">
            <h2 className="text-3xl">{dict.admin?.accessRestricted || 'Access Restricted'}</h2>
            <p className="mt-2 text-sm">
              {dict.admin?.accessRestrictedLoyalty || "You don't have permission to view loyalty. Contact an admin or owner."}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </RegisterPage>
    );
  }

  const pointValue = config?.pesoPerPoint ?? 0;
  const enabled = !!config?.isEnabled;

  return (
    <RegisterPage
      tagNo="LP"
      tag={settings?.companyName}
      title={title}
      subtitle={dict.loyalty?.subtitle || 'Configure points settings and manage customer rewards.'}
      side={
        <span
          className={`flex min-h-[44px] items-center border-2 px-4 font-receipt text-sm font-semibold uppercase tracking-[0.14em] ${enabled ? 'border-[#8fe3d0] text-[#8fe3d0]' : 'border-stamp text-stamp'}`}
        >
          {enabled ? (dict.admin?.active || 'Active') : (dict.loyalty?.paused || 'Paused')}
        </span>
      }
    >
      {/* The display panel */}
      <div className="mt-6 grid grid-cols-2 border-l border-t border-white/15 bg-black/20 lg:grid-cols-4">
        <Readout led label={dict.loyalty?.totalCustomers || 'Total Customers'}>{totalCustomers.toLocaleString()}</Readout>
        <Readout led label={dict.loyalty?.withPoints || 'With Points'}>{enrolledCount.toLocaleString()}</Readout>
        <Readout led label={dict.loyalty?.pointsOutstanding || 'Points Outstanding'}>{totalPoints.toLocaleString()}</Readout>
        <Readout label={dict.loyalty?.estLiability || 'Est. Liability'}><Currency amount={totalPoints * pointValue} /></Readout>
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        {/* Rate card */}
        <section className="xl:col-span-4">
          <div className="bg-paper-white px-5 py-5 text-ink">
            <h2 className="text-3xl">{dict.loyalty?.programSettings || 'Program Settings'}</h2>
            <form onSubmit={handleConfigSave} className="mt-4">
              <fieldset disabled={!canManage} className="space-y-4">
                <div>
                  <label htmlFor="loyalty-earn" className={LABEL}>{dict.loyalty?.pointsPerPeso || 'Points per ₱1 spent'}</label>
                  <input
                    id="loyalty-earn"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    value={configForm.pointsPerPeso}
                    onChange={e => updateConfigForm({ pointsPerPeso: parseFloat(e.target.value) || 1 })}
                    className={`${INPUT} font-receipt`}
                  />
                  <p className={HINT}>{dict.loyalty?.pointsPerPesoHint || 'e.g. 1 = earn 1 pt per ₱1'}</p>
                </div>

                <div>
                  <label htmlFor="loyalty-value" className={LABEL}>{dict.loyalty?.pesoPerPoint || '₱ value per point'}</label>
                  <input
                    id="loyalty-value"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    value={configForm.pesoPerPoint}
                    onChange={e => updateConfigForm({ pesoPerPoint: parseFloat(e.target.value) || 0.1 })}
                    className={`${INPUT} font-receipt`}
                  />
                  <p className={HINT}>{dict.loyalty?.pesoPerPointHint || 'e.g. 0.10 = 100 pts = ₱10'}</p>
                </div>

                <div>
                  <label htmlFor="loyalty-min" className={LABEL}>{dict.loyalty?.minRedemption || 'Minimum pts to redeem'}</label>
                  <input
                    id="loyalty-min"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={configForm.minRedemption}
                    onChange={e => updateConfigForm({ minRedemption: parseInt(e.target.value) || 100 })}
                    className={`${INPUT} font-receipt`}
                  />
                </div>

                {/* Program on or paused, as two keys */}
                <div role="radiogroup" aria-label={dict.loyalty?.programSettings || 'Program Settings'} className="grid grid-cols-2 border-l border-t border-ink/25">
                  {[
                    { on: true, label: dict.loyalty?.programEnabled || 'Program enabled' },
                    { on: false, label: dict.loyalty?.programPaused || 'Program paused' },
                  ].map(option => (
                    <button
                      key={String(option.on)}
                      type="button"
                      role="radio"
                      aria-checked={configForm.isEnabled === option.on}
                      onClick={() => updateConfigForm({ isEnabled: option.on })}
                      className={`flex min-h-[44px] items-center justify-center border-b border-r border-ink/25 px-2 text-center font-receipt text-xs font-medium uppercase transition-colors touch-manipulation disabled:cursor-not-allowed ${configForm.isEnabled === option.on ? 'bg-ink text-paper-white' : 'text-ink hover:bg-paper'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {canManage && (
                  <button type="submit" disabled={savingConfig || !configDirty} className={`${KEY_PRIMARY} w-full`}>
                    {savingConfig ? (dict.admin?.saving || 'Saving...') : configDirty ? (dict.loyalty?.saveChanges || 'Save Changes') : (dict.loyalty?.saved || 'Saved')}
                  </button>
                )}
              </fieldset>
            </form>

            {config && (
              <div className="mt-5 space-y-1.5 border-t border-dashed border-ink/30 pt-4 font-receipt text-sm">
                <ReceiptRow label={dict.loyalty?.pointsPerPeso || 'Points per ₱1 spent'} value={config.pointsPerPeso} />
                <ReceiptRow label={dict.loyalty?.pesoPerPoint || '₱ value per point'} value={<Currency amount={config.pesoPerPoint} />} />
                <ReceiptRow
                  label={dict.loyalty?.minRedemption || 'Minimum pts to redeem'}
                  value={<>{config.minRedemption.toLocaleString()} = <Currency amount={config.minRedemption * config.pesoPerPoint} /></>}
                />
              </div>
            )}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>

        {/* Points book */}
        <section className="xl:col-span-8" aria-busy={loading}>
          <div className="bg-paper-white text-ink">
            <div className="flex flex-col gap-3 border-b border-dashed border-ink/30 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="text-3xl">{dict.loyalty?.customerBalances || 'Customer Balances'}</h2>
              <div className="relative sm:w-64">
                <label htmlFor="loyalty-search" className="sr-only">{dict.loyalty?.searchCustomers || 'Search customers...'}</label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" strokeWidth={1.75} aria-hidden />
                <input
                  id="loyalty-search"
                  type="search"
                  placeholder={dict.loyalty?.searchCustomers || 'Search customers...'}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className={`${INPUT} pl-9`}
                />
              </div>
            </div>

            <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
              {customers.length === 0 ? (
                loading ? (
                  <div className="flex justify-center py-14"><LoadingSpinner size="md" /></div>
                ) : (
                  <div className="px-4 py-14 text-center">
                    <Star className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
                    <p className="font-receipt text-sm text-ink/60">{dict.loyalty?.noCustomersFound || 'No customers found.'}</p>
                    <p className="mt-1 text-xs text-ink/50">{dict.loyalty?.noCustomersFoundDesc || 'Customers appear here once they are added to the system.'}</p>
                  </div>
                )
              ) : (
                <ul className="divide-y divide-dashed divide-ink/20">
                  {customers.map(c => {
                    const points = c.loyaltyPointsBalance ?? 0;
                    const contact = c.phone || c.email;
                    return (
                      <li key={c._id}>
                        <Link
                          href={`/${tenant}/${lang}/admin/loyalty/${c._id}`}
                          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper"
                        >
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm font-medium ${c.isActive ? '' : 'text-ink/50'}`}>
                              {c.firstName} {c.lastName}
                              {!c.isActive && (
                                <span className="ml-2 border border-stamp/50 px-1 py-0.5 font-receipt text-[10px] uppercase text-stamp">{dict.admin?.inactive || 'Inactive'}</span>
                              )}
                            </span>
                            {contact && <span className="mt-0.5 block truncate font-receipt text-xs text-ink/60">{contact}</span>}
                          </span>
                          <span className="shrink-0 text-right font-receipt">
                            <span className={`block text-base font-semibold ${points > 0 ? 'text-brand-hover' : 'text-ink/30'}`}>
                              {points.toLocaleString()} <span className="text-xs font-normal text-ink/50">{dict.loyalty?.points || 'pts'}</span>
                            </span>
                            {points > 0 && pointValue > 0 && (
                              <span className="block text-xs text-ink/60"><Currency amount={points * pointValue} /></span>
                            )}
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-ink/40" strokeWidth={1.75} aria-hidden />
                          <span className="sr-only">{dict.loyalty?.manage || 'Manage'}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <SlipPager
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              label={dict.admin?.page || 'Page'}
              previousLabel={dict.common?.previous || 'Previous'}
              nextLabel={dict.common?.next || 'Next'}
            />
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </div>
    </RegisterPage>
  );
}
