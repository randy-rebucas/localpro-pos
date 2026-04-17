'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
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

export default function StockMovementsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { movements, loading, page, totalPages, filters, message, fetchMovements, updateFilters, updatePage } = useStockMovementsList();
  const { settings } = useTenantSettings();
  const inventoryEnabled = supportsFeature(settings ?? undefined, 'inventory');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchMovements();
  }, [page, filters, fetchMovements]);

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
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
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.stockMovements || 'Stock Movements'}
              </h1>
              <p className="text-gray-600">{dict.admin?.stockMovementsSubtitle || 'Track all inventory changes and movements'}</p>
            </div>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        {!inventoryEnabled && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-300 text-yellow-800">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                  {dict.admin?.stockMovementsNotAvailable || 'Stock Movements Not Available'}
                </h3>
                <p className="text-yellow-800">
                  {(dict.admin?.stockMovementsNotAvailableDesc || 'Stock movements tracking is not available for {businessType}.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
                </p>
                <p className="text-sm text-yellow-700 mt-2">
                  {dict.admin?.stockMovementsNotAvailableHint || 'If you need stock tracking, please enable inventory management in Settings.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {inventoryEnabled && (
          <div className="bg-white border border-gray-300 p-6">
          <div className="mb-4 flex gap-4">
            <select
              value={filters.type}
              onChange={(e) => updateFilters({ type: e.target.value })}
              className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">{dict.admin?.allTypes || 'All Types'}</option>
              <option value="sale">{dict.admin?.sale || 'Sale'}</option>
              <option value="purchase">{dict.admin?.purchase || 'Purchase'}</option>
              <option value="adjustment">{dict.admin?.adjustment || 'Adjustment'}</option>
              <option value="return">{dict.admin?.returnType || 'Return'}</option>
              <option value="damage">{dict.admin?.damageType || 'Damage'}</option>
              <option value="transfer">{dict.admin?.transferType || 'Transfer'}</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.date || 'Date'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.product || 'Product'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.type || 'Type'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.quantity || 'Quantity'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.stockChange || 'Stock Change'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.user || 'User'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.transaction || 'Transaction'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.notes || 'Notes'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {movements.map((movement) => {
                  const productName = getProductName(movement.productId);
                  const productSku = getProductSku(movement.productId);
                  const userName = getUserName(movement.userId);
                  const receiptNumber = getReceiptNumber(movement.transactionId);
                  
                  return (
                    <tr key={movement._id}>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(movement.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">{productName}</div>
                        {productSku && (
                          <div className="text-xs text-gray-500">{dict.admin?.sku || 'SKU'}: {productSku}</div>
                        )}
                        {movement.variation && (
                          <div className="text-xs text-gray-500">
                            {Object.entries(movement.variation).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold border ${getMovementTypeColor(movement.type)}`}>
                          {({
                            sale: dict.admin?.sale || 'Sale',
                            purchase: dict.admin?.purchase || 'Purchase',
                            adjustment: dict.admin?.adjustment || 'Adjustment',
                            return: dict.admin?.returnType || 'Return',
                            damage: dict.admin?.damageType || 'Damage',
                            transfer: dict.admin?.transferType || 'Transfer',
                          } as Record<string, string>)[movement.type] || movement.type}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <span className={movement.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                          {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {movement.previousStock} → {movement.newStock}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {userName}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {receiptNumber}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {getNotes(movement.notes, movement.reason)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {movements.length === 0 && (
              <div className="text-center py-8 text-gray-500">{dict.common?.noResults || 'No stock movements found'}</div>
            )}
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => updatePage(page - 1)}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 disabled:opacity-50 bg-white"
              >
                {dict.common?.previous || 'Previous'}
              </button>
              <span className="px-4 py-2 text-sm text-gray-700">
                {dict.admin?.page || 'Page'} {page} / {totalPages}
              </span>
              <button
                onClick={() => updatePage(page + 1)}
                disabled={page === totalPages}
                className="px-4 py-2 border border-gray-300 disabled:opacity-50 bg-white"
              >
                {dict.common?.next || 'Next'}
              </button>
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
}

