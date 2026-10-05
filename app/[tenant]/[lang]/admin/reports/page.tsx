'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import ReportsTabSkeleton from '@/components/reports/ReportsTabSkeleton';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { formatGrandTotalRegister } from '@/lib/bir-format';
import { formatDateTime, formatDate as formatTenantDate } from '@/lib/formatting';
import { getDefaultTenantSettings } from '@/lib/currency';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature } from '@/lib/business-type-helpers';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useReportsData,
  type ReportTab,
  type SalesReport,
  type ProductPerformance,
  type VATReport,
  type ProfitLossSummary,
  type CashDrawerReport,
  type SalesJournalData,
  type XReadingData,
  type ZReadingRecord,
  type LaundryReport,
} from '@/hooks/useReportsData';
import type { TranslationDict } from '@/types/dictionary';

// Chart series palette: the Win8 token hexes (brand, success, accent, info, suspended).
// The tenant's primaryColor, when set, leads the palette so charts stay on-brand.
const DEFAULT_COLORS = ['#35979c', '#0b7a44', '#7a3fc9', '#1e70bf', '#b35900'];
const REPORT_TABS: ReportTab[] = [
  'sales', 'products', 'vat', 'profit-loss', 'cash-drawer', 'sales-journal', 'x-reading', 'z-reading', 'laundry',
];

const CASH_DRAWER_STATUS_BADGE: Record<string, string> = {
  closed: 'bg-win8-success text-white',
  open: 'bg-win8-warning text-white',
};

const JOURNAL_STATUS_BADGE: Record<string, string> = {
  completed: 'bg-win8-success text-white',
  refunded: 'bg-win8-suspended text-white',
  voided: 'bg-win8-danger text-white',
  cancelled: 'bg-win8-danger text-white',
  pending: 'bg-win8-warning text-white',
};

const TOOLTIP_STYLE = { backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: 0 };
const AXIS_PROPS = { stroke: '#6b7280', style: { fontSize: '12px' } };

const inputCls = 'px-3 py-2 border border-gray-300 text-sm bg-white';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
const btnSecondary =
  'px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors';
const thCls = 'px-4 py-3 text-left font-medium';
const thRight = 'px-4 py-3 text-right font-medium';

/** Solid-color KPI tile (patterns.md "KPI tile" variant). */
function KpiTile({ label, color, children, sub }: { label: string; color: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className={`${color} text-white p-5`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/80 leading-tight">{label}</p>
      <div className="text-3xl font-bold tabular-nums mt-2">{children}</div>
      {sub && <div className="text-xs text-white/70 mt-1">{sub}</div>}
    </div>
  );
}

/** White chart/card panel with a small heading. */
function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-300 p-5">
      <h2 className="text-sm font-bold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Pagination({
  page, totalPages, total, pageSize, onPage, dict,
}: { page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void; dict: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="border-t border-gray-300 px-4 py-3 flex items-center justify-between text-sm text-gray-500">
      <span className="tabular-nums">
        {dict.admin?.showing || 'Showing'} {start}–{end} {dict.admin?.of || 'of'} {total.toLocaleString()}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
        >
          ← {dict.common?.previous || 'Prev'}
        </button>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
        >
          {dict.common?.next || 'Next'} →
        </button>
      </div>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">{text}</div>;
}

