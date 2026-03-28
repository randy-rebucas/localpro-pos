'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';

interface AuditLog {
  _id: string;
  tenantId: { slug: string; name: string } | null;
  userId: { name: string; email: string } | null;
  action: string;
  entityType: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const PAGE_SIZES = [25, 50, 100, 200];

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [tenantSlug, setTenantSlug] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tenantSlug) params.set('tenantSlug', tenantSlug);
      if (action) params.set('action', action);
      if (entityType) params.set('entityType', entityType);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await fetch(`/api/super-admin/logs?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
        setPagination(data.pagination);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, action, entityType, startDate, endDate, page, limit]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SuperAdminShell>
      <div className="p-6 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-1">Cross-tenant activity log</p>
        </div>

        {/* Filters */}
        <form onSubmit={handleFilter} className="bg-white border border-gray-200 border-b-0 px-4 py-3">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Tenant slug"
              value={tenantSlug}
              onChange={e => setTenantSlug(e.target.value)}
              className="px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white w-36"
            />
            <input
              type="text"
              placeholder="Action (e.g. create)"
              value={action}
              onChange={e => setAction(e.target.value)}
              className="px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white w-44"
            />
            <input
              type="text"
              placeholder="Entity type"
              value={entityType}
              onChange={e => setEntityType(e.target.value)}
              className="px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white w-36"
            />
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">From</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-2 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">To</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-2 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <select
              value={limit}
              onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
              className="px-2 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
            </select>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
              Search
            </button>
            <button
              type="button"
              onClick={() => { setTenantSlug(''); setAction(''); setEntityType(''); setStartDate(''); setEndDate(''); setPage(1); }}
              className="px-3 py-2 border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 bg-white"
            >
              Clear
            </button>
          </div>
        </form>

        <div className="bg-white border border-gray-200">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
              <p className="mt-3 text-gray-500 text-sm">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">No audit logs found.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Timestamp', 'Tenant', 'Action', 'Entity', 'User', 'IP', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {logs.map(log => (
                      <React.Fragment key={log._id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                          <td className="px-4 py-3">
                            {log.tenantId ? (
                              <div>
                                <p className="text-xs font-medium text-gray-900">{log.tenantId.name}</p>
                                <p className="text-xs text-gray-400 font-mono">{log.tenantId.slug}</p>
                              </div>
                            ) : <span className="text-xs text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 text-gray-700">{log.action}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            <span className="font-medium">{log.entityType}</span>
                            {log.entityId && <span className="text-gray-400 ml-1 font-mono text-xs">#{log.entityId.slice(-6)}</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {log.userId ? (
                              <div>
                                <p className="font-medium text-gray-700">{log.userId.name}</p>
                                <p className="text-gray-400">{log.userId.email}</p>
                              </div>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 font-mono">{log.ipAddress || '—'}</td>
                          <td className="px-4 py-3">
                            {log.changes && Object.keys(log.changes).length > 0 && (
                              <button
                                onClick={() => setExpandedId(expandedId === log._id ? null : log._id)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {expandedId === log._id ? 'Hide' : 'Changes'}
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandedId === log._id && (
                          <tr key={`${log._id}-expanded`}>
                            <td colSpan={7} className="px-4 py-3 bg-gray-50">
                              <pre className="text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap max-h-48">
                                {JSON.stringify(log.changes, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  {pagination.total.toLocaleString()} total logs — page {pagination.page} of {pagination.pages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 bg-white disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                    disabled={page >= pagination.pages}
                    className="px-3 py-1.5 border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 bg-white disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </SuperAdminShell>
  );
}
