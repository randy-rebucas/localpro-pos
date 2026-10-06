'use client';

import React, { useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useAuditLogs } from '@/hooks/useAuditLogs';
import { useAuditFilters } from '@/hooks/useAuditFilters';
import { useAuditUsers } from '@/hooks/useAuditUsers';
import {
  getActionOptions,
  extractUserInfo,
  formatAuditTimestamp,
  formatEntityId,
  formatIpAddress,
  canGoToPreviousPage,
  canGoToNextPage,
  isAuditLogEmpty,
  shouldShowPagination,
} from '@/lib/audit-helpers';
import { usePermissions } from '@/hooks/usePermissions';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import toast from 'react-hot-toast';

const PAGE_SIZE = 50;
const COLS = 7;

const ACTION_BADGE: Record<string, string> = {
  create: 'bg-win8-success text-white',
  update: 'bg-brand text-white',
  delete: 'bg-win8-danger text-white',
  view: 'bg-gray-500 text-white',
  login: 'bg-win8-info text-white',
  logout: 'bg-win8-accent text-white',
};

const PRESETS = [
  { key: 'presetToday', fallback: 'Today', days: 0 },
  { key: 'presetLast7d', fallback: 'Last 7d', days: 7 },
  { key: 'presetLast30d', fallback: 'Last 30d', days: 30 },
];

function presetRange(days: number) {
  const end = new Date().toISOString().slice(0, 10);
  const d = new Date();
  d.setDate(d.getDate() - days);
  return { start: days === 0 ? end : d.toISOString().slice(0, 10), end };
}

