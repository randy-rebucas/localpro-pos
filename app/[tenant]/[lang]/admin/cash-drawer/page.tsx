'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { showToast } from '@/lib/toast';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { useCashDrawerSessions, type CashDrawerSession } from '@/hooks/useCashDrawerSessions';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getUserName,
  getUserEmail,
  calculateDifference,
  getDifferenceColor,
  getStatusBadgeClasses,
  getStatusLabel,
  formatSessionTime,
  getRefreshSuccessMessage,
} from '@/lib/cash-drawer-helpers';

const PAGE_SIZE = 10;

export default function CashDrawerPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [selectedSession, setSelectedSession] = useState<CashDrawerSession | null>(null);
  // Keeps the drawer content rendered while it slides out after close.
  const [displaySession, setDisplaySession] = useState<CashDrawerSession | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);

  const { sessions, loading, error, totalPages, fetchSessions } = useCashDrawerSessions();
  const { canAccess } = usePermissions();
  const canView = canAccess('cash_drawer.manage');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchSessions(statusFilter, (error) => showToast.error(error), page, PAGE_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page]);

  const openSession = (session: CashDrawerSession) => {
    setSelectedSession(session);
    setDisplaySession(session);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    let failed = false;
    await fetchSessions(statusFilter, (error) => {
      failed = true;
      showToast.error(error);
    }, page, PAGE_SIZE);
    if (!failed) {
      showToast.success(getRefreshSuccessMessage(dict));
    }
    setRefreshing(false);
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
        <div className="p-4 bg-white border border-win8-danger">
          <h2 className="text-base font-bold text-win8-danger mb-1">{dict.admin?.accessRestricted || 'Access Restricted'}</h2>
          <p className="text-sm text-gray-700">
            {dict.admin?.accessRestrictedCashDrawer || "You don't have permission to view cash drawer sessions. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingCashDrawerSessions || 'Loading cash drawer sessions…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            onClick={() => fetchSessions(statusFilter, undefined, page, PAGE_SIZE)}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (sessions.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {statusFilter
            ? (dict.admin?.noCashDrawerSessionsMatch || 'No cash drawer sessions match your filters.')
            : (dict.admin?.noCashDrawerSessionsYet || 'No cash drawer sessions yet.')}
        </div>
      );
    }

    const viewLabel = dict.admin?.viewSessionDetails || dict.common?.view || 'View session details';

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.user || 'User'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.openingTime || 'Opening Time'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.admin?.openingAmount || 'Opening Amount'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.closingTime || 'Closing Time'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.admin?.expectedAmount || 'Expected Amount'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.admin?.closingAmount || 'Closing Amount'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.admin?.difference || 'Difference'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sessions.map((session) => {
              const userName = getUserName(session);
              const userEmail = getUserEmail(session);
              const difference = calculateDifference(session);
              const selected = selectedSession?.id === session.id;

              return (
                <tr key={session.id} className={`hover:bg-gray-100 transition-colors ${selected ? 'bg-brand-soft' : ''}`}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="font-medium text-gray-900">{userName}</p>
                    {userEmail && <p className="text-xs text-gray-400">{userEmail}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">
                    {formatSessionTime(session.openingTime)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-medium text-gray-900">
                    <Currency amount={session.openingAmount} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">
                    {session.closingTime ? formatSessionTime(session.closingTime) : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700">
                    {session.expectedAmount !== undefined ? <Currency amount={session.expectedAmount} /> : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-medium text-gray-900">
                    {session.closingAmount !== undefined ? <Currency amount={session.closingAmount} /> : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                    {difference !== null ? (
                      <>
                        <p className={`font-semibold ${getDifferenceColor(difference)}`}>
                          {difference >= 0 ? '+' : '−'}<Currency amount={Math.abs(difference)} />
                        </p>
                        {!!session.shortage && (
                          <p className="text-xs text-win8-danger">
                            {dict.admin?.shortage || 'Shortage'}: <Currency amount={session.shortage} />
                          </p>
                        )}
                        {!!session.overage && (
                          <p className="text-xs text-win8-success">
                            {dict.admin?.overage || 'Overage'}: <Currency amount={session.overage} />
                          </p>
                        )}
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClasses(session.status)}`}>
                      {getStatusLabel(session.status, dict)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => openSession(session)}
                        title={viewLabel}
                        aria-label={`${viewLabel}: ${userName}`}
                        className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter]"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="border-t border-gray-300 px-4 py-3 flex items-center justify-between text-sm text-gray-500">
            <span className="tabular-nums">
              {(dict.admin?.pageOf || 'Page {page} of {total}')
                .replace('{page}', String(page))
                .replace('{total}', String(totalPages))}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
              >
                ← {dict.transactions?.previous || dict.common?.previous || 'Prev'}
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
              >
                {dict.transactions?.next || dict.common?.next || 'Next'} →
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.cashDrawer || 'Cash Drawer Sessions'}
          description={dict.admin?.cashDrawerSubtitle || 'Manage and monitor cash drawer operations'}
        />

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              aria-label={dict.admin?.filterByStatus || 'Filter by Status'}
              className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
            >
              <option value="">{dict.admin?.allSessions || 'All Sessions'}</option>
              <option value="open">{dict.admin?.openSessions || 'Open Sessions'}</option>
              <option value="closed">{dict.admin?.closedSessions || 'Closed Sessions'}</option>
            </select>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title={dict.admin?.cashDrawerRefreshTitle || 'Refresh cash drawer sessions'}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
              </svg>
              {refreshing
                ? (dict.admin?.refreshingSessions || 'Refreshing…')
                : (dict.admin?.refresh || 'Refresh')}
            </button>
          </div>

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={!!selectedSession} onClose={() => setSelectedSession(null)}>
        {displaySession && (
          <CashDrawerDetail
            session={displaySession}
            onClose={() => setSelectedSession(null)}
            dict={dict}
          />
        )}
      </Win8Drawer>
    </>
  );
}

function CashDrawerDetail({
  session,
  onClose,
  dict,
}: {
  session: CashDrawerSession;
  onClose: () => void;
  dict: Record<string, Record<string, string>> | null;
}) {
  const userName = getUserName(session);
  const userEmail = getUserEmail(session);
  const difference = calculateDifference(session);
  const closeLabel = dict?.common?.close || 'Close';

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
        <h2 className="text-base font-semibold">
          {dict?.admin?.cashDrawerDetails || 'Cash Drawer Session Details'}
        </h2>
        <button type="button" onClick={onClose} title={closeLabel} aria-label={closeLabel} className="text-white/70 hover:text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">{dict?.admin?.user || 'User'}</p>
            <p className="text-sm font-medium text-gray-900">{userName}</p>
            {userEmail && <p className="text-xs text-gray-400">{userEmail}</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">{dict?.admin?.status || 'Status'}</p>
            <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClasses(session.status)}`}>
              {getStatusLabel(session.status, dict)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">{dict?.admin?.openingTime || 'Opening Time'}</p>
            <p className="text-sm text-gray-900">{formatSessionTime(session.openingTime)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">{dict?.admin?.closingTime || 'Closing Time'}</p>
            <p className="text-sm text-gray-900">{session.closingTime ? formatSessionTime(session.closingTime) : '—'}</p>
          </div>
        </div>

        <hr className="border-gray-300" />

        <dl className="divide-y divide-gray-200 text-sm">
          <div className="flex justify-between py-2">
            <dt className="text-gray-500">{dict?.admin?.openingAmount || 'Opening Amount'}</dt>
            <dd className="font-medium tabular-nums text-gray-900"><Currency amount={session.openingAmount} /></dd>
          </div>
          {session.expectedAmount !== undefined && (
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">{dict?.admin?.expectedAmount || 'Expected Amount'}</dt>
              <dd className="font-medium tabular-nums text-gray-900"><Currency amount={session.expectedAmount} /></dd>
            </div>
          )}
          {session.totalDiscounts !== undefined && session.totalDiscounts > 0 && (
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">{dict?.admin?.totalDiscounts || 'Total Discounts'}</dt>
              <dd className="font-semibold tabular-nums text-win8-success">−<Currency amount={session.totalDiscounts} /></dd>
            </div>
          )}
          {session.totalVAT !== undefined && session.totalVAT > 0 && (
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">{dict?.admin?.totalVat || 'Total VAT'}</dt>
              <dd className="font-medium tabular-nums text-gray-900"><Currency amount={session.totalVAT} /></dd>
            </div>
          )}
          {session.closingAmount !== undefined && (
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">{dict?.admin?.closingAmount || 'Closing Amount'}</dt>
              <dd className="font-medium tabular-nums text-gray-900"><Currency amount={session.closingAmount} /></dd>
            </div>
          )}
          {session.shortage !== undefined && session.shortage > 0 && (
            <div className="flex justify-between py-2 text-win8-danger">
              <dt>{dict?.admin?.shortage || 'Shortage'}</dt>
              <dd className="font-medium tabular-nums"><Currency amount={session.shortage} /></dd>
            </div>
          )}
          {session.overage !== undefined && session.overage > 0 && (
            <div className="flex justify-between py-2 text-win8-success">
              <dt>{dict?.admin?.overage || 'Overage'}</dt>
              <dd className="font-medium tabular-nums"><Currency amount={session.overage} /></dd>
            </div>
          )}
        </dl>

        {difference !== null && (
          <div className="flex justify-between items-center border border-gray-300 px-4 py-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{dict?.admin?.difference || 'Difference'}</span>
            <span className={`text-lg font-bold tabular-nums ${getDifferenceColor(difference)}`}>
              {difference >= 0 ? '+' : '−'}<Currency amount={Math.abs(difference)} />
            </span>
          </div>
        )}

        {session.notes && (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">{dict?.common?.notes || 'Notes'}</p>
            <div className="p-3 bg-gray-50 border border-gray-300 text-sm text-gray-700 whitespace-pre-wrap">{session.notes}</div>
          </div>
        )}
      </div>

      <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
        >
          {closeLabel}
        </button>
      </div>
    </>
  );
}
