'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import LowStockAlerts from '@/components/LowStockAlerts';
import RealTimeStockTracker from '@/components/RealTimeStockTracker';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType, supportsFeature } from '@/lib/business-type-helpers';
import { useInventoryPage } from '@/hooks/useInventoryPage';
import { usePermissions } from '@/hooks/usePermissions';
import type { TranslationDict } from '@/types/dictionary';

const SPINNER = <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>;
const SPINNER_SM = <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>;

/** Days-until-stockout urgency: ≤3 danger, ≤7 suspended (orange), otherwise warning. */
function stockoutBadge(days: number): string {
  if (days <= 3) return 'bg-win8-danger text-white';
  if (days <= 7) return 'bg-win8-suspended text-white';
  return 'bg-win8-warning text-white';
}

function Icon({ d, className = 'w-4 h-4' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const ICONS = {
  box: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  movements: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4',
  bundle: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  bolt: 'M13 10V3L4 14h7v7l9-11h-7z',
  bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  pin: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z',
  refresh: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  print: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
};

export default function AdminInventoryPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [stockRefreshTrigger, setStockRefreshTrigger] = useState(0);
  const [auditGenerating, setAuditGenerating] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const {
    branches,
    branchesStatus,
    branchesError,
    refetchBranches,
    stockPredictions,
    predictionsStatus,
    predictionsError,
    refetchPredictions,
  } = useInventoryPage(tenant, selectedBranch || undefined);

  const inventoryEnabled = supportsFeature(settings ?? undefined, 'inventory');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;
  const { canAccess } = usePermissions();
  const canManage = canAccess('inventory.view');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const handleStockUpdate = useCallback(() => {
    setStockRefreshTrigger((n) => n + 1);
  }, []);

  const handlePrintAuditSheet = useCallback(async () => {
    setAuditGenerating(true);
    setAuditError(null);
    try {
      const res = await fetch('/api/products');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load products');

      const rows = (json.data as Array<Record<string, unknown>>).flatMap((p) => {
        // /api/products returns `categoryName` (categoryId is a plain id string); keep the older shapes as fallbacks.
        const category =
          (p.categoryName as string) ||
          ((p.categoryId as { name?: string } | undefined)?.name) ||
          (p.category as string) ||
          '';
        if (p.hasVariations && Array.isArray(p.variations) && p.variations.length) {
          return (p.variations as Array<Record<string, unknown>>).map((v) => {
            const variantLabel =
              [v.size, v.color, v.type].filter(Boolean).join(' / ') ||
              (v.name as string) || (v.label as string) || (v.sku as string) || '';
            return {
              name: `${p.name as string} - ${variantLabel}`,
              sku: (v.sku as string) || '',
              category,
              stock: (v.stock as number) ?? 0,
              branchStock: (v.branchStock as { branchId: string; stock: number }[]) || (p.branchStock as { branchId: string; stock: number }[]) || [],
            };
          });
        }
        return [{
          name: p.name as string,
          sku: (p.sku as string) || '',
          category,
          stock: (p.stock as number) ?? 0,
          branchStock: (p.branchStock as { branchId: string; stock: number }[]) || [],
        }];
      });

      const { downloadInventoryAuditPDF } = await import('@/lib/export');
      const branchSuffix = selectedBranch
        ? (branches.find((b) => b._id === selectedBranch)?.name || 'branch')
        : 'all-branches';
      const filename = `inventory-audit-${branchSuffix}-${new Date().toISOString().slice(0, 10)}`;
      await downloadInventoryAuditPDF(rows, branches, selectedBranch || undefined, filename, settings?.companyName);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Failed to generate audit sheet');
    } finally {
      setAuditGenerating(false);
    }
  }, [selectedBranch, branches, settings?.companyName]);

  if (!dict) {
    return <div className="flex items-center justify-center py-24">{SPINNER}</div>;
  }

  const invDict = dict.inventory ?? {};
  const t = (key: string, fallback: string) => ((invDict as Record<string, string | undefined>)[key] || fallback);

  const header = (actions?: React.ReactNode) => (
    <AdminPageHeader
      title={invDict.title || 'Inventory'}
      description={t('subtitle', 'Track stock levels, alerts and stockout forecasts')}
      actions={actions}
    />
  );

  if (!canManage) {
    return (
      <div className="px-4 sm:px-6 py-6">
        {header()}
        <div className="p-4 bg-white border border-win8-danger text-sm" role="alert">
          <p className="font-bold text-win8-danger">{dict.admin?.accessRestricted || 'Access Restricted'}</p>
          <p className="text-gray-700 mt-1">
            {dict.admin?.accessRestrictedInventory || "You don't have permission to view inventory. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  if (!inventoryEnabled) {
    return (
      <div className="px-4 sm:px-6 py-6">
        {header()}
        <div className="p-4 bg-white border border-win8-warning text-sm" role="status">
          <p className="font-bold text-win8-warning">{t('inventoryNotAvailable', 'Inventory Management Not Available')}</p>
          <p className="text-gray-700 mt-1">
            {t(
              'inventoryNotAvailableDesc',
              `Inventory tracking is not enabled for ${businessTypeConfig?.name || 'your business type'}. To enable it, update your business type in Settings.`
            )}
          </p>
        </div>
      </div>
    );
  }

  const quickLinks = [
    { href: `/${tenant}/${lang}/admin/products`, icon: ICONS.box, title: dict.nav?.products || 'Products', desc: t('manageStock', 'Manage stock & refill') },
    { href: `/${tenant}/${lang}/admin/stock-movements`, icon: ICONS.movements, title: dict.nav?.stockMovements || 'Stock Movements', desc: t('viewHistory', 'View movement history') },
    { href: `/${tenant}/${lang}/admin/bundles`, icon: ICONS.bundle, title: dict.nav?.bundles || 'Bundles', desc: t('manageBundles', 'Manage product bundles') },
  ];

  const features = [
    { icon: ICONS.bolt, label: t('realtimeTracking', 'Real-time tracking') },
    { icon: ICONS.bell, label: t('lowStockAlerts', 'Low stock alerts') },
    { icon: ICONS.bundle, label: t('bundledProducts', 'Bundled products') },
    { icon: ICONS.pin, label: t('multiBranch', 'Multi-branch support') },
  ];

  return (
    <div className="px-4 sm:px-6 py-6">
      {header(
        <div className="bg-white border border-gray-300 px-3 py-2">
          <RealTimeStockTracker branchId={selectedBranch || undefined} onStockUpdate={handleStockUpdate} />
        </div>
      )}

      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-end justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
          <div>
            <label htmlFor="inv-branch" className="block text-xs font-medium text-gray-600 mb-1">{invDict.branch || 'Branch'}</label>
            <select
              id="inv-branch"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              disabled={branchesStatus === 'loading'}
              className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900 min-w-[180px] disabled:bg-gray-100"
            >
              <option value="">
                {branchesStatus === 'loading'
                  ? dict.common.loading || 'Loading…'
                  : invDict.allBranches || 'All Branches'}
              </option>
              {branches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                  {branch.code ? ` (${branch.code})` : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handlePrintAuditSheet}
            disabled={auditGenerating}
            className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {auditGenerating ? <span className="text-brand">{SPINNER_SM}</span> : <Icon d={ICONS.print} />}
            {auditGenerating
              ? t('generatingAuditSheet', 'Generating…')
              : invDict.printAuditSheet || 'Print Audit Sheet'}
          </button>
        </div>

        {auditError && (
          <div className="p-3 bg-white border border-win8-danger text-sm flex items-center justify-between gap-3 flex-wrap" role="alert">
            <span className="text-win8-danger font-medium">{auditError}</span>
            <button type="button" onClick={handlePrintAuditSheet} className="text-xs font-semibold text-brand hover:underline">
              {dict.common.retry || 'Retry'}
            </button>
          </div>
        )}

        {branchesStatus === 'error' && (
          <div className="p-3 bg-white border border-win8-warning text-sm flex items-center justify-between gap-3 flex-wrap" role="status">
            <span className="text-win8-warning font-medium">
              {branchesError || invDict.failedToLoadBranches || 'Failed to load branches'}
            </span>
            <button type="button" onClick={refetchBranches} className="text-xs font-semibold text-brand hover:underline">
              {dict.common.retry || 'Retry'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <LowStockAlerts
              autoRefresh={true}
              refreshInterval={30000}
              branchId={selectedBranch || undefined}
              refreshTrigger={stockRefreshTrigger}
              onProductClick={(productId) => {
                window.location.href = `/${tenant}/${lang}/admin/products?edit=${productId}`;
              }}
            />
          </div>

          <div className="space-y-4">
            {/* Predicted stockouts */}
            <section className="bg-white border border-gray-300">
              <div className="px-4 py-3 border-b border-gray-300 flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-gray-900">{invDict.predictedStockouts || 'Predicted Stockouts'}</h2>
                <button
                  type="button"
                  onClick={refetchPredictions}
                  disabled={predictionsStatus === 'loading'}
                  title={t('refreshPredictions', 'Refresh predictions')}
                  aria-label={t('refreshPredictions', 'Refresh predictions')}
                  className="inline-flex items-center justify-center p-2.5 border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-50 transition-colors"
                >
                  {predictionsStatus === 'loading' ? <span className="text-brand">{SPINNER_SM}</span> : <Icon d={ICONS.refresh} />}
                </button>
              </div>
              {predictionsStatus === 'loading' ? (
                <div className="py-8">{SPINNER}</div>
              ) : predictionsStatus === 'error' ? (
                <div className="text-center py-8 px-4" role="alert">
                  <p className="text-win8-danger text-sm font-medium">{invDict.failedToLoadPredictions || 'Failed to load predictions'}</p>
                  {predictionsError && <p className="text-gray-500 text-xs mt-1">{predictionsError}</p>}
                  <button
                    type="button"
                    onClick={refetchPredictions}
                    className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
                  >
                    {dict.common.retry || 'Retry'}
                  </button>
                </div>
              ) : stockPredictions.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">
                  {invDict.noStockoutsPredicted || 'No stockouts predicted in the next 14 days'}
                </p>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {stockPredictions.map((p) => (
                    <li key={p.productId} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 flex-shrink-0 bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center">
                        {p.image ? (
                          <img // eslint-disable-line
                            src={p.image}
                            alt={p.name}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Icon d={ICONS.box} className="w-4 h-4 text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                        <p className="text-xs text-gray-500 tabular-nums">
                          {t('unitsLeft', '{count} left').replace('{count}', p.currentStock.toLocaleString())}
                          {' · '}
                          {t('perDaySold', '~{rate}/day sold').replace('{rate}', p.avgDailySales.toLocaleString())}
                        </p>
                      </div>
                      <span
                        className={`flex-shrink-0 px-2 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap ${stockoutBadge(p.daysUntilStockout)}`}
                        title={t('daysUntilStockout', 'Days until stockout')}
                      >
                        {p.daysUntilStockout}d
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Quick actions */}
            <section className="bg-white border border-gray-300">
              <div className="px-4 py-3 border-b border-gray-300">
                <h2 className="text-sm font-bold text-gray-900">{invDict.quickActions || 'Quick Actions'}</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {quickLinks.map((link) => (
                  <a key={link.href} href={link.href} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 transition-colors group">
                    <span className="w-9 h-9 shrink-0 bg-brand text-white flex items-center justify-center">
                      <Icon d={link.icon} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 group-hover:text-brand">{link.title}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{link.desc}</span>
                    </span>
                    <Icon d="M9 5l7 7-7 7" className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </a>
                ))}
              </div>
            </section>

            {/* Features */}
            <section className="bg-white border border-gray-300">
              <div className="px-4 py-3 border-b border-gray-300">
                <h2 className="text-sm font-bold text-gray-900">{invDict.features || 'Features'}</h2>
              </div>
              <ul className="divide-y divide-gray-200">
                {features.map(({ icon, label }) => (
                  <li key={label} className="flex items-center gap-3 px-4 py-2.5">
                    <Icon d={icon} className="w-4 h-4 flex-shrink-0 text-brand" />
                    <span className="text-sm text-gray-700">{label}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
