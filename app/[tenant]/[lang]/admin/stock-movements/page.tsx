'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowDownUp } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SlipPager from '@/components/ui/SlipPager';
import { RegisterPage, Strip } from '@/components/admin/register-ui';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supportsFeature, getBusinessType } from '@/lib/business-type-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDateTime } from '@/lib/formatting';
import { useStockMovementsList, type StockMovement } from '@/hooks/useStockMovementsList';
import {
  getProductName,
  getProductSku,
  getUserName,
  getReceiptNumber,
  getNotes,
} from '@/lib/stock-movements-helpers';

type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const MOVEMENT_TYPES = ['sale', 'purchase', 'adjustment', 'return', 'damage', 'transfer'] as const;

const TH = 'whitespace-nowrap px-4 py-2 text-left font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60';
const TD = 'px-4 py-3 font-receipt text-sm';
/** Cells holding written words rather than printed figures. */
const TD_TEXT = 'px-4 py-3 text-sm';

const typeLabel = (dict: Dict, type: string) =>
  ({
    sale: dict.admin?.sale || 'Sale',
    purchase: dict.admin?.purchase || 'Purchase',
    adjustment: dict.admin?.adjustment || 'Adjustment',
    return: dict.admin?.returnType || 'Return',
    damage: dict.admin?.damageType || 'Damage',
    transfer: dict.admin?.transferType || 'Transfer',
  } as Record<string, string>)[type] || type;

const variationText = (movement: StockMovement) =>
  movement.variation
    ? Object.entries(movement.variation).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';

const branchName = (movement: StockMovement) =>
  typeof movement.branchId === 'object' && movement.branchId?.name ? movement.branchId.name : '';

/** Stock in reads in teal, stock out in stamp red, like the two columns of a stock card. */
function Quantity({ value }: { value: number }) {
  return (
    <span className={`font-semibold ${value > 0 ? 'text-brand-hover' : value < 0 ? 'text-stamp' : 'text-ink/60'}`}>
      {value > 0 ? '+' : ''}{value}
    </span>
  );
}

function TypeTag({ dict, type }: { dict: Dict; type: string }) {
  const out = type === 'sale' || type === 'damage';
  return (
    <span className={`inline-block whitespace-nowrap border px-1.5 py-0.5 font-receipt text-[11px] uppercase ${out ? 'border-stamp/50 text-stamp' : 'border-ink/25 text-ink/70'}`}>
      {typeLabel(dict, type)}
    </span>
  );
}

