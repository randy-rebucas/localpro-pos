'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';
import { showToast } from '@/lib/toast';

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

interface Pagination { page: number; limit: number; total: number; pages: number; }

const PAGE_SIZES = [25, 50, 100, 200];

const PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Last 7d', days: 7 },
  { label: 'Last 30d', days: 30 },
];

function applyPreset(days: number) {
  const end = new Date().toISOString().slice(0, 10);
  const start = days === 0
    ? end
    : (() => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); })();
  return { start, end };
}

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);

  const [tenantSlug, setTenantSlug] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const buildParams = useCallback((extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    if (tenantSlug) p.set('tenantSlug', tenantSlug);
    if (action) p.set('action', action);
    if (entityType) p.set('entityType', entityType);
    if (startDate) p.set('startDate', startDate);
    if (endDate) p.set('endDate', endDate);
    p.set('page', String(page));
    p.set('limit', String(limit));
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p;
  }, [tenantSlug, action, entityType, startDate, endDate, page, limit]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-admin/logs?${buildParams()}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) { setLogs(data.data); setPagination(data.pagination); }
      else { showToast.error(data.error || 'Failed to load audit logs'); setLogs([]); }
    } catch {
      showToast.error('Failed to load audit logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const downloadCsv = async () => {
    setCsvLoading(true);
    try {
      const res = await fetch(`/api/super-admin/logs?${buildParams({ format: 'csv' })}`, { credentials: 'include' });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setCsvLoading(false);
    }
  };

  const clearFilters = () => {
    setTenantSlug(''); setAction(''); setEntityType('');
    setStartDate(''); setEndDate(''); setPage(1);
  };

  const fmt = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SuperAdminShell title="Audit Logs">
      <div className="space-y-4">
        {/* Filters */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap gap-3">
            <input type="text" placeholder="Tenant slug" value={tenantSlug} onChange={e => setTenantSlug(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-36" />
            <input type="text" placeholder="Action (e.g. create)" value={action} onChange={e => setAction(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-44" />
            <input type="text" placeholder="Entity type" value={entityType} onChange={e => setEntityType(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-36" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => { const { start, end } = applyPreset(p.days); setStartDate(start); setEndDate(end); setPage(1); }}
                className="px-3 py-1 text-xs border rounded-lg text-gray-600 hover:bg-gray-50">
                {p.label}
              </button>
            ))}
            <button onClick={clearFilters} className="px-3 py-1 text-xs border rounded-lg text-gray-400 hover:bg-gray-50">Clear</button>
            <div className="ml-auto flex gap-2">
              <button onClick={() => { setPage(1); fetchLogs(); }}
                className="px-4 py-1.5 bg-brand-teal text-white rounded-lg text-sm font-medium hover:bg-brand-teal/90">
                Search
              </button>
              <button onClick={downloadCsv} disabled={csvLoading || loading}
                className="px-4 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                {csvLoading ? 'Exporting…' : '↓ CSV'}
              </button>
            </div>
          </div>
          {pagination.total > 0 && (
            <p className="text-xs text-gray-400">{pagination.total.toLocaleString()} total records</p>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No audit logs found.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  {['Timestamp', 'Tenant', 'Action', 'Entity', 'User', 'IP', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(log => (
                  <React.Fragment key={log._id}>
                    <tr className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(log.createdAt)}</td>
                      <td className="px-4 py-3">
                        {log.tenantId ? (
                          <>
                            <p className="text-xs font-medium text-gray-900">{log.tenantId.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{log.tenantId.slug}</p>
                          </>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{log.action}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        <span className="font-medium">{log.entityType}</span>
                        {log.entityId && <span className="text-gray-400 ml-1 font-mono">#{log.entityId.slice(-6)}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {log.userId ? (
                          <>
                            <p className="font-medium text-gray-700">{log.userId.name}</p>
                            <p className="text-gray-400">{log.userId.email}</p>
                          </>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 font-mono">{log.ipAddress || '—'}</td>
                      <td className="px-4 py-3">
                        {log.changes && Object.keys(log.changes).length > 0 && (
                          <button onClick={() => setExpandedId(expandedId === log._id ? null : log._id)}
                            className="text-xs text-brand-teal hover:underline">
                            {expandedId === log._id ? 'Hide' : 'Changes'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === log._id && (
                      <tr>
                        <td colSpan={7} className="px-4 py-3 bg-gray-50">
                          <div className="text-xs font-semibold text-gray-500 mb-1">Changes</div>
                          <div className="bg-white border border-gray-100 rounded-lg p-3 overflow-x-auto max-h-60">
                            <table className="text-xs w-full">
                              <tbody>
                                {Object.entries(log.changes!).map(([key, val]) => (
                                  <tr key={key} className="border-b border-gray-50 last:border-0">
                                    <td className="py-1 pr-4 font-mono font-medium text-gray-600 whitespace-nowrap align-top">{key}</td>
                                    <td className="py-1 text-gray-700 font-mono break-all">
                                      {typeof val === 'object' && val !== null
                                        ? <pre className="whitespace-pre-wrap">{JSON.stringify(val, null, 2)}</pre>
                                        : String(val)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="border-t px-4 py-3 flex items-center justify-between text-sm text-gray-500">
              <span>Page {pagination.page} of {pagination.pages}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
                <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SuperAdminShell>
  );
}