export default function AdminReportsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const { canAccess } = usePermissions();
  const canGenerateZReading = canAccess('reports.z_reading');
  const primaryColor = settings?.primaryColor || '#35979c';
  const COLORS = [primaryColor, ...DEFAULT_COLORS.filter(c => c !== primaryColor)].slice(0, 5);
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Laundry tab is only valid once settings confirm the feature; while settings load, keep it.
  const laundryEnabled = supportsFeature(settings ?? undefined, 'laundryOrders');
  const tabParam = searchParams.get('tab') as ReportTab | null;
  const activeTab: ReportTab =
    tabParam && REPORT_TABS.includes(tabParam) && (tabParam !== 'laundry' || !settings || laundryEnabled)
      ? tabParam
      : 'sales';
  const setActiveTab = (tab: ReportTab) => {
    const next = new URLSearchParams(searchParams.toString());
    if (tab === 'sales') next.delete('tab');
    else next.set('tab', tab);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
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
    xReading,
    zReadings,
    generateZReading,
    generatingZReading,
    laundryReport,
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

  const handleGenerateZReading = async () => {
    const confirmText =
      (dict?.reports?.confirmZReading as string | undefined) ||
      "Generate today's Z-Reading? This locks today's totals into the Grand Total and can only be done once per business day.";
    if (!confirm(confirmText)) return;
    const result = await generateZReading();
    if (result.success) {
      toast.success(
        result.reprint
          ? ((dict?.reports?.zReadingAlreadyGenerated as string | undefined) || 'Z-Reading already generated for today — showing existing record')
          : ((dict?.reports?.zReadingGenerated as string | undefined) || 'Z-Reading generated')
      );
    } else {
      toast.error(result.error || (dict?.reports?.zReadingGenerationFailed as string | undefined) || 'Failed to generate Z-Reading');
    }
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const reportsDict = dict.reports ?? {};
  const noData = reportsDict.noData || 'No data available for the selected period.';

  const renderTabContent = () => {
    if (status === 'loading') {
      return <ReportsTabSkeleton />;
    }

    if (status === 'error') {
      return (
        <div className="text-center py-12 bg-white border border-gray-300" role="alert">
          <p className="text-win8-danger text-sm font-medium">{reportsDict.failedToLoadReports || 'Failed to load report'}</p>
          {error && <p className="text-gray-500 text-sm mt-1">{error}</p>}
          <button onClick={refetch} className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors">
            {dict.common.retry || 'Retry'}
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'sales':
        return salesReport ? (
          <SalesReportView report={salesReport} dict={dict} primaryColor={primaryColor} colors={COLORS} />
        ) : <EmptyPanel text={noData} />;
      case 'products':
        return productPerformance.length > 0 ? (
          <ProductPerformanceView data={productPerformance} dict={dict} primaryColor={primaryColor} />
        ) : <EmptyPanel text={noData} />;
      case 'vat':
        return vatReport ? (
          <VATReportView report={vatReport} dict={dict} colors={COLORS} />
        ) : <EmptyPanel text={noData} />;
      case 'profit-loss':
        return profitLoss ? (
          <ProfitLossView summary={profitLoss} dict={dict} primaryColor={primaryColor} colors={COLORS} />
        ) : <EmptyPanel text={noData} />;
      case 'cash-drawer':
        return cashDrawerReports.length > 0 ? (
          <CashDrawerReportView reports={cashDrawerReports} dict={dict} settings={settings} />
        ) : <EmptyPanel text={reportsDict.noCashDrawerReports || 'No cash drawer reports found.'} />;
      case 'sales-journal':
        return salesJournal && salesJournal.entries.length > 0 ? (
          <SalesJournalView data={salesJournal} dict={dict} onExport={exportSalesJournal} />
        ) : <EmptyPanel text={noData} />;
      case 'x-reading':
        return xReading ? (
          <XReadingView data={xReading} dict={dict} />
        ) : <EmptyPanel text={noData} />;
      case 'z-reading':
        return (
          <ZReadingView
            readings={zReadings}
            dict={dict}
            onGenerate={handleGenerateZReading}
            generating={generatingZReading}
            settings={settings}
            canGenerate={canGenerateZReading}
          />
        );
      case 'laundry':
        return laundryReport ? (
          <LaundryReportView report={laundryReport} dict={dict} primaryColor={primaryColor} colors={COLORS} />
        ) : <EmptyPanel text={noData} />;
      default:
        return null;
    }
  };

  const reportTabs: ReportTab[] = laundryEnabled ? REPORT_TABS : REPORT_TABS.filter((tab) => tab !== 'laundry');

  return (
    <div className="px-4 sm:px-6 py-6">
      <AdminPageHeader
        title={dict.reports?.title || 'Reports & Analytics'}
        description={dict.reports?.subtitle || 'View detailed reports and analytics for your business'}
      />

      <div className="space-y-4">
        <div className="bg-white border border-gray-300 p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label htmlFor="report-start" className={labelCls}>{dict.reports?.startDate || 'Start Date'}</label>
            <input
              id="report-start"
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="report-end" className={labelCls}>{dict.reports?.endDate || 'End Date'}</label>
            <input
              id="report-end"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
            />
          </div>
          {(activeTab === 'sales' || activeTab === 'laundry') && (
            <div>
              <label htmlFor="report-period" className={labelCls}>{dict.reports?.period || 'Period'}</label>
              <select
                id="report-period"
                value={period}
                onChange={(e) => handlePeriodChange(e.target.value as 'daily' | 'weekly' | 'monthly')}
                className={`${inputCls} w-36 text-gray-900`}
              >
                <option value="daily">{dict.reports?.daily || 'Daily'}</option>
                <option value="weekly">{dict.reports?.weekly || 'Weekly'}</option>
                <option value="monthly">{dict.reports?.monthly || 'Monthly'}</option>
              </select>
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-300 overflow-x-auto">
          <div className="flex" role="tablist" aria-label={dict?.common?.tabs || 'Tabs'}>
            {reportTabs.map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {dict.reports?.tabs?.[tab] || tab.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </button>
              );
            })}
          </div>
        </div>

        <div role="tabpanel">{renderTabContent()}</div>
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
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label={dict.reports?.totalSales || 'Total Sales'} color="bg-brand">
          <Currency amount={report.totalSales} />
        </KpiTile>
        <KpiTile label={dict.reports?.totalTransactions || 'Total Transactions'} color="bg-win8-success">
          {report.totalTransactions.toLocaleString()}
        </KpiTile>
        <KpiTile label={dict.reports?.averageTransaction || 'Average Transaction'} color="bg-win8-accent">
          <Currency amount={report.averageTransaction} />
        </KpiTile>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {report.salesByDay && report.salesByDay.length > 0 && (
          <ChartPanel title={dict.reports?.salesByDay || 'Sales by Day'}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={report.salesByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend />
                <Line type="monotone" dataKey="sales" stroke={primaryColor} strokeWidth={2} name={dict.reports?.sales || 'Sales'} />
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>
        )}
        <ChartPanel title={dict.reports?.paymentMethods || 'Payment Methods'}>
          {paymentMethodData.length === 0 ? (
            <p className="text-sm text-gray-400 italic">{dict.reports?.noData || 'No data available for the selected period.'}</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={paymentMethodData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {paymentMethodData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartPanel>
      </div>
    </div>
  );
}

function ProductPerformanceView({ data, dict, primaryColor }: { data: ProductPerformance[]; dict: any; primaryColor: string }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div className="space-y-4">
      <ChartPanel title={dict.reports?.topProducts || 'Top Products'}>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data.slice(0, 10)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="productName" angle={-45} textAnchor="end" height={100} {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend />
            <Bar dataKey="totalRevenue" fill={primaryColor} name={dict.reports?.revenue || 'Revenue'} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className={thCls}>{dict.reports?.rank || 'Rank'}</th>
              <th className={thCls}>{dict.products?.name || 'Product'}</th>
              <th className={thRight}>{dict.reports?.quantitySold || 'Quantity Sold'}</th>
              <th className={thRight}>{dict.reports?.totalRevenue || 'Revenue'}</th>
              <th className={thRight}>{dict.reports?.averagePrice || 'Avg Price'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((product, index) => (
              <tr key={product.productId || `product-${index}`} className="hover:bg-gray-100 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-500 tabular-nums">#{product.rank}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{product.productName}</td>
                <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700">{product.quantitySold.toLocaleString()}</td>
                <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-medium text-gray-900"><Currency amount={product.totalRevenue} /></td>
                <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700"><Currency amount={product.averagePrice} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LaundryReportView({ report, dict, primaryColor, colors }: { report: LaundryReport; dict: any; primaryColor: string; colors: string[] }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const statusData = Object.entries(report.ordersByStatus).map(([status, count]) => ({
    name: (dict.admin?.[status] as string) || status.replace(/_/g, ' '),
    value: count,
  }));
  const pricingData = [
    { name: dict.admin?.perItem || 'Per Item', value: report.revenueByPricingMethod.item },
    { name: dict.admin?.perWeight || 'Per Weight', value: report.revenueByPricingMethod.weight },
  ].filter((row) => row.value > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label={dict.reports?.totalOrders || 'Total Orders'} color="bg-brand">
          {report.totalOrders.toLocaleString()}
        </KpiTile>
        <KpiTile label={dict.reports?.totalRevenue || 'Total Revenue'} color="bg-win8-success">
          <Currency amount={report.totalRevenue} />
        </KpiTile>
        <KpiTile label={dict.reports?.averageTurnaround || 'Average Turnaround'} color="bg-win8-accent">
          {report.averageTurnaroundHours !== null ? `${report.averageTurnaroundHours.toFixed(1)}h` : '—'}
        </KpiTile>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartPanel title={dict.reports?.ordersByStatus || 'Orders by Status'}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" fill={primaryColor} name={dict.reports?.orders || 'Orders'} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title={dict.reports?.revenueByPricingMethod || 'Revenue by Pricing Method'}>
          {pricingData.length === 0 ? (
            <p className="text-sm text-gray-400 italic">{dict.reports?.noData || 'No data available for the selected period.'}</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pricingData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {pricingData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartPanel>
      </div>
    </div>
  );
}

function VATReportView({ report, dict, colors }: { report: VATReport; dict: any; colors: string[] }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label={dict.reports?.vatSales || 'VAT Sales'} color="bg-brand">
          <Currency amount={report.vatSales} />
        </KpiTile>
        <KpiTile label={dict.reports?.nonVatSales || 'Non-VAT Sales'} color="bg-win8-success">
          <Currency amount={report.nonVatSales} />
        </KpiTile>
        <KpiTile label={dict.reports?.vatAmount || 'VAT Amount'} color="bg-win8-accent">
          <Currency amount={report.vatAmount} />
        </KpiTile>
        <KpiTile label={dict.reports?.vatRate || 'VAT Rate'} color="bg-brand-navy">
          {report.vatRate}%
        </KpiTile>
      </div>
      <ChartPanel title={dict.reports?.vatBreakdown || 'VAT Breakdown'}>
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
              dataKey="value"
            >
              <Cell fill={colors[0]} />
              <Cell fill={colors[1]} />
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}

function ProfitLossView({ summary, dict, primaryColor, colors }: { summary: ProfitLossSummary; dict: any; primaryColor: string; colors: string[] }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const expenseData = summary.expenses.byCategory.map((cat) => ({
    name: cat.category,
    value: cat.amount,
  }));
  const profitable = summary.netProfit >= 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label={dict.reports?.totalRevenue || 'Total Revenue'} color="bg-win8-success">
          <Currency amount={summary.revenue.total} />
        </KpiTile>
        <KpiTile label={dict.reports?.totalExpenses || 'Total Expenses'} color="bg-win8-danger">
          <Currency amount={summary.expenses.total} />
        </KpiTile>
        <KpiTile label={dict.reports?.netProfit || 'Net Profit'} color={profitable ? 'bg-brand' : 'bg-win8-danger'}>
          <Currency amount={summary.netProfit} />
        </KpiTile>
        <KpiTile label={dict.reports?.profitMargin || 'Profit Margin'} color="bg-win8-accent">
          {summary.profitMargin.toFixed(2)}%
        </KpiTile>
      </div>

      <ChartPanel title={dict.reports?.revenueByPaymentMethod || 'Revenue by Payment Method'}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={[
            { name: dict.pos?.cash || 'Cash', value: summary.revenue.cash },
            { name: dict.pos?.card || 'Card', value: summary.revenue.card },
            { name: dict.pos?.digital || 'Digital', value: summary.revenue.digital },
          ]}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="value" fill={primaryColor} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      {expenseData.length > 0 && (
        <ChartPanel title={dict.reports?.expensesByCategory || 'Expenses by Category'}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={expenseData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                dataKey="value"
              >
                {expenseData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}
    </div>
  );
}

const CASH_DRAWER_PAGE_SIZE = 10;

function CashDrawerReportView({ reports, dict, settings }: { reports: CashDrawerReport[]; dict: any; settings: ReturnType<typeof useTenantSettings>['settings'] }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const [page, setPage] = useState(1);
  const [prevReports, setPrevReports] = useState(reports);
  if (reports !== prevReports) {
    setPrevReports(reports);
    setPage(1);
  }
  const totalPages = Math.max(1, Math.ceil(reports.length / CASH_DRAWER_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedReports = reports.slice((currentPage - 1) * CASH_DRAWER_PAGE_SIZE, currentPage * CASH_DRAWER_PAGE_SIZE);
  const fmtSettings = settings || getDefaultTenantSettings();

  return (
    <div className="border border-gray-300 bg-white">
      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className={thCls}>{dict.reports?.openingTime || 'Opening Time'}</th>
              <th className={thCls}>{dict.reports?.closingTime || 'Closing Time'}</th>
              <th className={thRight}>{dict.reports?.openingAmount || 'Opening'}</th>
              <th className={thRight}>{dict.reports?.expectedAmount || 'Expected'}</th>
              <th className={thRight}>{dict.reports?.closingAmount || 'Closing'}</th>
              <th className={thRight}>{dict.reports?.shortage || 'Shortage'}</th>
              <th className={thRight}>{dict.reports?.overage || 'Overage'}</th>
              <th className={thCls}>{dict.reports?.status || 'Status'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {pagedReports.map((report, index) => (
              <tr key={report.sessionId || `session-${index}`} className="hover:bg-gray-100 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap text-gray-900">{formatDateTime(report.openingTime, fmtSettings)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                  {report.closingTime ? formatDateTime(report.closingTime, fmtSettings) : '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-900"><Currency amount={report.openingAmount} /></td>
                <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-900">
                  {report.expectedAmount ? <Currency amount={report.expectedAmount} /> : '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-900">
                  {report.closingAmount ? <Currency amount={report.closingAmount} /> : '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                  {report.shortage ? <span className="font-semibold text-win8-danger"><Currency amount={report.shortage} /></span> : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                  {report.overage ? <span className="font-semibold text-win8-success"><Currency amount={report.overage} /></span> : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 py-0.5 text-xs font-semibold capitalize ${CASH_DRAWER_STATUS_BADGE[report.status] || 'bg-gray-500 text-white'}`}>
                    {report.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={currentPage}
        totalPages={totalPages}
        total={reports.length}
        pageSize={CASH_DRAWER_PAGE_SIZE}
        onPage={setPage}
        dict={dict}
      />
    </div>
  );
}

function XReadingView({ data, dict }: { data: XReadingData; dict: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const rows: Array<[string, React.ReactNode]> = [
    [dict.reports?.vatableSales || 'VATable Sales', <Currency key="v" amount={data.vatableSales} />],
    [dict.reports?.vatAmount || 'VAT Amount', <Currency key="va" amount={data.vatAmount} />],
    [dict.reports?.vatExemptSales || 'VAT-Exempt Sales', <Currency key="ve" amount={data.vatExemptSales} />],
    [dict.reports?.zeroRatedSales || 'Zero-Rated Sales', <Currency key="z" amount={data.zeroRatedSales} />],
    [dict.reports?.totalDiscounts || 'Total Discounts', <Currency key="d" amount={data.discountTotal} />],
    [dict.reports?.voidedTransactions || 'Voided/Refunded Transactions', data.voidCount.toLocaleString()],
  ];

  return (
    <div className="space-y-4">
      <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
        {dict.reports?.xReadingDesc || 'A repeatable shift/day sales summary. Does not reset or lock any totals — safe to run any time.'}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label={dict.reports?.grossSales || 'Gross Sales (Today)'} color="bg-brand">
          <Currency amount={data.grossSales} />
        </KpiTile>
        <KpiTile label={dict.reports?.totalTransactions || 'Transactions'} color="bg-win8-success">
          {data.transactionCount.toLocaleString()}
        </KpiTile>
        <KpiTile
          label={dict.reports?.currentGrandTotal || 'Current Grand Total (all-time)'}
          color="bg-win8-accent"
          sub={<span className="font-mono">GT: {formatGrandTotalRegister(data.currentGrandTotal)}</span>}
        >
          <Currency amount={data.currentGrandTotal} />
        </KpiTile>
      </div>
      <div className="bg-white border border-gray-300">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-200">
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td className="px-4 py-3 text-gray-500">{label}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ZReadingView({ readings, dict, onGenerate, generating, settings, canGenerate }: { readings: ZReadingRecord[]; dict: any; onGenerate: () => void; generating: boolean; settings: ReturnType<typeof useTenantSettings>['settings']; canGenerate: boolean }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const fmtSettings = settings || getDefaultTenantSettings();

  return (
    <div className="space-y-4">
      <section className="bg-white border border-gray-300">
        <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-gray-900">{dict.reports?.tabs?.['z-reading'] || 'Z-Reading'}</h2>
            <p className="text-sm text-gray-500">{dict.reports?.zReadingSubtitle || 'Official end-of-day sales report'}</p>
          </div>
          {canGenerate && (
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating}
              className="px-4 py-2 bg-win8-danger text-white text-sm font-medium hover:brightness-110 disabled:opacity-50 transition-[filter]"
            >
              {generating
                ? (dict.reports?.generating || 'Generating…')
                : (dict.reports?.generateZReading || 'Generate Z-Reading for Today')}
            </button>
          )}
        </div>
        <div className="p-6">
          <div className="p-3 bg-white border border-win8-danger text-win8-danger text-sm">
            {dict.reports?.zReadingDesc || 'The official end-of-day sales report. Generating one locks in today\'s totals against the Grand Total accumulator — only one can be generated per business day.'}
          </div>
        </div>
      </section>

      {readings.length === 0 ? (
        <EmptyPanel text={dict.reports?.noZReadings || 'No Z-Readings generated yet.'} />
      ) : (
        <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                <th className={thCls}>{dict.reports?.date || 'Date'}</th>
                <th className={thRight}>{dict.reports?.beginningGT || 'Beginning GT'}</th>
                <th className={thRight}>{dict.reports?.endingGT || 'Ending GT'}</th>
                <th className={thRight}>{dict.reports?.grossSales || 'Gross Sales'}</th>
                <th className={thRight}>{dict.reports?.vatAmount || 'VAT'}</th>
                <th className={thRight}>{dict.reports?.totalTransactions || 'Txns'}</th>
                <th className={thCls}>{dict.reports?.generatedBy || 'Generated By'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {readings.map((r) => (
                <tr key={r.id} className="hover:bg-gray-100 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{formatTenantDate(r.businessDate, fmtSettings)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700"><Currency amount={r.beginningGT} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-medium text-gray-900"><Currency amount={r.endingGT} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-900"><Currency amount={r.grossSales} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700"><Currency amount={r.vatAmount} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700">{r.transactionCount.toLocaleString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                    {typeof r.generatedBy === 'object' && r.generatedBy?.name ? r.generatedBy.name : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const SALES_JOURNAL_PAGE_SIZE = 10;

function SalesJournalView({ data, dict, onExport }: { data: SalesJournalData; dict: any; onExport: (format: 'csv' | 'excel' | 'pdf') => Promise<void> }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<'csv' | 'excel' | 'pdf' | null>(null);
  const [prevEntries, setPrevEntries] = useState(data.entries);
  if (data.entries !== prevEntries) {
    setPrevEntries(data.entries);
    setPage(1);
  }
  const totalPages = Math.max(1, Math.ceil(data.entries.length / SALES_JOURNAL_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedEntries = data.entries.slice((currentPage - 1) * SALES_JOURNAL_PAGE_SIZE, currentPage * SALES_JOURNAL_PAGE_SIZE);

  const runExport = async (format: 'csv' | 'excel' | 'pdf') => {
    setExporting(format);
    try {
      await onExport(format);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (dict.reports?.exportFailed || 'Export failed'));
    } finally {
      setExporting(null);
    }
  };

  const exportLabel = (format: 'csv' | 'excel' | 'pdf', label: string) =>
    exporting === format ? (dict.reports?.exporting || 'Exporting…') : label;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiTile label={dict.reports?.totalTransactions || 'Transactions'} color="bg-brand">
          {data.summary.totalTransactions.toLocaleString()}
        </KpiTile>
        <KpiTile label={dict.reports?.totalSales || 'Total Sales'} color="bg-win8-success">
          <Currency amount={data.summary.totalSales} />
        </KpiTile>
        <KpiTile label={dict.reports?.totalTax || 'Total Tax'} color="bg-win8-accent">
          <Currency amount={data.summary.totalTax} />
        </KpiTile>
        <KpiTile label={dict.reports?.totalDiscounts || 'Total Discounts'} color="bg-win8-warning">
          <Currency amount={data.summary.totalDiscounts} />
        </KpiTile>
        <KpiTile label={dict.reports?.totalTaxExempt || 'Tax Exempt'} color="bg-win8-info">
          <Currency amount={data.summary.totalTaxExempt} />
        </KpiTile>
      </div>

      <div className="border border-gray-300 bg-white">
        <div className="flex items-center justify-end gap-2 flex-wrap p-3 border-b border-gray-300">
          <button type="button" onClick={() => runExport('csv')} disabled={exporting !== null} className={btnSecondary}>
            {exportLabel('csv', dict.reports?.exportCSV || 'Export CSV')}
          </button>
          <button type="button" onClick={() => runExport('excel')} disabled={exporting !== null} className={btnSecondary}>
            {exportLabel('excel', dict.reports?.exportExcel || 'Export Excel')}
          </button>
          <button type="button" onClick={() => runExport('pdf')} disabled={exporting !== null} className={btnSecondary}>
            {exportLabel('pdf', dict.reports?.exportPDF || 'Export PDF')}
          </button>
        </div>
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                <th className={thCls}>{dict.reports?.receiptNo || 'Receipt #'}</th>
                <th className={thCls}>{dict.reports?.date || 'Date'}</th>
                <th className={thCls}>{dict.reports?.time || 'Time'}</th>
                <th className={thCls}>{dict.reports?.items || 'Items'}</th>
                <th className={thRight}>{dict.reports?.subtotal || 'Subtotal'}</th>
                <th className={thRight}>{dict.reports?.discount || 'Discount'}</th>
                <th className={thRight}>{dict.reports?.tax || 'Tax'}</th>
                <th className={thRight}>{dict.reports?.total || 'Total'}</th>
                <th className={thCls}>{dict.reports?.payment || 'Payment'}</th>
                <th className={thCls}>{dict.reports?.status || 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pagedEntries.map((entry, index) => (
                <tr key={entry.receiptNumber || `journal-${index}`} className="hover:bg-gray-100 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-900">{entry.receiptNumber || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-900">{entry.date}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500">{entry.time}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-[240px] truncate" title={entry.items}>{entry.items || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-900"><Currency amount={entry.subtotal} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                    {entry.discountAmount > 0 ? (
                      <>
                        <span className="font-medium text-win8-warning"><Currency amount={entry.discountAmount} /></span>
                        {entry.discountCategory && <span className="block text-xs text-gray-500">{entry.discountCategory}</span>}
                      </>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                    {entry.taxAmount > 0 ? (
                      <span className="text-gray-900"><Currency amount={entry.taxAmount} /></span>
                    ) : entry.taxExemptAmount > 0 ? (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-win8-info text-white">{dict.reports?.exempt || 'EXEMPT'}</span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-semibold text-gray-900"><Currency amount={entry.total} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700 capitalize">{entry.paymentMethod?.replace(/_/g, ' ') || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-xs font-semibold capitalize ${JOURNAL_STATUS_BADGE[entry.status] || 'bg-gray-500 text-white'}`}>
                      {entry.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          total={data.entries.length}
          pageSize={SALES_JOURNAL_PAGE_SIZE}
          onPage={setPage}
          dict={dict}
        />
      </div>
    </div>
  );
}
