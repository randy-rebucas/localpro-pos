'use client';

import { useEffect, useState, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';

interface AdminLog {
  _id: string;
  adminUserId: { _id: string; name: string; email: string } | null;
  action: string;
  targetType?: string;
  targetId?: string;
  description?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

const PRESETS = [
  { label: 'Today', start: () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }, end: () => new Date().toISOString().slice(0,10) },
  { label: 'Last 7d', start: () => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString().slice(0,10); }, end: () => new Date().toISOString().slice(0,10) },
  { label: 'Last 30d', start: () => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10); }, end: () => new Date().toISOString().slice(0,10) },
];

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const [filters, setFilters] = useState({
    action: '',
    targetType: '',
    startDate: '',
    endDate: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (filters.action) params.set('action', filters.action);
      if (filters.targetType) params.set('targetType', filters.targetType);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      const res = await fetch(`/api/super-admin/admin-logs?${params}`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
        setTotal(json.pagination.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  function applyPreset(p: typeof PRESETS[0]) {
    setFilters(f => ({ ...f, startDate: p.start(), endDate: p.end() }));
    setPage(1);
  }

  const pages = Math.ceil(total / LIMIT);

  return (
    <SuperAdminShell title="Admin Action Log">
      <div className="space-y-4">
        {/* Filters */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <input
              className="border rounded-lg px-3 py-2 text-sm"
              placeholder="Filter by action…"
              value={filters.action}
              onChange={(e) => { setFilters(f => ({ ...f, action: e.target.value })); setPage(1); }}
            />
            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={filters.targetType}
              onChange={(e) => { setFilters(f => ({ ...f, targetType: e.target.value })); setPage(1); }}
            >
              <option value="">All target types</option>
              {['Tenant', 'Subscription', 'User', 'Coupon', 'Plan'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={filters.startDate}
              onChange={(e) => { setFilters(f => ({ ...f, startDate: e.target.value })); setPage(1); }} />
            <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={filters.endDate}
              onChange={(e) => { setFilters(f => ({ ...f, endDate: e.target.value })); setPage(1); }} />
          </div>
          <div className="flex gap-2">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className="px-3 py-1 text-xs border rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                {p.label}
              </button>
            ))}
            <button onClick={() => { setFilters({ action: '', targetType: '', startDate: '', endDate: '' }); setPage(1); }}
              className="px-3 py-1 text-xs border rounded-lg text-gray-400 hover:bg-gray-50 transition-colors">
              Clear
            </button>
            <span className="ml-auto text-xs text-gray-400 self-center">{total.toLocaleString()} records</span>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No admin actions found.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  {['Timestamp', 'Admin', 'Action', 'Target', 'Description', 'IP', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log) => (
                  <>
                    <tr key={log._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {log.adminUserId ? (
                          <div>
                            <div className="font-medium text-gray-900 text-xs">{log.adminUserId.name}</div>
                            <div className="text-gray-400 text-xs">{log.adminUserId.email}</div>
                          </div>
                        ) : <span className="text-gray-400 text-xs">System</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">{log.action}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {log.targetType && <span className="font-medium">{log.targetType}</span>}
                        {log.targetId && <div className="text-gray-400 font-mono truncate max-w-[100px]">{log.targetId}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate">{log.description || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 font-mono">{log.ipAddress || '—'}</td>
                      <td className="px-4 py-3">
                        {log.changes && (
                          <button
                            onClick={() => setExpanded(expanded === log._id ? null : log._id)}
                            className="text-xs text-blue-500 hover:underline"
                          >
                            {expanded === log._id ? 'Hide' : 'Details'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === log._id && log.changes && (
                      <tr key={`${log._id}-exp`} className="bg-gray-50">
                        <td colSpan={7} className="px-4 py-3">
                          <pre className="text-xs text-gray-700 bg-white rounded-lg p-3 border border-gray-100 overflow-x-auto max-h-48">
                            {JSON.stringify(log.changes, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex justify-center gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
            <span className="px-3 py-1.5 text-sm text-gray-600">Page {page} of {pages}</span>
            <button disabled={page === pages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
          </div>
        )}
      </div>
    </SuperAdminShell>
  );
}
