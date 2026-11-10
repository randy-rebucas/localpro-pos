'use client';

import { useEffect, useState, useCallback } from 'react';
import { Download, ScrollText, Search, X } from 'lucide-react';
import { showToast } from '@/lib/toast';
import {
  DARK_FIELD, DARK_KEY, DARK_KEY_PRIMARY, DARK_LABEL, Empty, ICON, KEY_SM, PAGE_SIZE, Printing, SaPage, SaPager, Sheet, Slip, Tag,
  TABLE, TBODY, TD, TD_TEXT, TH, THEAD, TR,
} from '@/components/super-admin/ui';

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

const PAGE_SIZES = [PAGE_SIZE, 25, 50, 100];

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
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: PAGE_SIZE, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);

  const [tenantSlug, setTenantSlug] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);

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
    return dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const hasChanges = (log: AuditLog) => !!log.changes && Object.keys(log.changes).length > 0;
  const openLog = logs.find(l => l._id === expandedId) || null;

  return (
    <SaPage
      tagNo="10"
      tag="Journal roll"
      title="Audit logs"
      subtitle="Every recorded change across all stores, newest first."
      side={
        <button type="button" onClick={downloadCsv} disabled={csvLoading || loading} className={DARK_KEY}>
          <Download className={ICON} strokeWidth={1.75} aria-hidden />
          {csvLoading ? 'Exporting…' : 'CSV'}
        </button>
      }
    >
      {/* Filters */}
      <section aria-label="Filters" className="mt-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label htmlFor="lg-tenant" className={DARK_LABEL}>Tenant slug</label>
            <input id="lg-tenant" type="text" placeholder="store-slug" value={tenantSlug} onChange={e => setTenantSlug(e.target.value)} className={`${DARK_FIELD} placeholder:text-ink/40`} />
          </div>
          <div>
            <label htmlFor="lg-action" className={DARK_LABEL}>Action</label>
            <input id="lg-action" type="text" placeholder="e.g. create" value={action} onChange={e => setAction(e.target.value)} className={`${DARK_FIELD} placeholder:text-ink/40`} />
          </div>
          <div>
            <label htmlFor="lg-entity" className={DARK_LABEL}>Entity type</label>
            <input id="lg-entity" type="text" placeholder="e.g. product" value={entityType} onChange={e => setEntityType(e.target.value)} className={`${DARK_FIELD} placeholder:text-ink/40`} />
          </div>
          <div>
            <label htmlFor="lg-start" className={DARK_LABEL}>From</label>
            <input id="lg-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={DARK_FIELD} />
          </div>
          <div>
            <label htmlFor="lg-end" className={DARK_LABEL}>To</label>
            <input id="lg-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={DARK_FIELD} />
          </div>
          <div>
            <label htmlFor="lg-limit" className={DARK_LABEL}>Per page</label>
            <select id="lg-limit" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }} className={DARK_FIELD}>
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => { const { start, end } = applyPreset(p.days); setStartDate(start); setEndDate(end); setPage(1); }}
              className={DARK_KEY}
            >
              {p.label}
            </button>
          ))}
          <button type="button" onClick={clearFilters} className={DARK_KEY}>
            <X className={ICON} strokeWidth={1.75} aria-hidden />
            Clear
          </button>
          <button type="button" onClick={() => { setPage(1); fetchLogs(); }} className={`${DARK_KEY_PRIMARY} sm:ml-auto`}>
            <Search className={ICON} strokeWidth={1.75} aria-hidden />
            Search
          </button>
        </div>

      </section>

      {/* The journal */}
      <Slip className="mt-6" title="Entries">
        <div aria-busy={loading}>
          {loading ? (
            <Printing label="Loading…" />
          ) : logs.length === 0 ? (
            <Empty icon={<ScrollText className="h-8 w-8" strokeWidth={1.75} aria-hidden />}>No audit logs found.</Empty>
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
                    <p className="mt-1.5 text-sm font-medium">
                      {log.tenantId ? log.tenantId.name : '—'}
                      {log.tenantId && <span className="ml-2 font-receipt text-xs font-normal text-ink/60">{log.tenantId.slug}</span>}
                    </p>
                    <p className="mt-0.5 font-receipt text-xs text-ink/60">
                      {[
                        log.entityType + (log.entityId ? ` #${log.entityId.slice(-6)}` : ''),
                        log.userId ? `${log.userId.name} <${log.userId.email}>` : null,
                        log.ipAddress,
                      ].filter(Boolean).join(' · ')}
                    </p>
                    {hasChanges(log) && (
                      <button type="button" onClick={() => setExpandedId(log._id)} className={`${KEY_SM} mt-2`}>
                        Changes
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {/* From xl: the full journal */}
              <div className="hidden overflow-x-auto xl:block" role="region" aria-label="Audit log entries" tabIndex={0}>
                <table className={TABLE}>
                  <thead className={THEAD}>
                    <tr>
                      <th scope="col" className={TH}>Timestamp</th>
                      <th scope="col" className={TH}>Tenant</th>
                      <th scope="col" className={TH}>Action</th>
                      <th scope="col" className={TH}>Entity</th>
                      <th scope="col" className={TH}>User</th>
                      <th scope="col" className={TH}>IP</th>
                      <th scope="col" className={TH}><span className="sr-only">Changes</span></th>
                    </tr>
                  </thead>
                  <tbody className={TBODY}>
                    {logs.map(log => (
                      <tr key={log._id} className={TR}>
                        <td className={`${TD} whitespace-nowrap text-ink/70`}>{fmt(log.createdAt)}</td>
                        <td className={TD_TEXT}>
                          {log.tenantId ? (
                            <>
                              <p className="font-medium">{log.tenantId.name}</p>
                              <p className="mt-0.5 font-receipt text-xs text-ink/60">{log.tenantId.slug}</p>
                            </>
                          ) : <span className="text-ink/40">—</span>}
                        </td>
                        <td className={TD}><Tag tone="info">{log.action}</Tag></td>
                        <td className={`${TD} whitespace-nowrap`}>
                          {log.entityType}
                          {log.entityId && <span className="ml-1 text-ink/50">#{log.entityId.slice(-6)}</span>}
                        </td>
                        <td className={TD_TEXT}>
                          {log.userId ? (
                            <>
                              <p className="font-medium">{log.userId.name}</p>
                              <p className="mt-0.5 font-receipt text-xs text-ink/60">{log.userId.email}</p>
                            </>
                          ) : <span className="text-ink/40">—</span>}
                        </td>
                        <td className={`${TD} whitespace-nowrap text-ink/60`}>{log.ipAddress || '—'}</td>
                        <td className="px-2 py-1.5 text-right">
                          {hasChanges(log) && (
                            <button type="button" onClick={() => setExpandedId(log._id)} className={`${KEY_SM} ml-auto`}>
                              Changes
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

        <SaPager page={page} totalPages={pagination.pages} onPageChange={setPage} total={pagination.total} limit={pagination.limit} noun="entries" />
      </Slip>

      {openLog && openLog.changes && (
        <Sheet
          title="Changes"
          subtitle={<span className="font-receipt text-xs">{openLog.action} · {openLog.entityType}{openLog.entityId ? ` #${openLog.entityId.slice(-6)}` : ''} · {fmt(openLog.createdAt)}</span>}
          onClose={() => setExpandedId(null)}
          closeLabel="Close"
          wide
        >
          <dl className="divide-y divide-dashed divide-ink/20">
            {Object.entries(openLog.changes).map(([key, val]) => (
              <div key={key} className="py-2.5">
                <dt className="font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/60">{key}</dt>
                <dd className="mt-1 break-all font-receipt text-sm text-ink">
                  {typeof val === 'object' && val !== null ? (
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap border border-dashed border-ink/30 bg-paper p-3 text-xs leading-relaxed">
                      {JSON.stringify(val, null, 2)}
                    </pre>
                  ) : String(val)}
                </dd>
              </div>
            ))}
          </dl>
        </Sheet>
      )}
    </SaPage>
  );
}
