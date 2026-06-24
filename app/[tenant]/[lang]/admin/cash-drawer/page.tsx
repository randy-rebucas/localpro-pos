'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { useCashDrawerSessions, type CashDrawerSession } from '@/hooks/useCashDrawerSessions';
import {
  getUserName,
  getUserEmail,
  calculateDifference,
  getDifferenceColor,
  getStatusBadgeClasses,
  getStatusLabel,
  formatSessionTime,
} from '@/lib/cash-drawer-helpers';

export default function CashDrawerPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [selectedSession, setSelectedSession] = useState<CashDrawerSession | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const { sessions, loading, fetchSessions } = useCashDrawerSessions();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchSessions(statusFilter, (error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSessions(statusFilter, (error) => toast.error(error));
    setRefreshing(false);
  };

  if (!dict || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {dict.admin?.cashDrawer || 'Cash Drawer Sessions'}
              </h1>
              <p className="text-gray-600">{dict.admin?.cashDrawerSubtitle || 'Manage and monitor cash drawer operations'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-300 p-6">
          <div className="mb-4 flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">{dict.admin?.filterByStatus || 'Filter by Status'}</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              >
                <option value="">{dict.admin?.allSessions || 'All Sessions'}</option>
                <option value="open">{dict.admin?.openSessions || 'Open Sessions'}</option>
                <option value="closed">{dict.admin?.closedSessions || 'Closed Sessions'}</option>
              </select>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-brand text-white hover:bg-brand-hover disabled:bg-gray-400 border border-brand-hover flex items-center gap-2 transition-colors"
              title="Refresh cash drawer sessions"
            >
              <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.5a11 11 0 0120 0v-5m0 0a11 11 0 0120 5V9m-11 11a11 11 0 0120 0v5m0 0a11 11 0 01-20 0v-5m0 0a11 11 0 01-20 0" />
              </svg>
              {refreshing ? (dict.common?.loading || 'Loading...') : (dict.common?.refresh || 'Refresh')}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.user || 'User'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.openingTime || 'Opening Time'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.openingAmount || 'Opening Amount'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.closingTime || 'Closing Time'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.expectedAmount || 'Expected Amount'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.closingAmount || 'Closing Amount'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.difference || 'Difference'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sessions.map((session) => {
                  const userName = getUserName(session);
                  const difference = calculateDifference(session);
                  
                  return (
                    <tr key={session._id}>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{userName}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatSessionTime(session.openingTime)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        <Currency amount={session.openingAmount} />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {session.closingTime ? formatSessionTime(session.closingTime) : '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {session.expectedAmount !== undefined ? <Currency amount={session.expectedAmount} /> : '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {session.closingAmount !== undefined ? <Currency amount={session.closingAmount} /> : '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        {difference !== null ? (
                          <span className={difference >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {difference >= 0 ? '+' : ''}<Currency amount={Math.abs(difference)} />
                            {session.shortage && <div className="text-xs text-red-600">{dict.admin?.shortage || 'Shortage'}: <Currency amount={session.shortage} /></div>}
                            {session.overage && <div className="text-xs text-green-600">{dict.admin?.overage || 'Overage'}: <Currency amount={session.overage} /></div>}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold border ${getStatusBadgeClasses(session.status)}`}>
                          {getStatusLabel(session.status, dict)}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => setSelectedSession(session)}
                          className="text-brand hover:text-brand-navy-deep"
                        >
                          {dict.common?.view || 'View'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sessions.length === 0 && (
              <div className="text-center py-8 text-gray-500">{dict.common?.noResults || 'No cash drawer sessions found'}</div>
            )}
          </div>
        </div>

        {selectedSession && (
          <CashDrawerDetailModal
            session={selectedSession}
            onClose={() => setSelectedSession(null)}
            dict={dict}
          />
        )}
      </div>
    </div>
  );
}

function CashDrawerDetailModal({
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
  
  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {dict?.admin?.cashDrawerDetails || 'Cash Drawer Session Details'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">{dict?.admin?.user || 'User'}</label>
                <div className="text-lg">{userName}</div>
                {userEmail && <div className="text-sm text-gray-500">{userEmail}</div>}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">{dict?.admin?.status || 'Status'}</label>
                <div>
                  <span className={`px-2 py-1 text-xs font-semibold border ${getStatusBadgeClasses(session.status)}`}>
                    {getStatusLabel(session.status, dict)}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">{dict?.admin?.openingTime || 'Opening Time'}</label>
                <div className="text-lg">{formatSessionTime(session.openingTime)}</div>
              </div>
              {session.closingTime && (
                <div>
                  <label className="text-sm font-medium text-gray-500">{dict?.admin?.closingTime || 'Closing Time'}</label>
                  <div className="text-lg">{formatSessionTime(session.closingTime)}</div>
                </div>
              )}
            </div>
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{dict?.admin?.openingAmount || 'Opening Amount'}:</span>
                <span className="font-medium"><Currency amount={session.openingAmount} /></span>
              </div>
              {session.expectedAmount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">{dict?.admin?.expectedAmount || 'Expected Amount'}:</span>
                  <span className="font-medium"><Currency amount={session.expectedAmount} /></span>
                </div>
              )}
              {session.totalDiscounts !== undefined && session.totalDiscounts > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">{dict?.admin?.totalDiscounts || 'Total Discounts'}:</span>
                  <span className="font-semibold text-green-600">-<Currency amount={session.totalDiscounts} /></span>
                </div>
              )}
              {session.totalVAT !== undefined && session.totalVAT > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">{dict?.admin?.totalVat || 'Total VAT'}:</span>
                  <span className="font-medium"><Currency amount={session.totalVAT} /></span>
                </div>
              )}
              {session.closingAmount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">{dict?.admin?.closingAmount || 'Closing Amount'}:</span>
                  <span className="font-medium"><Currency amount={session.closingAmount} /></span>
                </div>
              )}
              {session.shortage !== undefined && session.shortage > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>{dict?.admin?.shortage || 'Shortage'}:</span>
                  <span className="font-medium"><Currency amount={session.shortage} /></span>
                </div>
              )}
              {session.overage !== undefined && session.overage > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>{dict?.admin?.overage || 'Overage'}:</span>
                  <span className="font-medium"><Currency amount={session.overage} /></span>
                </div>
              )}
              {session.closingAmount !== undefined && session.expectedAmount !== undefined && (
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>{dict?.admin?.difference || 'Difference'}:</span>
                  <span className={getDifferenceColor(calculateDifference(session))}>
                    {calculateDifference(session)! >= 0 ? '+' : ''}
                    <Currency amount={Math.abs(calculateDifference(session)!)} />
                  </span>
                </div>
              )}
            </div>
            {session.notes && (
              <div>
                <label className="text-sm font-medium text-gray-500 mb-1 block">{dict?.common?.notes || 'Notes'}</label>
                <div className="p-3 bg-gray-50 border border-gray-300">{session.notes}</div>
              </div>
            )}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-400"
            >
              {dict?.common?.close || 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

