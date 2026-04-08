'use client';

import React, { useEffect, useCallback } from 'react';
import AdminNavBar from '@/components/AdminNavBar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
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
      <div className="bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50">
      <AdminNavBar />
      <div className="px-6 py-5">
        <div className="mb-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">
                {dict.admin?.auditLogs || 'Audit Logs'}
              </h1>
              <p className="text-gray-600">{dict.admin?.auditLogsSubtitle || 'View system activity and changes'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 p-5">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{dict.admin?.auditLogs || 'Audit Logs'}</h2>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4 p-4 bg-gray-50 border border-gray-300">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.action || 'Action'}
                </label>
                <select
                  value={filters.action}
                  onChange={(e) => handleFilterChangeWrapper('action', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="">All Actions</option>
                  {getActionOptions().map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.entityType || 'Entity Type'}
                </label>
                <input
                  type="text"
                  value={filters.entityType}
                  onChange={(e) => handleFilterChangeWrapper('entityType', e.target.value)}
                  placeholder="e.g., user, product"
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.user || 'User'}
                </label>
                <select
                  value={filters.userId}
                  onChange={(e) => handleFilterChangeWrapper('userId', e.target.value)}
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
                  value={filters.startDate}
                  onChange={(e) => handleFilterChangeWrapper('startDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.endDate || 'End Date'}
                </label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChangeWrapper('endDate', e.target.value)}
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
                        const { name: userName, email: userEmail } = extractUserInfo(log.userId);
                        return (
                          <tr key={log._id} className="hover:bg-gray-50">
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatAuditTimestamp(log.createdAt)}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              <div>
                                <div className="font-medium">{userName}</div>
                                {userEmail && <div className="text-xs text-gray-500">{userEmail}</div>}
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className={getActionBadgeClass(log.action)}>
                                {log.action}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              {log.entityType}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                              {formatEntityId(log.entityId)}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                              {formatIpAddress(log.ipAddress)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {isAuditLogEmpty(auditLogs) && !auditLoading && (
                  <div className="text-center py-8 text-gray-500">
                    {dict.common?.noResults || 'No audit logs found'}
                  </div>
                )}

                {/* Pagination */}
                {shouldShowPagination(pagination.pages) && (
                  <div className="mt-6 flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      {getPaginationInfo(currentPage, 50, pagination.total, dict)}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={!canGoToPreviousPage(currentPage)}
                        className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white"
                      >
                        {dict.common?.previous || 'Previous'}
                      </button>
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={!canGoToNextPage(currentPage, pagination.pages)}
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

