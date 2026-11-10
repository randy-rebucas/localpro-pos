'use client';

import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import {
  DARK_FIELD, DARK_KEY, DARK_LABEL, Empty, ICON, KEY_SM, PAGE_SIZE, Printing, SaPage, SaPager, Sheet, Slip, Tag,
  TABLE, TBODY, TD, TD_TEXT, TH, THEAD, TR,
} from '@/components/super-admin/ui';

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

  const [filters, setFilters] = useState({
    action: '',
    targetType: '',
    startDate: '',
    endDate: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
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

  const pages = Math.ceil(total / PAGE_SIZE);

  const fmt = (d: string) => new Date(d).toLocaleString(undefined, { hour12: true });
  const openLog = logs.find(l => l._id === expanded) || null;

  return (
    <SaPage
      tagNo="11"
      tag="Head office roll"
      title="Admin actions"
      subtitle="What super admins changed, who did it and when."
    >
      {/* Filters */}
      <section aria-label="Filters" className="mt-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="al-action" className={DARK_LABEL}>Action</label>
            <input
              id="al-action"
              className={`${DARK_FIELD} placeholder:text-ink/40`}
              placeholder="Filter by action…"
              value={filters.action}
              onChange={(e) => { setFilters(f => ({ ...f, action: e.target.value })); setPage(1); }}
            />
          </div>
          <div>
            <label htmlFor="al-target" className={DARK_LABEL}>Target type</label>
            <select
              id="al-target"
              className={DARK_FIELD}
              value={filters.targetType}
              onChange={(e) => { setFilters(f => ({ ...f, targetType: e.target.value })); setPage(1); }}
            >
              <option value="">All target types</option>
              {['Tenant', 'Subscription', 'User', 'Coupon', 'Plan'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="al-start" className={DARK_LABEL}>From</label>
            <input id="al-start" type="date" className={DARK_FIELD} value={filters.startDate}
              onChange={(e) => { setFilters(f => ({ ...f, startDate: e.target.value })); setPage(1); }} />
          </div>
          <div>
            <label htmlFor="al-end" className={DARK_LABEL}>To</label>
            <input id="al-end" type="date" className={DARK_FIELD} value={filters.endDate}
              onChange={(e) => { setFilters(f => ({ ...f, endDate: e.target.value })); setPage(1); }} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <button key={p.label} type="button" onClick={() => applyPreset(p)} className={DARK_KEY}>
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setFilters({ action: '', targetType: '', startDate: '', endDate: '' }); setPage(1); }}
            className={DARK_KEY}
          >
            <X className={ICON} strokeWidth={1.75} aria-hidden />
            Clear
          </button>
        </div>
      </section>

      {/* The roll */}
      <Slip className="mt-6" title="Entries">
        <div aria-busy={loading}>
          {loading ? (
            <Printing label="Loading…" />
          ) : logs.length === 0 ? (
            <Empty icon={<ShieldCheck className="h-8 w-8" strokeWidth={1.75} aria-hidden />}>No admin actions found.</Empty>
          ) : (
            <>
              {/* Up to xl: one printed line per entry */}
              <ul className="divide-y divide-dashed divide-ink/20 xl:hidden">
                {logs.map(log => (
                  <li key={log._id} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Tag tone="info">{log.action}</Tag>
                      <span className="font-receipt text-xs text-ink/60">{fmt(log.createdAt)}</span>
                    </div>
                    {log.description && <p className="mt-1.5 text-sm">{log.description}</p>}
                    <p className="mt-0.5 font-receipt text-xs text-ink/60">
                      {[
                        log.adminUserId ? `${log.adminUserId.name} <${log.adminUserId.email}>` : 'System',
                        [log.targetType, log.targetId].filter(Boolean).join(' '),
                        log.ipAddress,
                      ].filter(Boolean).join(' · ')}
                    </p>
                    {log.changes && (
                      <button type="button" onClick={() => setExpanded(log._id)} className={`${KEY_SM} mt-2`}>
                        Details
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {/* From xl: the full roll */}
              <div className="hidden overflow-x-auto xl:block" role="region" aria-label="Admin action entries" tabIndex={0}>
                <table className={TABLE}>
                  <thead className={THEAD}>
                    <tr>
                      <th scope="col" className={TH}>Timestamp</th>
                      <th scope="col" className={TH}>Admin</th>
                      <th scope="col" className={TH}>Action</th>
                      <th scope="col" className={TH}>Target</th>
                      <th scope="col" className={TH}>Description</th>
                      <th scope="col" className={TH}>IP</th>
                      <th scope="col" className={TH}><span className="sr-only">Details</span></th>
                    </tr>
                  </thead>
                  <tbody className={TBODY}>
                    {logs.map(log => (
                      <tr key={log._id} className={TR}>
                        <td className={`${TD} whitespace-nowrap text-ink/70`}>{fmt(log.createdAt)}</td>
                        <td className={TD_TEXT}>
                          {log.adminUserId ? (
                            <>
                              <p className="font-medium">{log.adminUserId.name}</p>
                              <p className="mt-0.5 font-receipt text-xs text-ink/60">{log.adminUserId.email}</p>
                            </>
                          ) : <span className="text-ink/50">System</span>}
                        </td>
                        <td className={TD}><Tag tone="info">{log.action}</Tag></td>
                        <td className={TD}>
                          {log.targetType && <p>{log.targetType}</p>}
                          {log.targetId && <p className="max-w-[120px] truncate text-xs text-ink/50" title={log.targetId}>{log.targetId}</p>}
                        </td>
                        <td className={`${TD_TEXT} max-w-[260px]`}>
                          <p className="truncate" title={log.description || undefined}>{log.description || '—'}</p>
                        </td>
                        <td className={`${TD} whitespace-nowrap text-ink/60`}>{log.ipAddress || '—'}</td>
                        <td className="px-2 py-1.5 text-right">
                          {log.changes && (
                            <button type="button" onClick={() => setExpanded(log._id)} className={`${KEY_SM} ml-auto`}>
                              Details
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <SaPager page={page} totalPages={pages} onPageChange={setPage} total={total} limit={PAGE_SIZE} noun="actions" />
      </Slip>

      {openLog && openLog.changes && (
        <Sheet
          title="Details"
          subtitle={<span className="font-receipt text-xs">{openLog.action}{openLog.targetType ? ` · ${openLog.targetType}` : ''} · {fmt(openLog.createdAt)}</span>}
          onClose={() => setExpanded(null)}
          closeLabel="Close"
          wide
        >
          {openLog.description && <p className="mb-3 text-sm">{openLog.description}</p>}
          <p className="font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/60">Changes</p>
          <pre className="mt-1 max-h-[60dvh] overflow-auto whitespace-pre-wrap break-all border border-dashed border-ink/30 bg-paper p-3 font-receipt text-xs leading-relaxed text-ink">
            {JSON.stringify(openLog.changes, null, 2)}
          </pre>
        </Sheet>
      )}
    </SaPage>
  );
}