export default function StockMovementsPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const { movements, loading, page, totalPages, filters, message, fetchMovements, updateFilters, updatePage } = useStockMovementsList();
  const { settings } = useTenantSettings();
  const dateSettings = settings || getDefaultTenantSettings();
  const inventoryEnabled = supportsFeature(settings ?? undefined, 'inventory');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;
  const { canAccess } = usePermissions();
  const canManage = canAccess('stock_movements.manage');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchMovements().finally(() => setLoadedOnce(true));
  }, [page, filters, fetchMovements]);

  if (!dict || !loadedOnce) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const title = dict.admin?.stockMovements || 'Stock Movements';

  if (!canManage) {
    return (
      <RegisterPage tagNo="SM" tag={settings?.companyName} title={title}>
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink">
            <h2 className="text-3xl">{dict.admin?.accessRestricted || 'Access Restricted'}</h2>
            <p className="mt-2 text-sm">
              {dict.admin?.accessRestrictedStockMovements || "You don't have permission to view stock movements. Contact an admin or owner."}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </RegisterPage>
    );
  }

  const unknown = dict.admin?.unknownProduct || 'Unknown product';
  const system = dict.admin?.systemUser || 'System';
  const filterKeys = [{ value: '', label: dict.admin?.allTypes || 'All Types' }, ...MOVEMENT_TYPES.map((type) => ({ value: type, label: typeLabel(dict, type) }))];
  const productLabel = (movement: StockMovement) => {
    const name = getProductName(movement.productId);
    return name === 'Unknown' ? unknown : name;
  };
  const userLabel = (movement: StockMovement) => {
    const name = getUserName(movement.userId);
    return name === 'System' ? system : name;
  };

  return (
    <RegisterPage
      tagNo="SM"
      tag={settings?.companyName}
      title={title}
      subtitle={dict.admin?.stockMovementsSubtitle || 'Track all inventory changes and movements'}
    >
      {message && (
        <div className="mt-6">
          <Strip tone={message.type === 'success' ? 'ok' : 'error'}>{message.text}</Strip>
        </div>
      )}

      {!inventoryEnabled ? (
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink">
            <h2 className="text-3xl">{dict.admin?.stockMovementsNotAvailable || 'Stock Movements Not Available'}</h2>
            <p className="mt-2 text-sm">
              {(dict.admin?.stockMovementsNotAvailableDesc || 'Stock movements tracking is not available for {businessType}.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
            </p>
            <p className="mt-1 text-sm text-ink/70">
              {dict.admin?.stockMovementsNotAvailableHint || 'If you need stock tracking, please enable inventory management in Settings.'}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      ) : (
        <>
          {/* Which kind of movement to list */}
          <nav
            aria-label={dict.admin?.type || 'Type'}
            className="mt-6 grid grid-cols-2 border-l border-t border-white/25 sm:grid-cols-4 xl:grid-cols-7"
          >
            {filterKeys.map((key) => (
              <button
                key={key.value || 'all'}
                type="button"
                aria-pressed={filters.type === key.value}
                onClick={() => updateFilters({ type: key.value })}
                className={`flex min-h-[44px] items-center justify-center border-b border-r border-white/25 px-2 text-center font-receipt text-xs font-medium uppercase transition-colors touch-manipulation ${filters.type === key.value ? 'bg-paper-white text-ink' : 'text-paper hover:bg-white/10'}`}
              >
                {key.label}
              </button>
            ))}
          </nav>

          {/* The stock card, one line per movement */}
          <section className="mt-6" aria-busy={loading}>
            <div className={`bg-paper-white text-ink transition-opacity ${loading ? 'opacity-60' : ''}`}>
              {movements.length === 0 ? (
                <div className="px-4 py-14 text-center">
                  <ArrowDownUp className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
                  <p className="font-receipt text-sm text-ink/60">{dict.admin?.noStockMovements || 'No stock movements found'}</p>
                </div>
              ) : (
                <>
                  {/* Up to xl: stacked lines */}
                  <ul className="divide-y divide-dashed divide-ink/20 xl:hidden">
                    {movements.map((movement) => {
                      const sku = getProductSku(movement.productId);
                      const variation = variationText(movement);
                      const branch = branchName(movement);
                      const receipt = getReceiptNumber(movement.transactionId);
                      const notes = getNotes(movement.notes, movement.reason);
                      return (
                        <li key={movement._id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{productLabel(movement)}</p>
                              <p className="mt-0.5 font-receipt text-xs text-ink/60">
                                {[sku, variation, branch].filter(Boolean).join(' · ') || ' '}
                              </p>
                            </div>
                            <div className="shrink-0 text-right font-receipt">
                              <p className="text-lg leading-none"><Quantity value={movement.quantity} /></p>
                              <p className="mt-1 text-xs text-ink/60">{movement.previousStock} → {movement.newStock}</p>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-receipt text-xs text-ink/60">
                            <TypeTag dict={dict} type={movement.type} />
                            <span>{formatDateTime(movement.createdAt, dateSettings)}</span>
                            <span>{userLabel(movement)}</span>
                            {receipt !== '-' && <span className="text-ink">{receipt}</span>}
                          </div>
                          {notes !== '-' && <p className="mt-1 text-xs text-ink/70">{notes}</p>}
                        </li>
                      );
                    })}
                  </ul>

                  {/* From xl: the full ledger */}
                  <div className="hidden overflow-x-auto xl:block" role="region" aria-label={title} tabIndex={0}>
                    <table className="min-w-full">
                      <thead className="border-b border-dashed border-ink/30">
                        <tr>
                          <th scope="col" className={TH}>{dict.admin?.date || 'Date'}</th>
                          <th scope="col" className={TH}>{dict.admin?.product || 'Product'}</th>
                          <th scope="col" className={TH}>{dict.admin?.type || 'Type'}</th>
                          <th scope="col" className={`${TH} text-right`}>{dict.admin?.quantity || 'Quantity'}</th>
                          <th scope="col" className={`${TH} text-right`}>{dict.admin?.stockChange || 'Stock Change'}</th>
                          <th scope="col" className={TH}>{dict.admin?.user || 'User'}</th>
                          <th scope="col" className={TH}>{dict.admin?.transaction || 'Transaction'}</th>
                          <th scope="col" className={TH}>{dict.admin?.notes || 'Notes'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dashed divide-ink/20">
                        {movements.map((movement) => {
                          const sku = getProductSku(movement.productId);
                          const variation = variationText(movement);
                          const branch = branchName(movement);
                          return (
                            <tr key={movement._id} className="align-top transition-colors hover:bg-paper">
                              <td className={`${TD} whitespace-nowrap text-ink/70`}>{formatDateTime(movement.createdAt, dateSettings)}</td>
                              <td className={`${TD} min-w-[12rem]`}>
                                <p className="font-body font-medium">{productLabel(movement)}</p>
                                {(sku || variation || branch) && (
                                  <p className="mt-0.5 text-xs text-ink/60">{[sku, variation, branch].filter(Boolean).join(' · ')}</p>
                                )}
                              </td>
                              <td className={TD}><TypeTag dict={dict} type={movement.type} /></td>
                              <td className={`${TD} whitespace-nowrap text-right`}><Quantity value={movement.quantity} /></td>
                              <td className={`${TD} whitespace-nowrap text-right text-ink/70`}>{movement.previousStock} → {movement.newStock}</td>
                              <td className={`${TD} whitespace-nowrap text-ink/70`}>{userLabel(movement)}</td>
                              <td className={`${TD} whitespace-nowrap`}>{getReceiptNumber(movement.transactionId)}</td>
                              <td className={`${TD_TEXT} max-w-xs text-ink/70`}>{getNotes(movement.notes, movement.reason)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <SlipPager
                page={page}
                totalPages={totalPages}
                onPageChange={updatePage}
                label={dict.admin?.page || 'Page'}
                previousLabel={dict.common?.previous || 'Previous'}
                nextLabel={dict.common?.next || 'Next'}
              />
            </div>
            <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
          </section>
        </>
      )}
    </RegisterPage>
  );
}
