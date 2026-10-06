'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { showToast } from '@/lib/toast';
import { useLoyaltyConfig } from '@/hooks/useLoyaltyConfig';
import { useLoyaltyCustomers } from '@/hooks/useLoyaltyCustomers';
import { getSaveSuccessMessage, getSaveErrorMessage, getLoadErrorMessage, getCustomersLoadErrorMessage } from '@/lib/loyalty-helpers';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { formatCurrency, getCurrencySymbol } from '@/lib/currency';

const SPINNER = <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>;
const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white tabular-nums disabled:bg-gray-100';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

export default function LoyaltyPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { canAccess } = usePermissions();
  const canManage = canAccess('loyalty.config');
  const canView = canAccess('loyalty.view');
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { settings: tenantSettings } = useTenantSettings();
  // Points/peso amounts on this page were hardcoded to the ₱ symbol regardless
  // of the tenant's configured currency — falls back to ₱ only while tenant
  // settings are still loading, matching every other currency-aware admin page.
  const currencySymbol = tenantSettings
    ? tenantSettings.currencySymbol || getCurrencySymbol(tenantSettings.currency)
    : '₱';
  const formatMoney = (amount: number) =>
    tenantSettings ? formatCurrency(amount, tenantSettings) : `${currencySymbol}${amount.toFixed(2)}`;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const {
    config,
    configForm,
    loading: configLoading,
    error: configError,
    saving: savingConfig,
    dirty: configDirty,
    fetchConfig,
    updateConfigForm,
    saveConfig,
  } = useLoyaltyConfig();
  const {
    customers,
    search,
    page,
    totalPages,
    totalCustomers,
    loading,
    error: customersError,
    limit,
    refetch,
    enrolledCount,
    totalPoints,
    setSearch,
    setPage,
  } = useLoyaltyCustomers();

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleConfigSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await saveConfig(configForm);
    if (result.success) {
      showToast.success(getSaveSuccessMessage(dict));
    } else {
      showToast.error(getSaveErrorMessage(result.error, dict));
    }
  };

  const withSymbol = (template: string) => template.replace('{symbol}', currencySymbol);

  // Stats derived from config and customers
  const pesoValue = config ? totalPoints * config.pesoPerPoint : 0;

  if (!canView) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="p-4 bg-white border border-win8-danger">
          <h2 className="text-base font-bold text-win8-danger mb-1">{dict?.admin?.accessRestricted || 'Access Restricted'}</h2>
          <p className="text-sm text-gray-700">
            {dict?.admin?.accessRestrictedLoyalty || "You don't have permission to view loyalty. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  const stats = [
    { label: dict?.loyalty?.totalCustomers || 'Total Customers', value: totalCustomers.toLocaleString(), color: 'text-gray-900' },
    { label: dict?.loyalty?.withPoints || 'With Points', value: enrolledCount.toLocaleString(), color: 'text-win8-success' },
    { label: dict?.loyalty?.pointsOutstanding || 'Points Outstanding', value: totalPoints.toLocaleString(), color: 'text-brand' },
    { label: dict?.loyalty?.estLiability || 'Est. Liability', value: formatMoney(pesoValue), color: 'text-win8-accent' },
  ];

  const renderSettingsBody = () => {
    if (configLoading) {
      return (
        <div className="text-center py-8">
          {SPINNER}
          <p className="mt-3 text-gray-400 text-sm">{dict?.loyalty?.loadingSettings || 'Loading loyalty settings…'}</p>
        </div>
      );
    }

    if (configError) {
      return (
        <div className="text-center py-8">
          <p className="text-win8-danger text-sm font-medium">{getLoadErrorMessage(dict)}</p>
          <p className="text-xs text-gray-500 mt-1">{configError}</p>
          <button
            type="button"
            onClick={() => fetchConfig()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict?.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    return (
      <>
        {!canManage && (
          <div className="bg-brand-soft border border-brand p-3 text-sm text-brand-navy mb-4">
            {dict?.loyalty?.readOnlyNote || 'You can view these settings but not change them.'}
          </div>
        )}
        <form onSubmit={handleConfigSave}>
          <fieldset disabled={!canManage} className="space-y-4">
            <div>
              <label htmlFor="loyalty-points-per-peso" className={LABEL}>
                {withSymbol(dict?.loyalty?.pointsPerPeso || 'Points per {symbol}1 spent')}
              </label>
              <input
                id="loyalty-points-per-peso"
                type="number"
                step="0.01"
                min="0.01"
                value={configForm.pointsPerPeso}
                onChange={e => updateConfigForm({ pointsPerPeso: parseFloat(e.target.value) || 1 })}
                className={INPUT}
              />
              <p className="text-xs text-gray-400 mt-1">
                {withSymbol(dict?.loyalty?.pointsPerPesoHint || 'e.g. 1 = earn 1 pt per {symbol}1')}
              </p>
            </div>

            <div>
              <label htmlFor="loyalty-peso-per-point" className={LABEL}>
                {withSymbol(dict?.loyalty?.pesoPerPoint || '{symbol} value per point')}
              </label>
              <input
                id="loyalty-peso-per-point"
                type="number"
                step="0.01"
                min="0.01"
                value={configForm.pesoPerPoint}
                onChange={e => updateConfigForm({ pesoPerPoint: parseFloat(e.target.value) || 0.1 })}
                className={INPUT}
              />
              <p className="text-xs text-gray-400 mt-1">
                {withSymbol(dict?.loyalty?.pesoPerPointHint || 'e.g. 0.10 = 100 pts = {symbol}10')}
              </p>
            </div>

            <div>
              <label htmlFor="loyalty-min-redemption" className={LABEL}>
                {dict?.loyalty?.minRedemption || 'Minimum pts to redeem'}
              </label>
              <input
                id="loyalty-min-redemption"
                type="number"
                min="1"
                step="1"
                value={configForm.minRedemption}
                onChange={e => updateConfigForm({ minRedemption: parseInt(e.target.value) || 100 })}
                className={INPUT}
              />
            </div>

            {/* The whole row is the switch: the global 44px button min-size would
                otherwise stretch a bare 40×20 track into a square. */}
            <button
              type="button"
              role="switch"
              aria-checked={configForm.isEnabled}
              onClick={() => updateConfigForm({ isEnabled: !configForm.isEnabled })}
              className="group flex items-center gap-3 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                aria-hidden="true"
                className={`relative inline-block h-5 w-10 shrink-0 transition-colors duration-200 ${
                  configForm.isEnabled ? 'bg-brand group-hover:bg-brand-hover' : 'bg-gray-300 group-hover:bg-gray-400'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 h-3 w-3 bg-white transition-transform duration-200 ${
                    configForm.isEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </span>
              <span className="text-sm text-gray-700">
                {configForm.isEnabled ? (dict?.loyalty?.programEnabled || 'Program enabled') : (dict?.loyalty?.programPaused || 'Program paused')}
              </span>
            </button>

            {canManage && (
              <button
                type="submit"
                disabled={savingConfig || !configDirty}
                className="w-full py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingConfig
                  ? (dict?.common?.saving || 'Saving…')
                  : configDirty ? (dict?.loyalty?.saveChanges || 'Save Changes') : (dict?.loyalty?.saved || 'Saved')}
              </button>
            )}
          </fieldset>
        </form>

        {config && (
          <div className="mt-5 pt-4 border-t border-gray-200 text-xs text-gray-500 space-y-1 tabular-nums">
            <p>{withSymbol((dict?.loyalty?.rateSummaryLabel || 'Rate: {rate} pt / {symbol}1 spent').replace('{rate}', String(config.pointsPerPeso)))}</p>
            <p>{withSymbol((dict?.loyalty?.valueSummaryLabel || 'Value: {symbol}{value} / point').replace('{value}', String(config.pesoPerPoint)))}</p>
            <p>{withSymbol((dict?.loyalty?.minRedeemSummaryLabel || 'Min redeem: {points} points ({symbol}{value})').replace('{points}', String(config.minRedemption)).replace('{value}', (config.minRedemption * config.pesoPerPoint).toFixed(2)))}</p>
          </div>
        )}
      </>
    );
  };

  const renderCustomersBody = () => {
    if (loading && customers.length === 0) {
      return (
        <div className="text-center py-12">
          {SPINNER}
          <p className="mt-3 text-gray-400 text-sm">{dict?.loyalty?.loadingCustomers || 'Loading customers…'}</p>
        </div>
      );
    }

    if (customersError) {
      return (
        <div className="text-center py-12">
          <p className="text-win8-danger text-sm font-medium">{getCustomersLoadErrorMessage(dict)}</p>
          <p className="text-xs text-gray-500 mt-1">{customersError}</p>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={loading}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {dict?.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (customers.length === 0) {
      return search.trim() ? (
        <p className="text-center py-12 text-sm text-gray-400">
          {dict?.loyalty?.noCustomersMatch || 'No customers match your search.'}
        </p>
      ) : (
        <div className="text-center py-12">
          <p className="text-sm text-gray-400">{dict?.loyalty?.noCustomersFound || 'No customers found.'}</p>
          <p className="text-xs text-gray-400 mt-1">
            {dict?.loyalty?.noCustomersFoundDesc || 'Customers appear here once they are added to the system.'}
          </p>
        </div>
      );
    }

    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, totalCustomers);
    const manageLabel = dict?.loyalty?.manage || 'Manage';

    return (
      <div className="relative" aria-busy={loading}>
        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20" aria-live="polite">
            {SPINNER}
          </div>
        )}
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{dict?.admin?.customer || 'Customer'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict?.loyalty?.contact || 'Contact'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict?.loyalty?.points || 'Points'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict?.loyalty?.estValue || 'Est. Value'}</th>
                <th className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">{dict?.common?.actions || 'Actions'}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {customers.map(c => {
                const balance = c.loyaltyPointsBalance ?? 0;
                const value = config ? balance * config.pesoPerPoint : 0;
                const name = `${c.firstName} ${c.lastName}`.trim();
                const contact = c.email || c.phone;
                return (
                  <tr key={c._id} className="hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-gray-900">{name}</p>
                      {!c.isActive && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.5 text-xs font-semibold bg-gray-500 text-white">
                          {dict?.admin?.inactive || 'Inactive'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {contact ? (
                        <span className="block max-w-[220px] truncate" title={contact}>{contact}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                      {balance > 0 ? (
                        <span className="font-semibold text-brand">{balance.toLocaleString()}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700">
                      {value > 0 ? formatMoney(value) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <Link
                        href={`/${tenant}/${lang}/admin/loyalty/${c._id}`}
                        aria-label={`${manageLabel}: ${name}`}
                        className="inline-flex items-center px-3 py-1 text-xs font-semibold bg-brand text-white hover:brightness-110 transition-[filter]"
                      >
                        {manageLabel}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="border-t border-gray-300 px-4 py-3 flex items-center justify-between text-sm text-gray-500">
            <span className="tabular-nums">
              {dict?.admin?.showing || 'Showing'} {start.toLocaleString()}–{end.toLocaleString()} {dict?.admin?.of || 'of'} {totalCustomers.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
              >
                ← {dict?.common?.previous || 'Prev'}
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
              >
                {dict?.common?.next || 'Next'} →
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict?.loyalty?.title || 'Loyalty Program'}
        description={dict?.loyalty?.subtitle || 'Configure points settings and manage customer rewards.'}
        actions={config && (
          <span className={`px-3 py-1 text-xs font-semibold text-white ${config.isEnabled ? 'bg-win8-success' : 'bg-gray-500'}`}>
            {config.isEnabled ? (dict?.admin?.active || 'Active') : (dict?.loyalty?.paused || 'Paused')}
          </span>
        )}
      />

      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(stat => (
            <div key={stat.label} className="bg-white border border-gray-300 p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{stat.label}</p>
              <p className={`text-2xl sm:text-3xl font-bold tabular-nums mt-1.5 break-words ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <section className="bg-white border border-gray-300 lg:col-span-1">
            <div className="px-6 py-4 border-b border-gray-300">
              <h2 className="text-base font-bold text-gray-900">{dict?.loyalty?.programSettings || 'Program Settings'}</h2>
            </div>
            <div className="p-6">{renderSettingsBody()}</div>
          </section>

          <section className="bg-white border border-gray-300 lg:col-span-2">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-base font-bold text-gray-900">{dict?.loyalty?.customerBalances || 'Customer Balances'}</h2>
              <div className="relative w-full sm:w-56">
                <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
                </svg>
                <input
                  type="text"
                  placeholder={dict?.loyalty?.searchCustomers || 'Search customers…'}
                  aria-label={dict?.loyalty?.searchCustomers || 'Search customers…'}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-full"
                />
              </div>
            </div>
            {renderCustomersBody()}
          </section>
        </div>
      </div>
    </div>
  );
}
