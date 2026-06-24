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
  getActionBadgeClass,
  formatEntityId,
  formatIpAddress,
  getPaginationInfo,
  canGoToPreviousPage,
  canGoToNextPage,
  isAuditLogEmpty,
  shouldShowPagination,
} from '@/lib/audit-helpers';
import toast from 'react-hot-toast';

export default function AuditLogsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = React.useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [currentPage, setCurrentPage] = React.useState(1);

  const { auditLogs, pagination, loading: auditLoading, fetch: fetchAuditLogs } = useAuditLogs();
  const { filters, handleFilterChange } = useAuditFilters();
  const { users, loading: usersLoading, fetch: fetchUsers } = useAuditUsers();

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

  // Fetch audit logs when filters or pagination changes
  useEffect(() => {
    if (dict && tenant) {
      fetchAuditLogs(
        {
          page: currentPage,
          limit: 50,
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
    }
  }, [filters, currentPage, dict, tenant, fetchAuditLogs]);

  const handleFilterChangeWrapper = useCallback((key: string, value: string) => {
    handleFilterChange(key as any, value); // eslint-disable-line @typescript-eslint/no-explicit-any
    setCurrentPage(1); // Reset to first page when filters change
  }, [handleFilterChange]);

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
  }, []);

  if (!dict || usersLoading) {
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
    <div className="px-4 sm:px-6 py-6">

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {dict.admin?.auditLogs || 'Audit Logs'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{dict.admin?.auditLogsSubtitle || 'View system activity and changes'}</p>
      </div>

      <div className="flex gap-6 items-start">

        {/* Left — filters sidebar */}
        <aside className="w-52 shrink-0 sticky top-6 space-y-4">
          <div className="bg-white border border-gray-300 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {dict.admin?.filters || 'Filters'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {dict.admin?.action || 'Action'}
                </label>
                <select
                  value={filters.action}
                  onChange={(e) => handleFilterChangeWrapper('action', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                >
                  <option value="">{dict.admin?.allActions || 'All Actions'}</option>
                  {getActionOptions().map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {dict.admin?.entityType || 'Entity Type'}
                </label>
                <input
                  type="text"
                  value={filters.entityType}
                  onChange={(e) => handleFilterChangeWrapper('entityType', e.target.value)}
                  placeholder="e.g. product, user"
                  className="w-full px-3 py-2 border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {dict.admin?.user || 'User'}
                </label>
                <select
                  value={filters.userId}
                  onChange={(e) => handleFilterChangeWrapper('userId', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                >
                  <option value="">{dict.admin?.allUsers || 'All Users'}</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {dict.admin?.startDate || 'Start Date'}
                </label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChangeWrapper('startDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {dict.admin?.endDate || 'End Date'}
                </label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChangeWrapper('endDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                />
              </div>
            </div>
          </div>

          {/* Stats */}
          {pagination.total > 0 && (
            <div className="bg-white border border-gray-300 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Results</p>
              <p className="text-2xl font-bold text-gray-900">{pagination.total}</p>
              <p className="text-xs text-gray-400 mt-0.5">total log entries</p>
            </div>
          )}
        </aside>

        {/* Right — table */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-gray-300">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                {dict.admin?.auditLogs || 'Audit Logs'}
              </p>
            </div>

            {auditLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="inline-block animate-spin h-7 w-7 border-b-2 border-brand mb-3" />
                  <p className="text-sm text-gray-400">{dict.common?.loading || 'Loading...'}</p>
                </div>
              </div>
            ) : isAuditLogEmpty(auditLogs) ? (
              <div className="text-center py-16 text-sm text-gray-400">
                {dict.common?.noResults || 'No audit logs found'}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {dict.admin?.timestamp || 'Timestamp'}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {dict.admin?.user || 'User'}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {dict.admin?.action || 'Action'}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {dict.admin?.entityType || 'Entity Type'}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {dict.admin?.entityId || 'Entity ID'}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {dict.admin?.ipAddress || 'IP'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {auditLogs.map((log) => {
                        const { name: userName, email: userEmail } = extractUserInfo(log.userId);
                        return (
                          <tr key={log._id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                              {formatAuditTimestamp(log.createdAt)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <p className="text-sm font-medium text-gray-900">{userName}</p>
                              {userEmail && <p className="text-xs text-gray-400">{userEmail}</p>}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={getActionBadgeClass(log.action)}>
                                {log.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                              {log.entityType}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400 font-mono">
                              {formatEntityId(log.entityId)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400 font-mono">
                              {formatIpAddress(log.ipAddress)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {shouldShowPagination(pagination.pages) && (
                  <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      {getPaginationInfo(currentPage, 50, pagination.total, dict)}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={!canGoToPreviousPage(currentPage)}
                        className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {dict.common?.previous || 'Previous'}
                      </button>
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={!canGoToNextPage(currentPage, pagination.pages)}
                        className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