export default function AuditLogsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = React.useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [currentPage, setCurrentPage] = React.useState(1);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const { auditLogs, pagination, loading: auditLoading, error: auditError, fetch: fetchAuditLogs } = useAuditLogs();
  const { filters, handleFilterChange, resetFilters } = useAuditFilters();
  const { users, loading: usersLoading, fetch: fetchUsers } = useAuditUsers();
  const { canAccess } = usePermissions();
  const canView = canAccess('audit_logs.view');
  const canExport = canAccess('audit_logs.export');
  const hasFilters = Object.values(filters).some(Boolean);

  // Load dictionary
  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Load users on mount
  useEffect(() => {
    if (tenant) {
      fetchUsers((error) => {
        toast.error(error);
      });
    }
  }, [tenant, fetchUsers]);

  const loadLogs = useCallback(() => {
    fetchAuditLogs(
      {
        page: currentPage,
        limit: PAGE_SIZE,
        action: filters.action,
        entityType: filters.entityType,
        userId: filters.userId,
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      (error) => {
        toast.error(error);
      }
    );
  }, [filters, currentPage, fetchAuditLogs]);

  // Fetch audit logs when filters or pagination changes
  useEffect(() => {
    if (dict && tenant) loadLogs();
  }, [dict, tenant, loadLogs]);

  const handleFilterChangeWrapper = useCallback((key: string, value: string) => {
    handleFilterChange(key as any, value); // eslint-disable-line @typescript-eslint/no-explicit-any
    setCurrentPage(1); // Reset to first page when filters change
  }, [handleFilterChange]);

  const applyPreset = useCallback((days: number) => {
    const { start, end } = presetRange(days);
    handleFilterChange('startDate', start);
    handleFilterChange('endDate', end);
    setCurrentPage(1);
  }, [handleFilterChange]);

  const clearFilters = useCallback(() => {
    resetFilters();
    setCurrentPage(1);
  }, [resetFilters]);

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
  }, []);

  const handleExport = useCallback((format: 'csv' | 'json') => {
    const urlParams = new URLSearchParams({
      format,
      ...(format === 'json' && { download: 'true' }),
      ...(filters.startDate && { startDate: filters.startDate }),
      ...(filters.endDate && { endDate: filters.endDate }),
    });
    window.open(`/api/audit-logs/export?${urlParams}`, '_blank');
  }, [filters.startDate, filters.endDate]);

  if (!dict || usersLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
        <p className="mt-3 text-sm text-gray-400">{dict?.common?.loading || 'Loading…'}</p>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="p-4 bg-white border border-win8-danger">
          <h2 className="text-base font-bold text-win8-danger mb-1">{dict?.admin?.accessRestricted || 'Access Restricted'}</h2>
          <p className="text-sm text-gray-700">
            {dict?.admin?.accessRestrictedAuditLogs || "You don't have permission to view audit logs. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  const rangeStart = (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, pagination.total);

  const renderLogs = () => {
    if (auditLoading) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingAuditLogs || 'Loading audit logs…'}</p>
        </div>
      );
    }

    if (auditError) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{auditError}</p>
          <button
            onClick={loadLogs}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (isAuditLogEmpty(auditLogs)) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {hasFilters
            ? (dict.admin?.noAuditLogsMatch || 'No audit logs match your filters.')
            : (dict.admin?.noAuditLogsYet || 'No audit logs yet.')}
        </div>
      );
    }

    const headers = [
      dict.admin?.timestamp || 'Timestamp',
      dict.admin?.user || 'User',
      dict.admin?.action || 'Action',
      dict.admin?.entityType || 'Entity Type',
      dict.admin?.entityId || 'Entity ID',
      dict.admin?.ipAddress || 'IP Address',
    ];

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
              ))}
              <th className="px-4 py-3">
                <span className="sr-only">{dict.admin?.auditChanges || 'Changes'}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {auditLogs.map((log) => {
              const { name: userName, email: userEmail } = extractUserInfo(log.user);
              const hasChanges = !!log.changes && Object.keys(log.changes).length > 0;
              const expanded = expandedId === log._id;
              return (
                <React.Fragment key={log._id}>
                  <tr className="hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                      {formatAuditTimestamp(log.createdAt, lang)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-gray-900">{userName}</p>
                      {userEmail && <p className="text-xs text-gray-400">{userEmail}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs font-semibold capitalize ${ACTION_BADGE[log.action.toLowerCase()] || 'bg-gray-500 text-white'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{log.entityType}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-500" title={log.entityId}>
                      {formatEntityId(log.entityId)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-500">
                      {formatIpAddress(log.ipAddress)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {hasChanges && (
                        <button
                          onClick={() => setExpandedId(expanded ? null : log._id)}
                          aria-expanded={expanded}
                          title={expanded ? (dict.admin?.hideAuditChanges || 'Hide') : (dict.admin?.auditChanges || 'Changes')}
                          aria-label={expanded ? (dict.admin?.hideAuditChanges || 'Hide') : (dict.admin?.auditChanges || 'Changes')}
                          className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d={expanded ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded && hasChanges && (
                    <tr>
                      <td colSpan={COLS} className="px-4 py-3 bg-gray-100">
                        <div className="text-xs font-semibold text-gray-500 mb-1">{dict.admin?.auditChanges || 'Changes'}</div>
                        <div className="bg-white border border-gray-300 p-3 overflow-x-auto max-h-60">
                          <table className="text-xs w-full">
                            <tbody>
                              {Object.entries(log.changes!).map(([key, val]) => (
                                <tr key={key} className="border-b border-gray-200 last:border-0">
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
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {shouldShowPagination(pagination.pages) && (
          <div className="border-t border-gray-300 px-4 py-3 flex items-center justify-between text-sm text-gray-500">
            <span className="tabular-nums">
              {(dict.admin?.showingRange || 'Showing {start}–{end} of {total}')
                .replace('{start}', rangeStart.toLocaleString())
                .replace('{end}', rangeEnd.toLocaleString())
                .replace('{total}', pagination.total.toLocaleString())}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={!canGoToPreviousPage(currentPage)}
                className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100 transition-colors"
              >
                ←{dict.common?.previous || 'Previous'}
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={!canGoToNextPage(currentPage, pagination.pages)}
                className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100 transition-colors"
              >
                {dict.common?.next || 'Next'} →
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict.admin?.auditLogs || 'Audit Logs'}
        description={dict.admin?.auditLogsSubtitle || 'View system activity and changes'}
        actions={canExport && (
          <>
            <button
              onClick={() => handleExport('csv')}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
            >
              {dict.admin?.exportCSV || 'Export CSV'}
            </button>
            <button
              onClick={() => handleExport('json')}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
            >
              {dict.admin?.exportJSON || 'Export JSON'}
            </button>
          </>
        )}
      />

      <div className="space-y-4">
        {/* Filter bar */}
        <div className="bg-white border border-gray-300 p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="audit-action" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.action || 'Action'}
              </label>
              <select
                id="audit-action"
                value={filters.action}
                onChange={(e) => handleFilterChangeWrapper('action', e.target.value)}
                className="px-3 py-2 border border-gray-300 text-sm bg-white w-40"
              >
                <option value="">{dict.admin?.allActions || 'All Actions'}</option>
                {getActionOptions().map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="audit-entity-type" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.entityType || 'Entity Type'}
              </label>
              <input
                id="audit-entity-type"
                type="text"
                value={filters.entityType}
                onChange={(e) => handleFilterChangeWrapper('entityType', e.target.value)}
                placeholder={dict.admin?.entityTypePlaceholder || 'e.g. product, user'}
                className="px-3 py-2 border border-gray-300 text-sm bg-white w-44"
              />
            </div>
            <div>
              <label htmlFor="audit-user" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.user || 'User'}
              </label>
              <select
                id="audit-user"
                value={filters.userId}
                onChange={(e) => handleFilterChangeWrapper('userId', e.target.value)}
                className="px-3 py-2 border border-gray-300 text-sm bg-white w-44"
              >
                <option value="">{dict.admin?.allUsers || 'All Users'}</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="audit-start" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.startDate || 'Start Date'}
              </label>
              <input
                id="audit-start"
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChangeWrapper('startDate', e.target.value)}
                className="px-3 py-2 border border-gray-300 text-sm bg-white"
              />
            </div>
            <div>
              <label htmlFor="audit-end" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.endDate || 'End Date'}
              </label>
              <input
                id="audit-end"
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChangeWrapper('endDate', e.target.value)}
                className="px-3 py-2 border border-gray-300 text-sm bg-white"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.days)}
                className="inline-flex items-center justify-center px-4 py-2 text-xs border border-gray-300 text-gray-600 hover:bg-gray-100 bg-white transition-colors"
              >
                {dict.admin?.[p.key] || p.fallback}
              </button>
            ))}
            {hasFilters && (
              <button onClick={clearFilters} className="inline-flex items-center justify-center px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                {dict.common?.clearFilters || 'Clear Filters'}
              </button>
            )}
            {pagination.total > 0 && (
              <p className="ml-auto text-xs text-gray-400 tabular-nums">
                {pagination.total.toLocaleString()} {dict.admin?.auditLogsTotalEntries || 'total log entries'}
              </p>
            )}
          </div>
        </div>

        {renderLogs()}
      </div>
    </div>
  );
}
