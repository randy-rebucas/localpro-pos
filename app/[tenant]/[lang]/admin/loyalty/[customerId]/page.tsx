'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { type TranslationDict } from '@/types/dictionary';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { showToast } from '@/lib/toast';
import { useLoyaltyCustomerData } from '@/hooks/useLoyaltyCustomerData';
import { useLoyaltyAdjustment } from '@/hooks/useLoyaltyAdjustment';
import { typeColors } from '@/lib/loyalty-customer-helpers';
import { getDictionaryClient } from '../../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';

export default function LoyaltyCustomerPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const customerId = params.customerId as string;
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const { canAccess } = usePermissions();
  const canView = canAccess('loyalty.view');
  const canAdjust = canAccess('loyalty.adjust');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const { data, page, loading, error, setPage, refetch } = useLoyaltyCustomerData(customerId);
  const { form, saving: adjusting, updateForm, submitAdjustment } = useLoyaltyAdjustment(customerId);
  const [adjustError, setAdjustError] = useState('');

  // loyalty.* strings live in their own dictionary section.
  const ly = (dict as unknown as { loyalty?: Record<string, string | undefined> } | null)?.loyalty;

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError('');
    const result = await submitAdjustment();
    if (result.success) {
      showToast.success(ly?.pointsAdjusted || 'Points adjusted successfully');
      // Newest entries are on page 1; changing the page triggers the fetch itself.
      if (page !== 1) setPage(1);
      else refetch();
    } else {
      setAdjustError(result.error || (ly?.adjustFailed || 'Failed to adjust points'));
    }
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="bg-white border border-win8-danger p-6" role="alert">
          <h2 className="text-base font-bold text-win8-danger mb-1">{dict.admin?.accessRestricted || 'Access Restricted'}</h2>
          <p className="text-sm text-gray-700">
            {dict.admin?.accessRestrictedLoyalty || "You don't have permission to view loyalty. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  const typeLabel = (type: string) =>
    type === 'earn' ? (ly?.typeEarn || 'Earn') : type === 'redeem' ? (ly?.typeRedeem || 'Redeem') : (ly?.typeAdjust || 'Adjust');

  const backLink = (
    <Link
      href={`/${tenant}/${lang}/admin/loyalty`}
      className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
    >
      {ly?.backToLoyaltyProgram || '← Back to Loyalty Program'}
    </Link>
  );

  if (loading && !data) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader title={ly?.loyaltyPointsAccount || 'Loyalty Points Account'} actions={backLink} />
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.common?.loading || 'Loading…'}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader title={ly?.loyaltyPointsAccount || 'Loyalty Points Account'} actions={backLink} />
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error || (ly?.loadFailed || 'Failed to load loyalty data')}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  const p = data.pagination;

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={data.customerName}
        description={ly?.loyaltyPointsAccount || 'Loyalty Points Account'}
        actions={backLink}
      />

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-300 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{ly?.pointsBalance || 'Points balance'}</p>
            <p className="text-3xl font-bold tabular-nums text-brand mt-1.5">{data.loyaltyPointsBalance.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-gray-300 p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{ly?.historyEntries || 'History entries'}</p>
            <p className="text-3xl font-bold tabular-nums text-gray-900 mt-1.5">{p.total.toLocaleString()}</p>
          </div>
        </div>

        {canAdjust && (
          <section className="bg-white border border-gray-300">
            <div className="px-6 py-4 border-b border-gray-300">
              <h2 className="text-base font-bold text-gray-900">{ly?.manualAdjustment || 'Manual Adjustment'}</h2>
            </div>
            <form onSubmit={handleAdjust} className="p-6 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div>
                  <label htmlFor="loyalty-points" className="block text-xs font-medium text-gray-600 mb-1">{ly?.points || 'Points'}</label>
                  <input
                    id="loyalty-points"
                    type="number"
                    placeholder={ly?.pointsPlaceholder || 'Points (+ to add, - to deduct)'}
                    value={form.points}
                    onChange={(e) => updateForm({ points: e.target.value })}
                    className="border border-gray-300 px-3 py-2 text-sm w-full sm:w-48 tabular-nums"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="loyalty-reason" className="block text-xs font-medium text-gray-600 mb-1">{ly?.reason || 'Reason'}</label>
                  <input
                    id="loyalty-reason"
                    type="text"
                    placeholder={ly?.reasonPlaceholder || 'Reason / description'}
                    value={form.description}
                    onChange={(e) => updateForm({ description: e.target.value })}
                    className="border border-gray-300 px-3 py-2 text-sm w-full"
                  />
                </div>
                <button
                  type="submit"
                  disabled={adjusting}
                  className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {adjusting ? (dict.common?.saving || 'Saving…') : (ly?.apply || 'Apply')}
                </button>
              </div>
              {adjustError && <p className="p-3 bg-white border border-win8-danger text-win8-danger text-sm">{adjustError}</p>}
            </form>
          </section>
        )}

        <div className="border border-gray-300 bg-white">
          <div className="px-4 py-3 border-b border-gray-300">
            <h2 className="text-sm font-bold text-gray-900">{ly?.pointsHistory || 'Points History'}</h2>
          </div>
          {data.history.length === 0 ? (
            <p className="text-center py-12 text-gray-400 text-sm">{ly?.noHistory || 'No history yet.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">{dict.admin?.type || 'Type'}</th>
                    <th className="px-4 py-3 text-left font-medium">{dict.admin?.description || 'Description'}</th>
                    <th className="px-4 py-3 text-left font-medium">{dict.admin?.date || 'Date'}</th>
                    <th className="px-4 py-3 text-right font-medium">{ly?.balanceLabel || 'Balance'}</th>
                    <th className="px-4 py-3 text-right font-medium">{ly?.points || 'Points'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.history.map((entry) => (
                    <tr key={entry._id} className="hover:bg-gray-100 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 text-xs font-semibold ${typeColors[entry.type] || 'bg-gray-500 text-white'}`}>
                          {typeLabel(entry.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{entry.description || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">
                        {new Date(entry.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-xs text-gray-500 tabular-nums">
                        {entry.balanceBefore.toLocaleString()} → {entry.balanceAfter.toLocaleString()}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-right font-semibold tabular-nums ${entry.points > 0 ? 'text-win8-success' : 'text-win8-danger'}`}>
                        {entry.points > 0 ? `+${entry.points.toLocaleString()}` : entry.points.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {p.totalPages > 1 && (
            <div className="border-t border-gray-300 px-4 py-3 flex items-center justify-between text-sm text-gray-500">
              <span className="tabular-nums">
                {(dict.common?.showingRange || 'Showing {from}–{to} of {total}')
                  .replace('{from}', String((p.page - 1) * p.limit + 1))
                  .replace('{to}', String(Math.min(p.page * p.limit, p.total)))
                  .replace('{total}', String(p.total))}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1 || loading}
                  className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
                >
                  ← {ly?.prev || 'Prev'}
                </button>
                <button
                  type="button"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= p.totalPages || loading}
                  className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
                >
                  {dict.common?.next || 'Next'} →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
