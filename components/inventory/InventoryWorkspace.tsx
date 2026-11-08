'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowDownUp, Boxes, ChevronRight, Package, Printer, RefreshCw } from 'lucide-react';
import { Barcode, LineTag } from '@/components/marketing/primitives';
import { variationLabel } from '@/lib/product-variations';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SlipPager from '@/components/ui/SlipPager';
import LowStockAlerts from '@/components/LowStockAlerts';
import RealTimeStockTracker from '@/components/RealTimeStockTracker';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType, supportsFeature } from '@/lib/business-type-helpers';
import { useInventoryPage } from '@/hooks/useInventoryPage';
import { usePermissions } from '@/hooks/usePermissions';
import type { TranslationDict } from '@/types/dictionary';

const LABEL = 'mb-1 block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-white/60';
const FIELD = 'w-full min-h-[44px] border-2 border-transparent bg-paper-white px-3 py-2 font-receipt text-sm text-ink focus:border-[#8fe3d0] focus:outline-none disabled:opacity-50';
const ROWS = 'divide-y divide-dashed divide-ink/20';
const PREDICTIONS_PER_PAGE = 5;

/** A length of printed paper with a torn bottom edge. */
function Slip({ title, action, className = '', children }: { title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`flex min-w-0 flex-col ${className}`}>
      <div className="flex flex-1 flex-col bg-paper-white text-ink">
        <div className="flex items-center justify-between gap-2 border-b border-dashed border-ink/30 px-4 py-3 sm:px-5">
          <h2 className="min-w-0 text-3xl">{title}</h2>
          {action}
        </div>
        {children}
      </div>
      <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
    </section>
  );
}

/** A problem printed on a strip of paper, so it reads against the dark page. */
function Notice({ message, onRetry, retryLabel }: { message: string; onRetry: () => void; retryLabel: string }) {
  return (
    <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-x-4 border-l-4 border-stamp bg-paper-white px-4 py-1 font-receipt text-sm text-ink">
      <span className="min-w-0 py-2">{message}</span>
      <button type="button" onClick={onRetry} className="flex min-h-[44px] items-center font-semibold uppercase underline hover:no-underline">
        {retryLabel}
      </button>
    </div>
  );
}

/** Stamped when a product is about to run out, so the urgent lines stand out on the slip. */
function daysTone(days: number) {
  if (days <= 3) return 'bg-stamp text-paper-white';
  if (days <= 7) return 'bg-ink text-[#7df0d6]';
  return 'border border-ink/40 text-ink';
}

function InventoryShell({ tag, title, subtitle, side, children }: {
  tag?: string;
  title: string;
  subtitle?: string;
  side?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          {tag && <LineTag no="INV" className="mb-3 text-[#8fe3d0]">{tag}</LineTag>}
          <h1 className="text-5xl text-paper-white sm:text-6xl lg:text-7xl">{title}</h1>
          {subtitle && <p className="mt-3 text-paper/70">{subtitle}</p>}
        </div>
        {side}
      </div>
      {children}
    </div>
  );
}

interface InventoryWorkspaceProps {
  /** Where product links and low-stock rows go, relative to `/{tenant}/{lang}/`. */
  productsPath: string;
  /** Show an access notice instead of the page to anyone without `inventory.manage`. */
  requireManage?: boolean;
}

/**
 * The inventory screen on the dark till backdrop. Pages supply the surrounding shell
 * (navbar or admin console) and the `bg-brand-navy-deep` surface it sits on.
 */
