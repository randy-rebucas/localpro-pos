'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import Currency from '@/components/Currency';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

interface SalesReport {
  period: string;
  startDate: string;
  endDate: string;
  totalSales: number;
  totalTransactions: number;
  averageTransaction: number;
  salesByPaymentMethod: {
    cash: number;
    card: number;
    digital: number;
  };
  salesByDay?: Array<{
    date: string;
    sales: number;
    transactions: number;
  }>;
}

interface ProductPerformance {
  productId: string;
  productName: string;
  totalSold: number;
  totalRevenue: number;
  averagePrice: number;
  quantitySold: number;
  rank: number;
}

interface VATReport {
  vatSales: number;
  nonVatSales: number;
  vatAmount: number;
  totalSales: number;
  vatRate: number;
}

interface ProfitLossSummary {
  period: string;
  startDate: string;
  endDate: string;
  revenue: {
    total: number;
    cash: number;
    card: number;
    digital: number;
  };
  expenses: {
    total: number;
    byCategory: Array<{
      category: string;
      amount: number;
    }>;
  };
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
}

interface CashDrawerReport {
  sessionId: string;
  userId: string;
  userName: string;
  openingTime: string;
  closingTime?: string;
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  shortage?: number;
  overage?: number;
  status: string;
  cashSales: number;
  cashExpenses: number;
  netCash: number;
}

