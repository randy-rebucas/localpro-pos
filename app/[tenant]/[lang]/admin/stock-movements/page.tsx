'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import { useStockMovementsList } from '@/hooks/useStockMovementsList';
import {
  getMovementTypeColor,
  getProductName,
  getProductSku,
  getUserName,
  getReceiptNumber,
  getNotes,
} from '@/lib/stock-movements-helpers';

const SPINNER = <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>;
const thCls = 'px-4 py-3 text-left font-medium';
const thRight = 'px-4 py-3 text-right font-medium';

export default function StockMovementsPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const {
    movements, loading, error, page, totalPages, total, limit, filters,
    fetchMovements, updateFilters, updatePage,
  } = useStockMovementsList();
  const { settings } = useTenantSettings();
  const inventoryEnabled = supportsFeature(settings ?? undefined, 'inventory');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;
  const { canAccess } = usePermissions();
  const canManage = canAccess('stock_movements.view');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchMovements();
  }, [page, filters, fetchMovements]);

  if (!dict) {
    return <div className="flex items-center justify-center py-24">{SPINNER}</div>;
  }

  const header = (
    <AdminPageHeader
      title={dict.admin?.stockMovements || 'Stock Movements'}
      description={dict.admin?.stockMovementsSubtitle || 'Track all inventory changes and movements'}
    />
  );

  if (!canManage) {
    return (
      <div className="px-4 sm:px-6 py-6">
        {header}
        <div className="p-4 bg-white border border-win8-danger text-sm" role="alert">
          <p className="font-bold text-win8-danger">{dict.admin?.accessRestricted || 'Access Restricted'}</p>
          <p className="text-gray-700 mt-1">
            {dict.admin?.accessRestrictedStockMovements || "You don't have permission to view stock movements. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  const typeLabels: Record<string, string> = {
    sale: dict.admin?.sale || 'Sale',
    purchase: dict.admin?.purchase || 'Purchase',
    adjustment: dict.admin?.adjustment || 'Adjustment',
    return: dict.admin?.returnType || 'Return',
    damage: dict.admin?.damageType || 'Damage',
    transfer: dict.admin?.transferType || 'Transfer',
  };

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          {SPINNER}
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingStockMovements || 'Loading stock movements…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300" role="alert">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button onClick={fetchMovements} className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors">
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (movements.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {filters.type
            ? (dict.admin?.noStockMovementsMatch || 'No stock movements match your filters.')
            : (dict.admin?.noStockMovementsYet || 'No stock movements yet.')}
        </div>
      );
    }

    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    return (
      <div className="border border-gray-300 bg-white">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                <th className={thCls}>{dict.admin?.date || 'Date'}</th>
                <th className={thCls}>{dict.admin?.product || 'Product'}</th>
                <th className={thCls}>{dict.admin?.type || 'Type'}</th>
                <th className={thRight}>{dict.admin?.quantity || 'Quantity'}</th>
                <th className={thRight}>{dict.admin?.stockChange || 'Stock Change'}</th>
                <th className={thCls}>{dict.admin?.user || 'User'}</th>
                <th className={thCls}>{dict.admin?.transaction || 'Transaction'}</th>
                <th className={thCls}>{dict.admin?.notes || 'Notes'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {movements.map((movement, index) => {
                const productSku = getProductSku(movement.productId);
                const receiptNumber = getReceiptNumber(movement.transactionId);
                const notes = getNotes(movement.notes, movement.reason);
                const variation = movement.variation
                  ? Object.entries(movement.variation).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ')
                  : '';
                const positive = movement.quantity > 0;

                return (
                  <tr key={movement._id || `movement-${index}`} className="hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700 tabular-nums">
                      {new Date(movement.createdAt).toLocaleString(undefined, { hour12: true })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{getProductName(movement.productId)}</p>
                      {productSku && <p className="text-xs text-gray-400 font-mono">{productSku}</p>}
                      {variation && <p className="text-xs text-gray-500">{variation}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs font-semibold ${getMovementTypeColor(movement.type)}`}>
                        {typeLabels[movement.type] || movement.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                      <span className={`font-semibold ${positive ? 'text-win8-success' : 'text-win8-danger'}`}>
                        {positive ? '+' : ''}{movement.quantity.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700">
                      {movement.previousStock.toLocaleString()} → <span className="font-medium text-gray-900">{movement.newStock.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{getUserName(movement.userId)}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-700">
                      {receiptNumber === '-' ? '—' : receiptNumber}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[240px] truncate" title={notes !== '-' ? notes : undefined}>
                      {notes === '-' ? <span className="text-gray-400">—</span> : notes}
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
              {dict.admin?.showing || 'Showing'} {start.toLocaleString()}–{end.toLocaleString()} {dict.admin?.of || 'of'} {total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updatePage(page - 1)}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
              >
                ← {dict.common?.previous || 'Prev'}
              </button>
              <button
                type="button"
                onClick={() => updatePage(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
              >
                {dict.common?.next || 'Next'} →
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 sm:px-6 py-6">
      {header}

      <div className="space-y-4">
        {!inventoryEnabled && (
          <div className="p-4 bg-white border border-win8-warning text-sm" role="status">
            <p className="font-bold text-win8-warning">{dict.admin?.stockMovementsNotAvailable || 'Stock Movements Not Available'}</p>
            <p className="text-gray-700 mt-1">
              {(dict.admin?.stockMovementsNotAvailableDesc || 'Stock movements tracking is not available for {businessType}.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
            </p>
            <p className="text-gray-500 mt-1">
              {dict.admin?.stockMovementsNotAvailableHint || 'If you need stock tracking, please enable inventory management in Settings.'}
            </p>
          </div>
        )}

        {inventoryEnabled && (
          <>
            <div className="bg-white border border-gray-300 p-3 flex flex-wrap gap-3 items-end">
              <div>
                <label htmlFor="sm-type" className="block text-xs font-medium text-gray-600 mb-1">{dict.admin?.type || 'Type'}</label>
                <select
                  id="sm-type"
                  value={filters.type}
                  onChange={(e) => updateFilters({ type: e.target.value })}
                  className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900 w-44"
                >
                  <option value="">{dict.admin?.allTypes || 'All Types'}</option>
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              {filters.type && (
                <button
                  type="button"
                  onClick={() => updateFilters({ type: '' })}
                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  {dict.common?.clear || 'Clear'}
                </button>
              )}
            </div>

            {renderBody()}
          </>
        )}
      </div>
    </div>
  );
}
