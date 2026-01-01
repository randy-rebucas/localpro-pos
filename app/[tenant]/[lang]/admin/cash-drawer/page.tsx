'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

interface CashDrawerSession {
  _id: string;
  userId: string | { _id: string; name: string; email: string };
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  shortage?: number;
  overage?: number;
  openingTime: string;
  closingTime?: string;
  status: 'open' | 'closed';
  notes?: string;
  createdAt: string;
}

export default function CashDrawerPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [sessions, setSessions] = useState<CashDrawerSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<CashDrawerSession | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { settings } = useTenantSettings();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchSessions();
  }, [lang, tenant, statusFilter]);

  const fetchSessions = async () => {
    try {
      let url = '/api/cash-drawer/sessions';
      if (statusFilter) url += `?status=${statusFilter}`;
      
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setSessions(data.data);
    } catch (error) {
      console.error('Error fetching cash drawer sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.cashDrawer || 'Cash Drawer Sessions'}
              </h1>
              <p className="text-gray-600">{dict.admin?.cashDrawerSubtitle || 'Manage and monitor cash drawer operations'}</p>
            </div>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin`)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
            >
              {dict.common?.back || 'Back'}
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-300 p-6">
          <div className="mb-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Sessions</option>
              <option value="open">Open Sessions</option>
              <option value="closed">Closed Sessions</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Opening Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Opening Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Closing Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expected Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Closing Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Difference</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sessions.map((session) => {
                  const userName = typeof session.userId === 'object' ? session.userId.name : 'Unknown';
                  const difference = session.closingAmount !== undefined && session.expectedAmount !== undefined
                    ? session.closingAmount - session.expectedAmount
                    : null;
                  
                  return (
                    <tr key={session._id}>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{userName}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(session.openingTime).toLocaleString()}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        <Currency amount={session.openingAmount} />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {session.closingTime ? new Date(session.closingTime).toLocaleString() : '-'}
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
                            {session.shortage && <div className="text-xs text-red-600">Shortage: <Currency amount={session.shortage} /></div>}
                            {session.overage && <div className="text-xs text-green-600">Overage: <Currency amount={session.overage} /></div>}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold border ${
                          session.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => setSelectedSession(session)}
                          className="text-blue-600 hover:text-blue-900"
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
  dict: any;
}) {
  const userName = typeof session.userId === 'object' ? session.userId.name : 'Unknown';
  const userEmail = typeof session.userId === 'object' ? session.userId.email : '';
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {dict.admin?.cashDrawerDetails || 'Cash Drawer Session Details'}
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
                <label className="text-sm font-medium text-gray-500">User</label>
                <div className="text-lg">{userName}</div>
                {userEmail && <div className="text-sm text-gray-500">{userEmail}</div>}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Status</label>
                <div>
                  <span className={`px-2 py-1 text-xs font-semibold border ${
                    session.status === 'open' ? 'bg-green-100 text-green-800 border-green-300' : 'bg-gray-100 text-gray-800 border-gray-300'
                  }`}>
                    {session.status}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Opening Time</label>
                <div className="text-lg">{new Date(session.openingTime).toLocaleString()}</div>
              </div>
              {session.closingTime && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Closing Time</label>
                  <div className="text-lg">{new Date(session.closingTime).toLocaleString()}</div>
                </div>
              )}
            </div>
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Opening Amount:</span>
                <span className="font-medium"><Currency amount={session.openingAmount} /></span>
              </div>
              {session.expectedAmount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Expected Amount:</span>
                  <span className="font-medium"><Currency amount={session.expectedAmount} /></span>
                </div>
              )}
              {session.closingAmount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Closing Amount:</span>
                  <span className="font-medium"><Currency amount={session.closingAmount} /></span>
                </div>
              )}
              {session.shortage !== undefined && session.shortage > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Shortage:</span>
                  <span className="font-medium"><Currency amount={session.shortage} /></span>
                </div>
              )}
              {session.overage !== undefined && session.overage > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Overage:</span>
                  <span className="font-medium"><Currency amount={session.overage} /></span>
                </div>
              )}
              {session.closingAmount !== undefined && session.expectedAmount !== undefined && (
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Difference:</span>
                  <span className={session.closingAmount >= session.expectedAmount ? 'text-green-600' : 'text-red-600'}>
                    {session.closingAmount >= session.expectedAmount ? '+' : ''}
                    <Currency amount={Math.abs(session.closingAmount - session.expectedAmount)} />
                  </span>
                </div>
              )}
            </div>
            {session.notes && (
              <div>
                <label className="text-sm font-medium text-gray-500 mb-1 block">Notes</label>
                <div className="p-3 bg-gray-50 border border-gray-300">{session.notes}</div>
              </div>
            )}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-400"
            >
              {dict.common?.close || 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

