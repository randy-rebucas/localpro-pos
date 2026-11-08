'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Download, ScrollText } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SlipPager from '@/components/ui/SlipPager';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  DARK_FIELD,
  DARK_KEY,
  DARK_LABEL,
  ICON,
  LedReadout,
  RegisterPage,
  Sheet,
  Strip,
  KEY,
} from '@/components/admin/register-ui';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuditLogs, type AuditLog } from '@/hooks/useAuditLogs';
import { useAuditFilters } from '@/hooks/useAuditFilters';
import { useAuditUsers } from '@/hooks/useAuditUsers';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDateTime } from '@/lib/formatting';
import { AUDIT_ACTION_CODES, actionTone, extractUserInfo, formatEntityId, hasDetails } from '@/lib/audit-helpers';

type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const PAGE_SIZE = 50;
const TH = 'whitespace-nowrap px-4 py-2 text-left font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60';
const TD = 'px-4 py-3 font-receipt text-sm';
/** Cells holding written words rather than printed codes. */
const TD_TEXT = 'px-4 py-3 text-sm';

/** The action code as the journal prints it. */
function ActionTag({ action }: { action: string }) {
  const tone = actionTone(action);
  const cls = tone === 'out' ? 'border-stamp/50 text-stamp' : tone === 'in' ? 'border-brand-hover/50 text-brand-hover' : 'border-ink/25 text-ink/70';
  return (
    <span className={`inline-block whitespace-nowrap border px-1.5 py-0.5 font-receipt text-[11px] uppercase ${cls}`}>
      {action}
    </span>
  );
}

