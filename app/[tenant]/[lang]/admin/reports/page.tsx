'use client';

import { useEffect, useState } from 'react';
import PageLoading from '@/components/ui/PageLoading';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import ReportsTabSkeleton from '@/components/reports/ReportsTabSkeleton';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import {
  useReportsData,
  type ReportTab,
  type SalesReport,
  type ProductPerformance,
  type VATReport,
  type ProfitLossSummary,
  type CashDrawerReport,
  type SalesJournalData,
} from '@/hooks/useReportsData';
import type { TranslationDict } from '@/types/dictionary';

const DEFAULT_COLORS = ['#35979c', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function AdminReportsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const primaryColor = settings?.primaryColor || '#35979c';
  const COLORS = [primaryColor, ...DEFAULT_COLORS.filter(c => c !== primaryColor)].slice(0, 5);
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const {
    status,
    error,
    refetch,
    salesReport,
    productPerformance,
    vatReport,
    profitLoss,
    cashDrawerReports,
    salesJournal,
  } = useReportsData({
    tenant,
    activeTab,
    period,
    startDate,
    endDate,
    enabled: !!dict && !!startDate && !!endDate,
  });

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  }, [lang]);

  const handlePeriodChange = (newPeriod: 'daily' | 'weekly' | 'monthly') => {
    setPeriod(newPeriod);
    const end = new Date();
    const start = new Date();
    if (newPeriod === 'weekly') {
      start.setDate(start.getDate() - 6);
    } else if (newPeriod === 'monthly') {
      start.setDate(start.getDate() - 29);
    }
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  };

  const exportSalesJournal = async (format: 'csv' | 'excel' | 'pdf') => {
    if (format === 'csv') {
      const urlParams = new URLSearchParams({
        tenant,
        format: 'csv',
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });
      window.open(`/api/reports/sales-journal?${urlParams}`, '_blank');
      return;
    }
    if (!salesJournal) return;
    const headers = [
      'receiptNumber', 'date', 'time', 'items', 'itemCount',
      'subtotal', 'discountCategory', 'discountAmount',
      'taxExemptAmount', 'taxAmount', 'total', 'paymentMethod', 'status',
    ];
    const { downloadExcel, downloadPDF } = await import('@/lib/export');
    const filename = `sales-journal-${startDate}-to-${endDate}`;
    if (format === 'excel') {
      await downloadExcel(salesJournal.entries, headers, filename);
    } else {
      await downloadPDF(salesJournal.entries, headers, filename, 'Sales Journal');
    }
  };

  if (!dict) {
    return <PageLoading label="Loading..." />;
  }

  const reportsDict = dict.reports ?? {};

  const renderEmptyState = (title: string) => (
    <EmptyState icon="products" title={title} className="py-12" />
  );

  const renderTabContent = () => {
    if (status === 'loading') {
      return <ReportsTabSkeleton />;
    }

    if (status === 'error') {
      return (
        <ErrorState
          title={reportsDict.failedToLoadReports || 'Failed to load report'}
          description={error || undefined}
          onRetry={refetch}
          retryLabel={dict.common.retry || 'Retry'}
        />
      );
    }

    switch (activeTab) {
      case 'sales':
        return salesReport ? (
          <SalesReportView report={salesReport} dict={dict} primaryColor={primaryColor} colors={COLORS} />
        ) : (
          renderEmptyState(reportsDict.noData || 'No data available for the selected period')
        );
      case 'products':
        return productPerformance.length > 0 ? (
          <ProductPerformanceView data={productPerformance} dict={dict} primaryColor={primaryColor} />
        ) : (
          renderEmptyState(reportsDict.noData || 'No product performance data available for the selected period')
        );
      case 'vat':
        return vatReport ? (
          <VATReportView report={vatReport} dict={dict} primaryColor={primaryColor} />
        ) : (
          renderEmptyState(reportsDict.noData || 'No VAT data available for the selected period')
        );
      case 'profit-loss':
        return profitLoss ? (
          <ProfitLossView summary={profitLoss} dict={dict} primaryColor={primaryColor} colors={COLORS} />
        ) : (
          renderEmptyState(reportsDict.noData || 'No profit & loss data available for the selected period')
        );
      case 'cash-drawer':
        return cashDrawerReports.length > 0 ? (
          <CashDrawerReportView reports={cashDrawerReports} dict={dict} />
        ) : (
          renderEmptyState(reportsDict.noCashDrawerReports || 'No cash drawer reports found')
        );
      case 'sales-journal':
        return salesJournal && salesJournal.entries.length > 0 ? (
          <SalesJournalView data={salesJournal} dict={dict} primaryColor={primaryColor} onExport={exportSalesJournal} />
        ) : (
          renderEmptyState(reportsDict.noData || 'No sales journal data available for the selected period')
        );
      default:
        return null;
    }
  };

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {dict.reports?.title || 'Reports & Analytics'}
        </h1>
        <p className="text-sm text-gray-500">
          {dict.reports?.subtitle || 'View detailed reports and analytics for your business'}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Filters sidebar */}
        <aside className="w-full lg:w-56 shrink-0">
          <div className="bg-white border border-gray-300 p-4 lg:sticky lg:top-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Filters</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.reports?.startDate || 'Start Date'}
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 bg-white text-sm transition-all"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.reports?.endDate || 'End Date'}
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 bg-white text-sm transition-all"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = primaryColor;
                    e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
              {activeTab === 'sales' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dict.reports?.period || 'Period'}
                  </label>
                  <select
                    value={period}
                    onChange={(e) => handlePeriodChange(e.target.value as 'daily' | 'weekly' | 'monthly')}
                    className="w-full px-3 py-2 border border-gray-300 bg-white text-sm transition-all"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = primaryColor;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#d1d5db';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <option value="daily">{dict.reports?.daily || 'Daily'}</option>
                    <option value="weekly">{dict.reports?.weekly || 'Weekly'}</option>
                    <option value="monthly">{dict.reports?.monthly || 'Monthly'}</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Tabs + Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-gray-300 overflow-hidden">
            <div className="border-b border-gray-200">
              <nav className="flex overflow-x-auto" aria-label={dict?.common?.tabs || 'Tabs'}>
                {(['sales', 'products', 'vat', 'profit-loss', 'cash-drawer', 'sales-journal'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'border-transparent text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    style={activeTab === tab ? { borderBottomColor: primaryColor, color: primaryColor } : undefined}
                  >
                    {dict.reports?.tabs?.[tab] || tab.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                  </button>
                ))}
              </nav>
            </div>
            <div className="p-5 sm:p-6">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SalesReportView({ report, dict, primaryColor, colors }: { report: SalesReport; dict: any; primaryColor: string; colors: string[] }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const paymentMethodData = [
    { name: dict.pos?.cash || 'Cash', value: report.salesByPaymentMethod.cash },
    { name: dict.pos?.card || 'Card', value: report.salesByPaymentMethod.card },
    { name: dict.pos?.digital || 'Digital', value: report.salesByPaymentMethod.digital },
    { name: dict.pos?.onAccount || 'On account', value: report.salesByPaymentMethod.on_account ?? 0 },
  ].filter((row) => row.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="border p-5 sm:p-6" style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}40` }}>
          <div className="font-semibold mb-2 uppercase tracking-wide text-xs sm:text-sm" style={{ color: primaryColor }}>
            {dict.reports?.totalSales || 'Total Sales'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold" style={{ color: primaryColor }}>
            <Currency amount={report.totalSales} />
          </div>
        </div>
        <div className="bg-green-50 border border-green-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-green-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.totalTransactions || 'Total Transactions'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-green-900">{report.totalTransactions}</div>
        </div>
        <div className="bg-purple-50 border border-purple-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-purple-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.averageTransaction || 'Average Transaction'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-purple-900">
            <Currency amount={report.averageTransaction} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {report.salesByDay && report.salesByDay.length > 0 && (
          <div className="bg-white border border-gray-300 p-5 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-5">
              {dict.reports?.salesByDay || 'Sales by Day'}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={report.salesByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
                <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
                <Legend />
                <Line type="monotone" dataKey="sales" stroke={primaryColor} strokeWidth={2} name={dict.reports?.sales || 'Sales'} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="bg-white border border-gray-300 p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-5">
            {dict.reports?.paymentMethods || 'Payment Methods'}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={paymentMethodData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {paymentMethodData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function ProductPerformanceView({ data, dict, primaryColor }: { data: ProductPerformance[]; dict: any; primaryColor: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-300 p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-5">
          {dict.reports?.topProducts || 'Top Products'}
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data.slice(0, 10)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="productName" angle={-45} textAnchor="end" height={100} stroke="#6b7280" style={{ fontSize: '12px' }} />
            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
            <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
            <Legend />
            <Bar dataKey="totalRevenue" fill={primaryColor} name={dict.reports?.revenue || 'Revenue'} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white border border-gray-300 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.rank || 'Rank'}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.products?.name || 'Product'}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.quantitySold || 'Quantity Sold'}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.totalRevenue || 'Revenue'}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.averagePrice || 'Avg Price'}</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((product, index) => (
              <tr key={product.productId || `product-${index}`}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">#{product.rank}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.productName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.quantitySold}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"><Currency amount={product.totalRevenue} /></td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"><Currency amount={product.averagePrice} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VATReportView({ report, dict, primaryColor }: { report: VATReport; dict: any; primaryColor: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="border p-5 sm:p-6" style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}40` }}>
          <div className="font-semibold mb-2 uppercase tracking-wide text-xs sm:text-sm" style={{ color: primaryColor }}>
            {dict.reports?.vatSales || 'VAT Sales'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold" style={{ color: primaryColor }}>
            <Currency amount={report.vatSales} />
          </div>
        </div>
        <div className="bg-green-50 border border-green-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-green-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.nonVatSales || 'Non-VAT Sales'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-green-900"><Currency amount={report.nonVatSales} /></div>
        </div>
        <div className="bg-purple-50 border border-purple-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-purple-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.vatAmount || 'VAT Amount'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-purple-900"><Currency amount={report.vatAmount} /></div>
        </div>
        <div className="bg-orange-50 border border-orange-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-orange-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.vatRate || 'VAT Rate'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-orange-900">{report.vatRate}%</div>
        </div>
      </div>
      <div className="bg-white border border-gray-300 p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-5">
          {dict.reports?.vatBreakdown || 'VAT Breakdown'}
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={[
                { name: dict.reports?.vatSales || 'VAT Sales', value: report.vatSales },
                { name: dict.reports?.nonVatSales || 'Non-VAT Sales', value: report.nonVatSales },
              ]}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              <Cell fill={primaryColor} />
              <Cell fill="#10b981" />
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ProfitLossView({ summary, dict, primaryColor, colors }: { summary: ProfitLossSummary; dict: any; primaryColor: string; colors: string[] }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const expenseData = summary.expenses.byCategory.map((cat) => ({
    name: cat.category,
    value: cat.amount,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-green-50 border border-green-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-green-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.totalRevenue || 'Total Revenue'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-green-900"><Currency amount={summary.revenue.total} /></div>
        </div>
        <div className="bg-red-50 border border-red-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-red-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.totalExpenses || 'Total Expenses'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-red-900"><Currency amount={summary.expenses.total} /></div>
        </div>
        <div className="border p-5 sm:p-6" style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}40` }}>
          <div className="font-semibold mb-2 uppercase tracking-wide text-xs sm:text-sm" style={{ color: primaryColor }}>
            {dict.reports?.netProfit || 'Net Profit'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold" style={{ color: primaryColor }}>
            <Currency amount={summary.netProfit} />
          </div>
        </div>
        <div className="bg-purple-50 border border-purple-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-purple-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.profitMargin || 'Profit Margin'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-purple-900">{summary.profitMargin.toFixed(2)}%</div>
        </div>
      </div>

      <div className="bg-white border border-gray-300 p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-5">
          {dict.reports?.revenueByPaymentMethod || 'Revenue by Payment Method'}
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={[
            { name: dict.pos?.cash || 'Cash', value: summary.revenue.cash },
            { name: dict.pos?.card || 'Card', value: summary.revenue.card },
            { name: dict.pos?.digital || 'Digital', value: summary.revenue.digital },
          ]}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: '12px' }} />
            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
            <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
            <Bar dataKey="value" fill={primaryColor} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {expenseData.length > 0 && (
        <div className="bg-white border border-gray-300 p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-5">
            {dict.reports?.expensesByCategory || 'Expenses by Category'}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={expenseData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {expenseData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function CashDrawerReportView({ reports, dict }: { reports: CashDrawerReport[]; dict: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-300 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.openingTime || 'Opening Time'}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.closingTime || 'Closing Time'}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.openingAmount || 'Opening'}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.expectedAmount || 'Expected'}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.closingAmount || 'Closing'}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.shortage || 'Shortage'}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.overage || 'Overage'}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.status || 'Status'}</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reports.map((report, index) => (
              <tr key={report.sessionId || `session-${index}`}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(report.openingTime).toLocaleString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {report.closingTime ? new Date(report.closingTime).toLocaleString() : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"><Currency amount={report.openingAmount} /></td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {report.expectedAmount ? <Currency amount={report.expectedAmount} /> : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {report.closingAmount ? <Currency amount={report.closingAmount} /> : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                  {report.shortage ? <Currency amount={report.shortage} /> : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                  {report.overage ? <Currency amount={report.overage} /> : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium border ${
                    report.status === 'closed'
                      ? 'bg-green-100 text-green-800 border-green-300'
                      : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                  }`}>
                    {report.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SalesJournalView({ data, dict, primaryColor, onExport }: { data: SalesJournalData; dict: any; primaryColor: string; onExport: (format: 'csv' | 'excel' | 'pdf') => void }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
        <div className="border p-5 sm:p-6" style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}40` }}>
          <div className="font-semibold mb-2 uppercase tracking-wide text-xs sm:text-sm" style={{ color: primaryColor }}>
            {dict.reports?.totalTransactions || 'Transactions'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold" style={{ color: primaryColor }}>{data.summary.totalTransactions}</div>
        </div>
        <div className="bg-green-50 border border-green-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-green-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.totalSales || 'Total Sales'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-green-900"><Currency amount={data.summary.totalSales} /></div>
        </div>
        <div className="bg-purple-50 border border-purple-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-purple-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.totalTax || 'Total Tax'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-purple-900"><Currency amount={data.summary.totalTax} /></div>
        </div>
        <div className="bg-orange-50 border border-orange-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-orange-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.totalDiscounts || 'Total Discounts'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-orange-900"><Currency amount={data.summary.totalDiscounts} /></div>
        </div>
        <div className="bg-red-50 border border-red-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-red-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.totalTaxExempt || 'Tax Exempt'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-red-900"><Currency amount={data.summary.totalTaxExempt} /></div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => onExport('csv')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors">
          {dict.reports?.exportCSV || 'Export CSV'}
        </button>
        <button onClick={() => onExport('excel')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors">
          {dict.reports?.exportExcel || 'Export Excel'}
        </button>
        <button onClick={() => onExport('pdf')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors">
          {dict.reports?.exportPDF || 'Export PDF'}
        </button>
      </div>

      <div className="bg-white border border-gray-300 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.receiptNo || 'Receipt #'}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.date || 'Date'}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.time || 'Time'}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.items || 'Items'}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{dict.reports?.subtotal || 'Subtotal'}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{dict.reports?.discount || 'Discount'}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{dict.reports?.tax || 'Tax'}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{dict.reports?.total || 'Total'}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.payment || 'Payment'}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.reports?.status || 'Status'}</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.entries.map((entry, index) => (
              <tr key={entry.receiptNumber || `journal-${index}`}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">{entry.receiptNumber || '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{entry.date}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{entry.time}</td>
                <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" title={entry.items}>{entry.items || '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900"><Currency amount={entry.subtotal} /></td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-orange-600">
                  {entry.discountAmount > 0 ? <><Currency amount={entry.discountAmount} /> {entry.discountCategory && <span className="text-xs">({entry.discountCategory})</span>}</> : '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-purple-600">
                  {entry.taxAmount > 0 ? <Currency amount={entry.taxAmount} /> : entry.taxExemptAmount > 0 ? <span className="text-xs text-red-500">EXEMPT</span> : '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-900"><Currency amount={entry.total} /></td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 capitalize">{entry.paymentMethod}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium border ${
                    entry.status === 'completed' ? 'bg-green-100 text-green-800 border-green-300' :
                    entry.status === 'refunded' ? 'bg-red-100 text-red-800 border-red-300' :
                    'bg-yellow-100 text-yellow-800 border-yellow-300'
                  }`}>
                    {entry.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