export default function ReportsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const primaryColor = settings?.primaryColor || '#3b82f6';
  const COLORS = [primaryColor, ...DEFAULT_COLORS.filter(c => c !== primaryColor)].slice(0, 5);
  const [dict, setDict] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'sales' | 'products' | 'vat' | 'profit-loss' | 'cash-drawer'>('sales');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Report data
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [productPerformance, setProductPerformance] = useState<ProductPerformance[]>([]);
  const [vatReport, setVatReport] = useState<VATReport | null>(null);
  const [profitLoss, setProfitLoss] = useState<ProfitLossSummary | null>(null);
  const [cashDrawerReports, setCashDrawerReports] = useState<CashDrawerReport[]>([]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    // Set default date range (last 30 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  }, [lang]);

  useEffect(() => {
    if (dict && startDate && endDate) {
      loadReports();
    }
  }, [activeTab, period, startDate, endDate, dict, tenant]);

  const loadReports = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'sales':
          await loadSalesReport();
          break;
        case 'products':
          await loadProductPerformance();
          break;
        case 'vat':
          await loadVATReport();
          break;
        case 'profit-loss':
          await loadProfitLoss();
          break;
        case 'cash-drawer':
          await loadCashDrawerReports();
          break;
      }
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSalesReport = async () => {
    try {
      const params = new URLSearchParams({
        tenant,
        period,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });
      const res = await fetch(`/api/reports/sales?${params}`);
      const data = await res.json();
      if (data.success) {
        setSalesReport(data.data);
      } else {
        console.error('Error loading sales report:', data.error);
        setSalesReport(null);
      }
    } catch (error) {
      console.error('Error fetching sales report:', error);
      setSalesReport(null);
    }
  };

  const loadProductPerformance = async () => {
    try {
      const params = new URLSearchParams({
        tenant,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        limit: '20',
      });
      const res = await fetch(`/api/reports/products?${params}`);
      const data = await res.json();
      if (data.success) {
        setProductPerformance(data.data || []);
      } else {
        console.error('Error loading product performance:', data.error);
        setProductPerformance([]);
      }
    } catch (error) {
      console.error('Error fetching product performance:', error);
      setProductPerformance([]);
    }
  };

  const loadVATReport = async () => {
    try {
      const params = new URLSearchParams({
        tenant,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });
      const res = await fetch(`/api/reports/vat?${params}`);
      const data = await res.json();
      if (data.success) {
        setVatReport(data.data);
      } else {
        console.error('Error loading VAT report:', data.error);
        setVatReport(null);
      }
    } catch (error) {
      console.error('Error fetching VAT report:', error);
      setVatReport(null);
    }
  };

  const loadProfitLoss = async () => {
    try {
      const params = new URLSearchParams({
        tenant,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });
      const res = await fetch(`/api/reports/profit-loss?${params}`);
      const data = await res.json();
      if (data.success) {
        setProfitLoss(data.data);
      } else {
        console.error('Error loading profit & loss:', data.error);
        setProfitLoss(null);
      }
    } catch (error) {
      console.error('Error fetching profit & loss:', error);
      setProfitLoss(null);
    }
  };

  const loadCashDrawerReports = async () => {
    try {
      const params = new URLSearchParams({
        tenant,
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });
      const res = await fetch(`/api/reports/cash-drawer?${params}`);
      const data = await res.json();
      if (data.success) {
        setCashDrawerReports(data.data || []);
      } else {
        console.error('Error loading cash drawer reports:', data.error);
        setCashDrawerReports([]);
      }
    } catch (error) {
      console.error('Error fetching cash drawer reports:', error);
      setCashDrawerReports([]);
    }
  };

  if (!dict) {
    return <div className="text-center py-12">{dict?.common?.loading || 'Loading...'}</div>;
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
              {dict.reports?.title || 'Reports & Analytics'}
            </h1>
            <p className="text-gray-600">
              {dict.reports?.subtitle || 'View detailed reports and analytics for your business'}
            </p>
          </div>

          {/* Date Range Selector */}
          <div className="bg-white border border-gray-300 p-5 sm:p-6 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {dict.reports?.startDate || 'Start Date'}
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)] transition-all bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {dict.reports?.endDate || 'End Date'}
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)] transition-all bg-white"
                />
              </div>
              {activeTab === 'sales' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {dict.reports?.period || 'Period'}
                  </label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as any)}
                    className="px-4 py-3 border-2 border-gray-300 focus:ring-2 focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)] transition-all bg-white"
                  >
                    <option value="daily">{dict.reports?.daily || 'Daily'}</option>
                    <option value="weekly">{dict.reports?.weekly || 'Weekly'}</option>
                    <option value="monthly">{dict.reports?.monthly || 'Monthly'}</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white border border-gray-300 overflow-hidden mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex overflow-x-auto" aria-label={dict?.common?.tabs || 'Tabs'}>
                {(['sales', 'products', 'vat', 'profit-loss', 'cash-drawer'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'border-transparent text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    style={activeTab === tab ? { borderBottomColor: primaryColor, color: primaryColor } : undefined}
                  >
                    {dict.reports?.tabs?.[tab] || tab.replace('-', ' ')}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="p-5 sm:p-6 lg:p-8">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }}></div>
                  <span className="ml-3 text-gray-600">{dict?.common?.loading || 'Loading...'}</span>
                </div>
              ) : (
                <>
                  {activeTab === 'sales' && (
                    salesReport ? (
                      <SalesReportView report={salesReport} dict={dict} primaryColor={primaryColor} colors={COLORS} />
                    ) : (
                      <div className="text-center py-16">
                        <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <p className="text-gray-500 text-lg">{dict.reports?.noData || 'No sales data available for the selected period'}</p>
                      </div>
                    )
                  )}
                  {activeTab === 'products' && (
                    productPerformance.length > 0 ? (
                      <ProductPerformanceView data={productPerformance} dict={dict} primaryColor={primaryColor} />
                    ) : (
                      <div className="text-center py-16">
                        <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        <p className="text-gray-500 text-lg">{dict?.reports?.noData || 'No product performance data available for the selected period'}</p>
                      </div>
                    )
                  )}
                  {activeTab === 'vat' && (
                    vatReport ? (
                      <VATReportView report={vatReport} dict={dict} primaryColor={primaryColor} />
                    ) : (
                      <div className="text-center py-16">
                        <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <p className="text-gray-500 text-lg">{dict.reports?.noData || 'No VAT data available for the selected period'}</p>
                      </div>
                    )
                  )}
                  {activeTab === 'profit-loss' && (
                    profitLoss ? (
                      <ProfitLossView summary={profitLoss} dict={dict} primaryColor={primaryColor} colors={COLORS} />
                    ) : (
                      <div className="text-center py-16">
                        <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-gray-500 text-lg">{dict.reports?.noData || 'No profit & loss data available for the selected period'}</p>
                      </div>
                    )
                  )}
                  {activeTab === 'cash-drawer' && (
                    <CashDrawerReportView reports={cashDrawerReports} dict={dict} />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

function SalesReportView({ report, dict, primaryColor, colors }: { report: SalesReport; dict: any; primaryColor: string; colors: string[] }) {
  const paymentMethodData = [
    { name: dict.pos?.cash || 'Cash', value: report.salesByPaymentMethod.cash },
    { name: dict.pos?.card || 'Card', value: report.salesByPaymentMethod.card },
    { name: dict.pos?.digital || 'Digital', value: report.salesByPaymentMethod.digital },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-blue-50 border border-blue-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-blue-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.totalSales || 'Total Sales'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-blue-900">
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

      {/* Charts */}
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
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
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
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function ProductPerformanceView({ data, dict, primaryColor }: { data: ProductPerformance[]; dict: any; primaryColor: string }) {
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
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            />
            <Legend />
            <Bar dataKey="totalRevenue" fill={primaryColor} name={dict.reports?.revenue || 'Revenue'} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-gray-300 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {dict.reports?.rank || 'Rank'}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {dict.products?.name || 'Product'}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {dict.reports?.quantitySold || 'Quantity Sold'}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {dict.reports?.totalRevenue || 'Revenue'}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {dict.reports?.averagePrice || 'Avg Price'}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((product, index) => (
              <tr key={product.productId || `product-${index}`}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  #{product.rank}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {product.productName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {product.quantitySold}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <Currency amount={product.totalRevenue} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <Currency amount={product.averagePrice} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VATReportView({ report, dict, primaryColor }: { report: VATReport; dict: any; primaryColor: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-blue-50 border border-blue-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-blue-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.vatSales || 'VAT Sales'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-blue-900">
            <Currency amount={report.vatSales} />
          </div>
        </div>
        <div className="bg-green-50 border border-green-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-green-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.nonVatSales || 'Non-VAT Sales'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-green-900">
            <Currency amount={report.nonVatSales} />
          </div>
        </div>
        <div className="bg-purple-50 border border-purple-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-purple-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.vatAmount || 'VAT Amount'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-purple-900">
            <Currency amount={report.vatAmount} />
          </div>
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
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ProfitLossView({ summary, dict, primaryColor, colors }: { summary: ProfitLossSummary; dict: any; primaryColor: string; colors: string[] }) {
  const expenseData = summary.expenses.byCategory.map((cat) => ({
    name: cat.category,
    value: cat.amount,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-green-50 border border-green-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-green-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.totalRevenue || 'Total Revenue'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-green-900">
            <Currency amount={summary.revenue.total} />
          </div>
        </div>
        <div className="bg-red-50 border border-red-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-red-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.totalExpenses || 'Total Expenses'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-red-900">
            <Currency amount={summary.expenses.total} />
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-blue-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.netProfit || 'Net Profit'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-blue-900">
            <Currency amount={summary.netProfit} />
          </div>
        </div>
        <div className="bg-purple-50 border border-purple-300 p-5 sm:p-6">
          <div className="text-xs sm:text-sm text-purple-600 font-semibold mb-2 uppercase tracking-wide">
            {dict.reports?.profitMargin || 'Profit Margin'}
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-purple-900">
            {summary.profitMargin.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Revenue by Payment Method */}
      <div className="bg-white border border-gray-300 p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-5">
          {dict.reports?.revenueByPaymentMethod || 'Revenue by Payment Method'}
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={[
              { name: dict.pos?.cash || 'Cash', value: summary.revenue.cash },
              { name: dict.pos?.card || 'Card', value: summary.revenue.card },
              { name: dict.pos?.digital || 'Digital', value: summary.revenue.digital },
            ]}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: '12px' }} />
            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            />
            <Bar dataKey="value" fill={primaryColor} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Expenses by Category */}
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
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function CashDrawerReportView({ reports, dict }: { reports: CashDrawerReport[]; dict: any }) {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-300 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {dict.reports?.openingTime || 'Opening Time'}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {dict.reports?.closingTime || 'Closing Time'}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {dict.reports?.openingAmount || 'Opening'}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {dict.reports?.expectedAmount || 'Expected'}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {dict.reports?.closingAmount || 'Closing'}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {dict.reports?.shortage || 'Shortage'}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {dict.reports?.overage || 'Overage'}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {dict.reports?.status || 'Status'}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reports.map((report, index) => (
              <tr key={report.sessionId || `session-${index}`}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(report.openingTime).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {report.closingTime ? new Date(report.closingTime).toLocaleString() : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <Currency amount={report.openingAmount} />
                </td>
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
                  <span
                    className={`px-2 py-1 text-xs font-medium border ${
                      report.status === 'closed'
                        ? 'bg-green-100 text-green-800 border-green-300'
                        : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                    }`}
                  >
                    {report.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {reports.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-lg">{dict.reports?.noCashDrawerReports || 'No cash drawer reports found'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