function DetailBlock({ label, value }: { label: string; value: Record<string, unknown> }) {
  return (
    <div className="mt-4">
      <p className="font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/60">{label}</p>
      <pre className="mt-1 max-h-64 overflow-auto border border-dashed border-ink/30 bg-paper p-3 font-receipt text-xs leading-relaxed text-ink whitespace-pre-wrap break-all">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function AuditLogsPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const dateSettings = settings || getDefaultTenantSettings();
  const [dict, setDict] = useState<Dict>(null);
  const dictRef = useRef<Dict>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [entityDraft, setEntityDraft] = useState('');
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const { auditLogs, pagination, loading, fetch: fetchAuditLogs } = useAuditLogs();
  const { filters, handleFilterChange, resetFilters } = useAuditFilters();
  const { users, fetch: fetchUsers } = useAuditUsers();
  const { canAccess } = usePermissions();
  const canView = canAccess('audit_logs.view');
  const canExport = canAccess('audit_logs.export');
  // The user list comes from /api/users, which needs users.manage; without it the filter is left out.
  const canListUsers = canAccess('users.manage');

  useEffect(() => {
    getDictionaryClient(lang).then((d) => {
      dictRef.current = d;
      setDict(d);
    });
  }, [lang]);

  useEffect(() => {
    if (canView && canListUsers) fetchUsers();
  }, [canView, canListUsers, fetchUsers]);

  const dateRangeBad = !!filters.startDate && !!filters.endDate && filters.startDate > filters.endDate;

  useEffect(() => {
    if (!canView || dateRangeBad) return;
    fetchAuditLogs(
      { page: currentPage, limit: PAGE_SIZE, ...filters },
      () => toast.error(dictRef.current?.admin?.auditLogsLoadFailed || 'Could not load the audit log. Try again.'),
    ).finally(() => setLoadedOnce(true));
  }, [filters, currentPage, canView, dateRangeBad, fetchAuditLogs]);

  const setFilter = useCallback((key: keyof typeof filters, value: string) => {
    handleFilterChange(key, value);
    setCurrentPage(1);
  }, [handleFilterChange]);

  // Typing an entity type waits for a pause before asking the server again.
  useEffect(() => {
    const next = entityDraft.trim();
    if (next === filters.entityType) return;
    const id = setTimeout(() => setFilter('entityType', next), 400);
    return () => clearTimeout(id);
  }, [entityDraft, filters.entityType, setFilter]);

  const clearFilters = () => {
    resetFilters();
    setEntityDraft('');
    setCurrentPage(1);
  };

  const handleExport = (format: 'csv' | 'json') => {
    const urlParams = new URLSearchParams({ format });
    if (format === 'json') urlParams.set('download', 'true');
    // The export runs the same filters as this list, so it prints what is on screen (all pages).
    if (filters.action) urlParams.set('action', filters.action);
    if (filters.entityType?.trim()) urlParams.set('entityType', filters.entityType.trim());
    if (filters.userId) urlParams.set('userId', filters.userId);
    if (filters.startDate) urlParams.set('startDate', filters.startDate);
    if (filters.endDate) urlParams.set('endDate', filters.endDate);
    window.open(`/api/audit-logs/export?${urlParams}`, '_blank', 'noopener');
  };

  if (!dict || (canView && !loadedOnce)) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const a = dict.admin || {};
  const title = a.auditLogs || 'Audit Logs';

  if (!canView) {
    return (
      <RegisterPage tagNo="EJ" tag={settings?.companyName} title={title}>
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink">
            <h2 className="text-3xl">{a.accessRestricted || 'Access Restricted'}</h2>
            <p className="mt-2 text-sm">
              {a.accessRestrictedAuditLogs || "You don't have permission to view audit logs. Contact an admin or owner."}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </RegisterPage>
    );
  }

  const system = a.systemUser || 'System';
  const userName = (log: AuditLog) => extractUserInfo(log.userId)?.name || system;
  const filtered = !!(filters.action || filters.entityType || filters.userId || filters.startDate || filters.endDate || entityDraft);
  const selectedUser = selected ? extractUserInfo(selected.userId) : null;

  return (
    <RegisterPage
      tagNo="EJ"
      tag={settings?.companyName}
      title={title}
      subtitle={a.auditLogsSubtitle || 'View system activity and changes'}
      side={<LedReadout value={pagination.total} label={a.auditLogsTotalEntries || 'total log entries'} />}
    >
      {/* What to print */}
      <section aria-label={a.filters || 'Filters'} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor="audit-action" className={DARK_LABEL}>{a.action || 'Action'}</label>
          <select id="audit-action" value={filters.action} onChange={(e) => setFilter('action', e.target.value)} className={DARK_FIELD}>
            <option value="">{a.allActions || 'All Actions'}</option>
            {AUDIT_ACTION_CODES.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-entity" className={DARK_LABEL}>{a.entityType || 'Entity Type'}</label>
          <input
            id="audit-entity"
            type="text"
            value={entityDraft}
            onChange={(e) => setEntityDraft(e.target.value)}
            placeholder={a.entityTypePlaceholder || 'e.g. product, user'}
            className={`${DARK_FIELD} placeholder:text-ink/40`}
          />
        </div>
        {canListUsers && (
          <div>
            <label htmlFor="audit-user" className={DARK_LABEL}>{a.user || 'User'}</label>
            <select id="audit-user" value={filters.userId} onChange={(e) => setFilter('userId', e.target.value)} className={DARK_FIELD}>
              <option value="">{a.allUsers || 'All Users'}</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="audit-from" className={DARK_LABEL}>{a.startDate || 'Start Date'}</label>
          <input id="audit-from" type="date" value={filters.startDate} max={filters.endDate || undefined} onChange={(e) => setFilter('startDate', e.target.value)} className={DARK_FIELD} />
        </div>
        <div>
          <label htmlFor="audit-to" className={DARK_LABEL}>{a.endDate || 'End Date'}</label>
          <input id="audit-to" type="date" value={filters.endDate} min={filters.startDate || undefined} onChange={(e) => setFilter('endDate', e.target.value)} className={DARK_FIELD} />
        </div>
      </section>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {filtered && (
          <button type="button" onClick={clearFilters} className={DARK_KEY}>
            {a.clearFilters || 'Clear filters'}
          </button>
        )}
        {canExport && (
          <>
            <button type="button" onClick={() => handleExport('csv')} disabled={dateRangeBad} className={DARK_KEY}>
              <Download className={ICON} strokeWidth={1.75} aria-hidden />
              {a.exportCSV || 'Export CSV'}
            </button>
            <button type="button" onClick={() => handleExport('json')} disabled={dateRangeBad} className={DARK_KEY}>
              <Download className={ICON} strokeWidth={1.75} aria-hidden />
              {a.exportJSON || 'Export JSON'}
            </button>
            <p className="w-full font-receipt text-xs text-white/60 sm:w-auto sm:pl-2">
              {a.auditExportFilteredHint || 'Exports every entry that matches these filters, on all pages. With no dates, the last 30 days.'}
            </p>
          </>
        )}
      </div>

      {dateRangeBad && (
        <div className="mt-4">
          <Strip tone="error">{a.auditDateRangeBad || 'The start date is after the end date.'}</Strip>
        </div>
      )}

      {/* The journal, newest entry first */}
      <section className="mt-6" aria-busy={loading}>
        <div className={`bg-paper-white text-ink transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {auditLogs.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <ScrollText className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
              <p className="font-receipt text-sm text-ink/60">{a.noAuditLogs || 'No audit log entries found'}</p>
            </div>
          ) : (
            <>
              {/* Up to xl: one printed line per entry */}
              <ul className="divide-y divide-dashed divide-ink/20 xl:hidden">
                {auditLogs.map((log) => (
                  <li key={log._id}>
                    <button
                      type="button"
                      onClick={() => setSelected(log)}
                      className="block w-full px-4 py-3 text-left transition-colors hover:bg-paper"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <ActionTag action={log.action} />
                        <span className="font-receipt text-xs text-ink/60">{formatDateTime(log.createdAt, dateSettings)}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium">{userName(log)}</p>
                      <p className="mt-0.5 font-receipt text-xs text-ink/60">
                        {[log.entityType, formatEntityId(log.entityId), log.ipAddress].filter(Boolean).join(' · ')}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>

              {/* From xl: the full journal */}
              <div className="relative hidden overflow-x-auto xl:block" role="region" aria-label={title} tabIndex={0}>
                <table className="min-w-full">
                  <thead className="border-b border-dashed border-ink/30">
                    <tr>
                      <th scope="col" className={TH}>{a.timestamp || 'Timestamp'}</th>
                      <th scope="col" className={TH}>{a.user || 'User'}</th>
                      <th scope="col" className={TH}>{a.action || 'Action'}</th>
                      <th scope="col" className={TH}>{a.entityType || 'Entity Type'}</th>
                      <th scope="col" className={TH}>{a.entityId || 'Entity ID'}</th>
                      <th scope="col" className={TH}>{a.ipAddress || 'IP'}</th>
                      <th scope="col" className={TH}><span className="sr-only">{a.auditEntryDetails || 'Details'}</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashed divide-ink/20">
                    {auditLogs.map((log) => {
                      const info = extractUserInfo(log.userId);
                      return (
                        <tr key={log._id} className="align-top transition-colors hover:bg-paper">
                          <td className={`${TD} whitespace-nowrap text-ink/70`}>{formatDateTime(log.createdAt, dateSettings)}</td>
                          <td className={`${TD_TEXT} min-w-[10rem]`}>
                            <p className="font-medium">{info?.name || system}</p>
                            {info?.email && <p className="mt-0.5 font-receipt text-xs text-ink/60">{info.email}</p>}
                          </td>
                          <td className={TD}><ActionTag action={log.action} /></td>
                          <td className={`${TD} whitespace-nowrap`}>{log.entityType}</td>
                          <td className={`${TD} whitespace-nowrap text-ink/60`}>{formatEntityId(log.entityId) || '—'}</td>
                          <td className={`${TD} whitespace-nowrap text-ink/60`}>{log.ipAddress || '—'}</td>
                          <td className="px-2 py-1.5 text-right">
                            <button type="button" onClick={() => setSelected(log)} className={`${KEY} ml-auto min-h-[36px] px-3`}>
                              {a.auditOpenEntry || 'Open'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <SlipPager
            page={currentPage}
            totalPages={pagination.pages}
            onPageChange={setCurrentPage}
            label={a.page || 'Page'}
            previousLabel={dict.common?.previous || 'Previous'}
            nextLabel={dict.common?.next || 'Next'}
          />
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </section>

      {selected && (
        <Sheet
          title={a.auditEntryTitle || 'Journal entry'}
          subtitle={<ActionTag action={selected.action} />}
          onClose={() => setSelected(null)}
          closeLabel={dict.common?.close || 'Close'}
          wide
          footer={
            <button type="button" onClick={() => setSelected(null)} className={KEY}>
              {dict.common?.close || 'Close'}
            </button>
          }
        >
          <div className="font-receipt text-sm">
            <ReceiptRow label={a.timestamp || 'Timestamp'} value={formatDateTime(selected.createdAt, dateSettings)} />
            <ReceiptRow label={a.user || 'User'} value={selectedUser?.name || system} />
            <ReceiptRow label={a.entityType || 'Entity Type'} value={selected.entityType} />
            {selected.ipAddress && <ReceiptRow label={a.ipAddress || 'IP'} value={selected.ipAddress} />}
          </div>
          {(selectedUser?.email || selected.entityId) && (
            <dl className="mt-3 space-y-2 font-receipt text-xs">
              {selectedUser?.email && (
                <div><dt className="uppercase tracking-[0.08em] text-ink/60">{a.email || 'Email'}</dt><dd className="break-all">{selectedUser.email}</dd></div>
              )}
              {selected.entityId && (
                <div><dt className="uppercase tracking-[0.08em] text-ink/60">{a.entityId || 'Entity ID'}</dt><dd className="break-all">{selected.entityId}</dd></div>
              )}
            </dl>
          )}
          {selected.userAgent && (
            <p className="mt-3 break-all font-receipt text-xs text-ink/60">{selected.userAgent}</p>
          )}
          {hasDetails(selected.changes) && <DetailBlock label={a.auditChanges || 'Changes'} value={selected.changes} />}
          {hasDetails(selected.metadata) && <DetailBlock label={a.auditMetadata || 'Details'} value={selected.metadata} />}
          {!hasDetails(selected.changes) && !hasDetails(selected.metadata) && (
            <p className="mt-4 font-receipt text-xs text-ink/60">{a.auditNoDetails || 'No further details were recorded for this entry.'}</p>
          )}
        </Sheet>
      )}
    </RegisterPage>
  );
}