export default function InventoryWorkspace({ productsPath, requireManage = false }: InventoryWorkspaceProps) {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const { subscriptionStatus } = useSubscription();
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [stockRefreshTrigger, setStockRefreshTrigger] = useState(0);
  const [lowStockCount, setLowStockCount] = useState<number | null>(null);
  const [predictionsPage, setPredictionsPage] = useState(1);
  const [auditGenerating, setAuditGenerating] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const { canAccess } = usePermissions();
  const canManage = canAccess('inventory.manage');
  const canViewPredictions = canManage;

  const {
    branches,
    branchesStatus,
    branchesError,
    refetchBranches,
    stockPredictions,
    predictionsStatus,
    predictionsError,
    refetchPredictions,
  } = useInventoryPage(tenant, selectedBranch || undefined, canViewPredictions);

  const inventoryEnabled =
    supportsFeature(settings ?? undefined, 'inventory') &&
    subscriptionStatus?.features.enableInventory !== false;
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

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
        const category = ((p.categoryId as { name?: string } | undefined)?.name) || (p.category as string) || '';
        if (p.hasVariations && Array.isArray(p.variations) && p.variations.length) {
          return (p.variations as Array<Record<string, unknown>>).map((v) => ({
            name: `${p.name as string} - ${variationLabel(v)}`,
            sku: (v.sku as string) || '',
            category,
            stock: (v.stock as number) ?? 0,
            branchStock: (v.branchStock as { branchId: string; stock: number }[]) || (p.branchStock as { branchId: string; stock: number }[]) || [],
          }));
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
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <LoadingSpinner size="md" color="#8fe3d0" />
      </div>
    );
  }

  const invDict = dict.inventory ?? {};
  // A refresh can shorten the list, so never stay past the last page
  const predictionPages = Math.max(1, Math.ceil(stockPredictions.length / PREDICTIONS_PER_PAGE));
  const currentPredictionsPage = Math.min(predictionsPage, predictionPages);
  const title = invDict.title || 'Inventory';
  const retryLabel = dict.common.retry || 'Retry';

  if (requireManage && !canManage) {
    return (
      <InventoryShell tag={settings?.companyName} title={title}>
        <Slip title={dict.admin?.accessRestricted || 'Access Restricted'} className="mt-6 max-w-2xl">
          <p className="border-l-4 border-stamp px-4 py-4 sm:px-5">
            {dict.admin?.accessRestrictedInventory || "You don't have permission to view inventory. Contact an admin or owner."}
          </p>
        </Slip>
      </InventoryShell>
    );
  }

  if (!inventoryEnabled) {
    return (
      <InventoryShell tag={settings?.companyName} title={title}>
        <Slip title={invDict.inventoryNotAvailable || 'Inventory Management Not Available'} className="mt-6 max-w-2xl">
          <p className="px-4 py-4 sm:px-5">
            {invDict.inventoryNotAvailableDesc ||
              `Inventory tracking is not enabled for ${businessTypeConfig?.name || 'your business type'}. To enable it, update your business type in Settings.`}
          </p>
        </Slip>
      </InventoryShell>
    );
  }

  const quickActions = [
    { href: `/${tenant}/${lang}/${productsPath}`, Icon: Package, label: dict.nav?.products || 'Products', note: invDict.manageStock || 'Manage stock & refill' },
    { href: `/${tenant}/${lang}/admin/stock-movements`, Icon: ArrowDownUp, label: dict.admin?.stockMovements || 'Stock Movements', note: invDict.viewHistory || 'View movement history' },
    { href: `/${tenant}/${lang}/admin/bundles`, Icon: Boxes, label: dict.admin?.bundles || 'Bundles', note: invDict.manageBundles || 'Manage product bundles' },
  ];

  return (
    <InventoryShell
      tag={settings?.companyName}
      title={title}
      subtitle={invDict.subtitle}
      side={
        <div className="flex items-center gap-3 border border-white/10 bg-black/30 px-4 py-2">
          <span className="mk-led-glow font-led text-4xl leading-none text-[#7df0d6]">{lowStockCount ?? '---'}</span>
          <span className="font-receipt text-xs uppercase tracking-[0.14em] text-white/60">{invDict.lowStockAlerts || 'Low Stock Alerts'}</span>
        </div>
      }
    >
      <div className="mt-6 flex flex-wrap items-end gap-3 border border-white/10 bg-black/20 p-3">
        <div className="w-full sm:w-64">
          <label htmlFor="inventory-branch" className={LABEL}>{invDict.branch || 'Branch'}</label>
          <select
            id="inventory-branch"
            value={selectedBranch}
            onChange={(e) => { setSelectedBranch(e.target.value); setPredictionsPage(1); }}
            disabled={branchesStatus === 'loading'}
            className={FIELD}
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
          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 bg-paper-white px-5 font-receipt text-xs font-medium uppercase text-ink transition-colors hover:bg-paper touch-manipulation disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:text-sm"
        >
          <Printer className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {auditGenerating
            ? dict.common.loading || 'Loading...'
            : invDict.printAuditSheet || 'Print Audit Sheet'}
        </button>

        <div className="flex min-h-[44px] w-full items-center font-receipt text-xs uppercase text-white/70 sm:ml-auto sm:w-auto">
          <RealTimeStockTracker
            branchId={selectedBranch || undefined}
            onStockUpdate={handleStockUpdate}
          />
        </div>
      </div>

      {auditError && <Notice message={auditError} onRetry={handlePrintAuditSheet} retryLabel={retryLabel} />}

      {branchesStatus === 'error' && (
        <Notice
          message={branchesError || invDict.failedToLoadBranches || 'Failed to load branches'}
          onRetry={refetchBranches}
          retryLabel={retryLabel}
        />
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Slip title={dict.components?.lowStockAlerts?.title || 'Low Stock Alerts'} className="xl:col-span-2">
          <LowStockAlerts
            embedded
            autoRefresh={true}
            refreshInterval={30000}
            branchId={selectedBranch || undefined}
            refreshTrigger={stockRefreshTrigger}
            onCountChange={setLowStockCount}
            onProductClick={(productId) => {
              window.location.href = `/${tenant}/${lang}/${productsPath}?edit=${productId}`;
            }}
          />
          <div className="px-4 py-4 sm:px-5">
            <Barcode className="h-8 w-40 text-ink/80" />
          </div>
        </Slip>

        <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2 xl:flex xl:flex-col">
          <nav aria-label={invDict.quickActions || 'Quick Actions'} className={`flex flex-col md:self-start xl:self-auto ${canViewPredictions ? '' : 'flex-1'}`}>
            <h2 className="text-3xl text-paper-white">{invDict.quickActions || 'Quick Actions'}</h2>
            <div className="mt-3 flex flex-1 flex-col border-l border-t border-white/25">
              {quickActions.map(({ href, Icon, label, note }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex min-h-[44px] flex-1 items-center gap-3 border-b border-r border-white/25 px-4 py-3 transition-colors hover:bg-white/10 touch-manipulation"
                >
                  <Icon className="h-5 w-5 shrink-0 text-[#8fe3d0]" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-receipt text-sm font-medium uppercase text-paper">{label}</span>
                    <span className="block text-xs text-white/60">{note}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/40" strokeWidth={1.75} aria-hidden />
                </Link>
              ))}
            </div>
          </nav>

          {canViewPredictions && (
            <Slip
              title={invDict.predictedStockouts || 'Predicted Stockouts'}
              className="flex-1"
              action={
                <button
                  type="button"
                  onClick={refetchPredictions}
                  disabled={predictionsStatus === 'loading'}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-ink/60 transition-colors hover:text-ink disabled:opacity-40"
                  title={invDict.refreshPredictions || 'Refresh predictions'}
                  aria-label={invDict.refreshPredictions || 'Refresh predictions'}
                >
                  <RefreshCw className={`h-4 w-4 ${predictionsStatus === 'loading' ? 'motion-safe:animate-spin' : ''}`} strokeWidth={1.75} aria-hidden />
                </button>
              }
            >
              {predictionsStatus === 'loading' ? (
                <LoadingSpinner size="sm" className="py-6" />
              ) : predictionsStatus === 'error' ? (
                <ErrorState
                  title={invDict.failedToLoadPredictions || 'Failed to load predictions'}
                  description={predictionsError || undefined}
                  onRetry={refetchPredictions}
                  retryLabel={retryLabel}
                  compact
                  className="py-4"
                />
              ) : stockPredictions.length === 0 ? (
                <EmptyState
                  icon="products"
                  title={invDict.noStockoutsPredicted || 'No stockouts predicted in the next 14 days'}
                  compact
                  className="py-4"
                />
              ) : (
                <>
                <ul className={ROWS}>
                  {stockPredictions.slice((currentPredictionsPage - 1) * PREDICTIONS_PER_PAGE, currentPredictionsPage * PREDICTIONS_PER_PAGE).map((p) => (
                    <li key={p.productId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden bg-ink/5">
                        {p.image ? (
                          <img // eslint-disable-line
                            src={p.image}
                            alt={p.name}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Package className="h-4 w-4 text-ink/30" strokeWidth={1.75} aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="font-receipt text-xs text-ink/60">
                          {(invDict.stockLeft || '{stock} left · ~{rate}/day sold')
                            .replace('{stock}', String(p.currentStock))
                            .replace('{rate}', String(p.avgDailySales))}
                        </p>
                      </div>
                      <span className={`shrink-0 whitespace-nowrap px-2 py-1 font-led text-2xl leading-none ${daysTone(p.daysUntilStockout)}`}>
                        {(invDict.daysShort || '{days}d').replace('{days}', String(p.daysUntilStockout))}
                      </span>
                    </li>
                  ))}
                </ul>
                <SlipPager
                  page={currentPredictionsPage}
                  totalPages={predictionPages}
                  onPageChange={setPredictionsPage}
                  label={dict.admin?.page || 'Page'}
                  previousLabel={dict.common?.previous || 'Previous'}
                  nextLabel={dict.common?.next || 'Next'}
                />
                </>
              )}
            </Slip>
          )}
        </div>
      </div>
    </InventoryShell>
  );
}
