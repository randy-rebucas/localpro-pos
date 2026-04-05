'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import Currency from '@/components/Currency';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { useReceivablesList } from '@/hooks/useReceivablesList';
import {
  STATUS_FILTERS,
  getStatusColor,
  formatDueDate,
  getOutstandingColor,
  formatCustomerName,
  filterReceivablesBySearch,
} from '@/lib/receivables-helpers';

interface Summary {
  totalOutstanding: number;
  totalPaid: number;
  totalInvoiced: number;
}

export default function ReceivablesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#3b82f6';

  const [dict, setDict] = useState<Record<string, any>>(null!); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [summary, setSummary] = useState<Summary>({
    totalOutstanding: 0,
    totalPaid: 0,
    totalInvoiced: 0,
  });
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const { items, loading, error, hasMore, endRef, retry, reset, fetchSummary } = useReceivablesList(
    tenant,
    statusFilter
  );

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchSummary((newSummary) => setSummary(newSummary));
  }, [tenant, fetchSummary]);

  const handleStatusChange = (status: string) => {
    setStatusFilter(status === statusFilter ? '' : status);
    reset();
  };

  const filteredItems = filterReceivablesBySearch(items, searchTerm);

  if (!dict) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Accounts Receivable</h1>
          <p className="text-gray-600">Manage customer outstanding payments and track collections</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <div className="bg-white border border-gray-300 p-6">
            <div className="text-xs text-gray-500 uppercase font-medium mb-2">Total Outstanding</div>
            <div className="text-3xl font-bold text-red-600">
              <Currency amount={summary.totalOutstanding} />
            </div>
            <p className="text-xs text-gray-500 mt-2">Awaiting payment</p>
          </div>
          <div className="bg-white border border-gray-300 p-6">
            <div className="text-xs text-gray-500 uppercase font-medium mb-2">Total Paid</div>
            <div className="text-3xl font-bold text-green-600">
              <Currency amount={summary.totalPaid} />
            </div>
            <p className="text-xs text-gray-500 mt-2">Collected</p>
          </div>
          <div className="bg-white border border-gray-300 p-6">
            <div className="text-xs text-gray-500 uppercase font-medium mb-2">Total Invoiced</div>
            <div className="text-3xl font-bold" style={{ color: primaryColor }}>
              <Currency amount={summary.totalInvoiced} />
            </div>
            <p className="text-xs text-gray-500 mt-2">All receivables</p>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-white border border-gray-300 p-6 mb-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">Search</label>
            <input
              type="text"
              placeholder="Search by customer name, email, or receipt number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Status Filter Buttons */}
          <div>
            <p className="text-sm font-medium text-gray-900 mb-3">Status Filter</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(STATUS_FILTERS).map(([key, option]) => (
                <button
                  key={key}
                  onClick={() => handleStatusChange(key)}
                  className={`px-3 py-2 text-xs font-medium border transition-colors ${
                    statusFilter === key
                      ? `${option.bgColor} ${option.color} border-current`
                      : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {statusFilter && (
              <p className="text-xs text-gray-600 mt-3">
                Showing: <span className="font-medium">{STATUS_FILTERS[statusFilter]?.label}</span>
                <button 
                  onClick={() => handleStatusChange('')}
                  className="ml-3 text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 p-4 mb-6 flex items-start gap-3">
            <svg className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900 mb-2">{error}</p>
              <button
                onClick={retry}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Receivables Table */}
        <div className="bg-white border border-gray-300 overflow-hidden">
          {filteredItems.length === 0 && !loading ? (
            <div className="p-12 text-center">
              <svg
                className="w-12 h-12 text-gray-300 mx-auto mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-gray-600 font-medium mb-1">
                {searchTerm ? 'No matching receivables' : 'No receivables yet'}
              </p>
              <p className="text-gray-500 text-sm">
                {searchTerm ? 'Try adjusting your search criteria' : 'Outstanding customer payments will appear here'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900 text-xs uppercase">Customer</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900 text-xs uppercase">Receipt</th>
                    <th className="px-6 py-3 text-right font-semibold text-gray-900 text-xs uppercase">Original</th>
                    <th className="px-6 py-3 text-right font-semibold text-gray-900 text-xs uppercase">Outstanding</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900 text-xs uppercase">Due Date</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900 text-xs uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredItems.map((receivable) => {
                    const statusInfo = getStatusColor(receivable.paymentStatus);
                    const dueInfo = formatDueDate(receivable.dueDate);

                    return (
                      <tr
                        key={receivable._id}
                        onMouseEnter={() => setHoveredRow(receivable._id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        className={`transition-colors ${
                          hoveredRow === receivable._id ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">
                            {formatCustomerName(receivable)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{receivable.customerId.email}</div>
                        </td>
                        <td className="px-6 py-4 text-gray-700 font-medium">
                          #{receivable.transactionId.receiptNumber}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-900 font-semibold">
                          <Currency amount={receivable.originalAmount} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div
                            className="font-bold"
                            style={{
                              color: getOutstandingColor(receivable.outstandingAmount),
                            }}
                          >
                            <Currency amount={receivable.outstandingAmount} />
                          </div>
                          {receivable.paidAmount > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              Paid: <Currency amount={receivable.paidAmount} />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-900 font-medium">
                            {dueInfo.formatted}
                          </div>
                          <div
                            className={`text-xs font-semibold mt-1 ${
                              dueInfo.style === 'overdue'
                                ? 'text-red-600'
                                : dueInfo.style === 'urgent'
                                ? 'text-orange-600'
                                : 'text-gray-500'
                            }`}
                          >
                            {dueInfo.display}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${statusInfo.bgColor} ${statusInfo.color}`}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Loading More Indicator */}
          {loading && (
            <div className="px-6 py-4 text-center border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-center gap-2">
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: primaryColor }}
                ></div>
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: primaryColor, animationDelay: '0.2s' }}
                ></div>
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: primaryColor, animationDelay: '0.4s' }}
                ></div>
                <span className="text-sm text-gray-600 ml-2">Loading more...</span>
              </div>
            </div>
          )}

          {/* End of list indicator */}
          {!hasMore && filteredItems.length > 0 && (
            <div className="px-6 py-4 text-center border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-600">
                ✓ All receivables loaded ({filteredItems.length} total)
              </p>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-6 bg-white border border-gray-300 px-6 py-4 flex justify-between items-center text-sm text-gray-600">
          <div>
            Showing <span className="font-semibold text-gray-900">{filteredItems.length}</span> receivable{filteredItems.length !== 1 ? 's' : ''}
            {searchTerm && ` • Matching "${searchTerm}"`}
            {statusFilter && ` • Status: ${STATUS_FILTERS[statusFilter]?.label}`}
          </div>
          <div ref={endRef} className="text-xs text-gray-500">
            {!hasMore && filteredItems.length > 0 && '✓ Fully loaded'}
          </div>
        </div>
      </div>
    </div>
  );
}
