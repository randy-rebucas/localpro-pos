'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';

interface AuditLog {
  _id: string;
  tenantId: string;
  userId?: {
    _id: string;
    name: string;
    email: string;
  } | string;
  action: string;
  entityType: string;
  entityId?: string;
  changes?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

interface User {
  _id: string;
  name: string;
}

export default function AuditLogsPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [auditFilters, setAuditFilters] = useState({
    action: '',
    entityType: '',
    userId: '',
    startDate: '',
    endDate: '',
  });
  const [auditPagination, setAuditPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0,
  });

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchUsers();
    fetchAuditLogs();
  }, [lang, tenant]);

  useEffect(() => {
    fetchAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditFilters.action, auditFilters.entityType, auditFilters.userId, auditFilters.startDate, auditFilters.endDate, auditPagination.page]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({
        page: auditPagination.page.toString(),
        limit: auditPagination.limit.toString(),
      });

      if (auditFilters.action) params.append('action', auditFilters.action);
      if (auditFilters.entityType) params.append('entityType', auditFilters.entityType);
      if (auditFilters.userId) params.append('userId', auditFilters.userId);
      if (auditFilters.startDate) params.append('startDate', auditFilters.startDate);
      if (auditFilters.endDate) params.append('endDate', auditFilters.endDate);

      const res = await fetch(`/api/audit-logs?${params.toString()}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.data);
        setAuditPagination(data.pagination);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to fetch audit logs' });
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      setMessage({ type: 'error', text: 'Failed to fetch audit logs' });
    } finally {
      setAuditLoading(false);
    }
  };

  const handleAuditFilterChange = (key: string, value: string) => {
    setAuditFilters({ ...auditFilters, [key]: value });
    setAuditPagination({ ...auditPagination, page: 1 });
  };

  const handleAuditPageChange = (newPage: number) => {
    setAuditPagination({ ...auditPagination, page: newPage });
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
                {dict.admin?.auditLogs || 'Audit Logs'}
              </h1>
              <p className="text-gray-600">{dict.admin?.auditLogsSubtitle || 'View system activity and changes'}</p>
            </div>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin`)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
            >
              {dict.common?.back || 'Back'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{dict.admin?.auditLogs || 'Audit Logs'}</h2>
            
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4 p-4 bg-gray-50 border border-gray-300">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.action || 'Action'}
                </label>
                <select
                  value={auditFilters.action}
                  onChange={(e) => handleAuditFilterChange('action', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="">All Actions</option>
                  <option value="create">Create</option>
                  <option value="update">Update</option>
                  <option value="delete">Delete</option>
                  <option value="view">View</option>
                  <option value="login">Login</option>
                  <option value="logout">Logout</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.entityType || 'Entity Type'}
                </label>
                <input
                  type="text"
                  value={auditFilters.entityType}
                  onChange={(e) => handleAuditFilterChange('entityType', e.target.value)}
                  placeholder="e.g., user, product"
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.user || 'User'}
                </label>
                <select
                  value={auditFilters.userId}
                  onChange={(e) => handleAuditFilterChange('userId', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="">All Users</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.startDate || 'Start Date'}
                </label>
                <input
                  type="date"
                  value={auditFilters.startDate}
                  onChange={(e) => handleAuditFilterChange('startDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.endDate || 'End Date'}
                </label>
                <input
                  type="date"
                  value={auditFilters.endDate}
                  onChange={(e) => handleAuditFilterChange('endDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                />
              </div>
            </div>

            {/* Audit Logs Table */}
            {auditLoading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-gray-600">{dict.common?.loading || 'Loading...'}</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          {dict.admin?.timestamp || 'Timestamp'}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          {dict.admin?.user || 'User'}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          {dict.admin?.action || 'Action'}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          {dict.admin?.entityType || 'Entity Type'}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          {dict.admin?.entityId || 'Entity ID'}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          IP Address
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {auditLogs.map((log) => {
                        const userName = typeof log.userId === 'object' && log.userId !== null
                          ? log.userId.name
                          : 'System';
                        const userEmail = typeof log.userId === 'object' && log.userId !== null
                          ? log.userId.email
                          : '';
                        return (
                          <tr key={log._id} className="hover:bg-gray-50">
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              {new Date(log.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              <div>
                                <div className="font-medium">{userName}</div>
                                {userEmail && (
                                  <div className="text-xs text-gray-500">{userEmail}</div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className="px-2 py-1 text-xs font-semibold border border-blue-300 bg-blue-100 text-blue-800">
                                {log.action}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              {log.entityType}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                              {log.entityId || '-'}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                              {log.ipAddress || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {auditLogs.length === 0 && !auditLoading && (
                  <div className="text-center py-8 text-gray-500">
                    {dict.common?.noResults || 'No audit logs found'}
                  </div>
                )}

                {/* Pagination */}
                {auditPagination.pages > 1 && (
                  <div className="mt-6 flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      {dict.admin?.showing || 'Showing'} {(auditPagination.page - 1) * auditPagination.limit + 1} {dict.admin?.to || 'to'}{' '}
                      {Math.min(auditPagination.page * auditPagination.limit, auditPagination.total)} {dict.admin?.of || 'of'}{' '}
                      {auditPagination.total} {dict.admin?.results || 'results'}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAuditPageChange(auditPagination.page - 1)}
                        disabled={auditPagination.page === 1}
                        className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white"
                      >
                        {dict.common?.previous || 'Previous'}
                      </button>
                      <button
                        onClick={() => handleAuditPageChange(auditPagination.page + 1)}
                        disabled={auditPagination.page >= auditPagination.pages}
                        className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white"
                      >
                        {dict.common?.next || 'Next'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

