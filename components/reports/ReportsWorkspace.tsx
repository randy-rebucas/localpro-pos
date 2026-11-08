'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { Barcode, LineTag, ReceiptRow } from '@/components/marketing/primitives';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SlipPager from '@/components/ui/SlipPager';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import ReportsTabSkeleton from '@/components/reports/ReportsTabSkeleton';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import Currency from '@/components/Currency';
import { formatGrandTotalRegister } from '@/lib/bir-format';
import { formatDateTime, formatDate as formatTenantDate } from '@/lib/formatting';
import { getDefaultTenantSettings } from '@/lib/currency';
import { getTenantDateString } from '@/lib/timezone';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/lib/confirm';
import toast from 'react-hot-toast';
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
} from '@/hooks/useReportsData';
import type { TranslationDict } from '@/types/dictionary';

type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type TenantSettings = ReturnType<typeof useTenantSettings>['settings'];

const DAY_MS = 86_400_000;
const JOURNAL_ROWS_PER_PAGE = 20;
const DRAWER_ROWS_PER_PAGE = 10;
const PERIOD_BY_DAYS: Partial<Record<number, 'daily' | 'weekly' | 'monthly'>> = { 1: 'daily', 7: 'weekly', 30: 'monthly' };
// Recharts draws SVG, so it needs the token values rather than the Tailwind classes
const CHART_INK = '#10202b';
const CHART_LINE = '#2d868a';
const CHART_TICK = { fontFamily: 'var(--mk-font-receipt)', fontSize: 12, fill: CHART_INK, fillOpacity: 0.6 };

const LABEL = 'mb-1 block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-white/60';
const FIELD = 'w-full min-h-[44px] border-2 border-transparent bg-paper-white px-3 py-2 font-receipt text-sm text-ink focus:border-[#8fe3d0] focus:outline-none';
const TH = 'whitespace-nowrap px-4 py-2 font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60';
const TD = 'whitespace-nowrap px-4 py-2.5 font-receipt text-sm';
const TBODY = 'divide-y divide-dashed divide-ink/20';
const TROW = 'transition-colors hover:bg-paper';

const TAG_TONES = {
  plain: 'border-ink/25 text-ink/70',
  stamp: 'border-stamp font-semibold text-stamp',
  void: 'border-dashed border-ink/40 text-ink/60',
} as const;

function Tag({ tone, children }: { tone: keyof typeof TAG_TONES; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap border px-2 py-0.5 font-receipt text-xs uppercase ${TAG_TONES[tone]}`}>
      {children}
    </span>
  );
}

/** A length of printed paper with a torn bottom edge. */
function Slip({ title, className = '', children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`min-w-0 ${className}`}>
      <div className="bg-paper-white text-ink">
        {title && <h2 className="border-b border-dashed border-ink/30 px-4 py-3 text-3xl sm:px-5">{title}</h2>}
        {children}
      </div>
      <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
    </section>
  );
}

/** A slip wide enough to need sideways scrolling on a phone. */
function TableSlip({ label, footer, children }: { label: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <Slip>
      <div className="overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
        <table className="min-w-full">{children}</table>
      </div>
      {footer}
    </Slip>
  );
}

/** A figure on the till's customer display. Doto has no currency glyphs, so only plain numerals use `led`. */
function Readout({ label, led = false, note, children }: { label: string; led?: boolean; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 border border-white/10 bg-black/30 p-4">
      <p className="font-receipt text-xs uppercase tracking-[0.14em] text-white/60">{label}</p>
      <p className={`mk-led-glow mt-2 break-words text-[#7df0d6] ${led ? 'font-led text-4xl leading-none sm:text-5xl' : 'font-receipt text-2xl font-semibold leading-tight'}`}>
        {children}
      </p>
      {note && <p className="mt-1 break-words font-receipt text-xs text-white/60">{note}</p>}
    </div>
  );
}

interface BarRow {
  label: string;
  value: number;
}

/**
 * Lines on a reading, each with its amount and a bar. With a `total` the bars and
 * percentages are shares of it; without one the bars compare against the largest line.
 */
function Bars({ rows, total, emptyLabel }: { rows: BarRow[]; total?: number; emptyLabel: string }) {
  const scale = total ?? Math.max(0, ...rows.map((row) => row.value));
  if (scale <= 0) {
    return <p className="p-4 font-receipt text-sm text-ink/60 sm:p-5">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-3 p-4 sm:p-5">
      {rows.map((row) => {
        const share = Math.min(100, Math.max(0, (row.value / scale) * 100));
        return (
          <li key={row.label} className="font-receipt text-sm">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 truncate" title={row.label}>{row.label}</span>
              <span className="mk-leader" aria-hidden />
              <Currency amount={row.value} className="whitespace-nowrap font-medium" />
              {total !== undefined && <span className="w-10 shrink-0 text-right text-ink/60">{share.toFixed(0)}%</span>}
            </div>
            <div className="mt-1 h-2 bg-ink/10" aria-hidden>
              <div className="h-full bg-brand-hover" style={{ width: `${share}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const statusLabel = (dict: Dict, status: string) => dict.reports?.statuses?.[status] || status;

const paymentLabel = (dict: Dict, method: string) =>
  dict.pos?.[method === 'on_account' ? 'onAccount' : method] || method;

/**
 * The reports screen on the dark till backdrop: heading, tab keys, date filters and the
 * active report. Pages supply the surrounding shell (navbar or admin console) and the
 * `bg-brand-navy-deep` surface it sits on.
 */
export default function ReportsWorkspace() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const timezone = settings?.timezone;
  const { canAccess } = usePermissions();
  const canViewReports = canAccess('reports.view');
  const canViewXReading = canAccess('reports.x_reading');
  const canViewZReading = canAccess('reports.z_reading');
  const visibleTabs = (['sales', 'products', 'vat', 'profit-loss', 'cash-drawer', 'sales-journal', 'x-reading', 'z-reading'] as const).filter((tab) => {
    if (tab === 'x-reading') return canViewXReading;
    if (tab === 'z-reading') return canViewZReading;
    return canViewReports;
  });
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { confirm, Dialog: confirmDialog } = useConfirm();

  // The dates decide the period, so the dropdown can never disagree with them
  const rangeDays = Math.round((Date.parse(endDate) - Date.parse(startDate)) / DAY_MS) + 1;
  const selectedPeriod = PERIOD_BY_DAYS[rangeDays] ?? 'custom';
  const period = selectedPeriod === 'custom' ? 'daily' : selectedPeriod;

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
  }, [lang]);

  // Default to the last 30 days of the store's calendar (today and 29 before, the
  // same window as the 30-day preset, so the Period select doesn't open on "Custom")
  useEffect(() => {
    setEndDate(getTenantDateString(timezone));
    setStartDate(getTenantDateString(timezone, 29));
  }, [timezone]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0]);
    }
  }, [visibleTabs, activeTab]);

  const handlePeriodChange = (newPeriod: 'daily' | 'weekly' | 'monthly') => {
    const daysBack = { daily: 0, weekly: 6, monthly: 29 }[newPeriod];
    setEndDate(getTenantDateString(timezone));
    setStartDate(getTenantDateString(timezone, daysBack));
  };

  const exportSalesJournal = async (format: 'csv' | 'excel' | 'pdf') => {
    if (format === 'csv') {
      const params = new URLSearchParams({
        tenant,
        format: 'csv',
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });
      window.open(`/api/reports/sales-journal?${params}`, '_blank');
      return;
    }
    if (!salesJournal) return;
    const headers = [
      'receiptNumber', 'date', 'time', 'items', 'itemCount',
      'subtotal', 'discountCategory', 'discountAmount',
      'taxExemptAmount', 'taxAmount', 'total', 'paymentMethod', 'status', 'entryType',
    ];
    const { downloadExcel, downloadPDF } = await import('@/lib/export');
    const filename = `sales-journal-${startDate}-to-${endDate}`;
    // Readable, translated column headings (the export reads each heading as a
    // key, so rows are re-keyed by label; labels must not contain dots)
    const r = (dict?.reports ?? {}) as Record<string, string | undefined>;
    const headingFallback: Record<string, string> = {
      receiptNumber: 'Receipt No', date: 'Date', time: 'Time', items: 'Items', itemCount: 'Item Count',
      subtotal: 'Subtotal', discountCategory: 'Discount Type', discountAmount: 'Discount',
      taxExemptAmount: 'VAT Exempt', taxAmount: 'VAT', total: 'Total', paymentMethod: 'Payment',
      status: 'Status', entryType: 'Entry',
    };
    const labelKey: Record<string, string> = {
      receiptNumber: 'journalReceiptNo', itemCount: 'journalItemCount', discountCategory: 'journalDiscountType',
      discountAmount: 'journalDiscount', taxExemptAmount: 'journalVatExempt', taxAmount: 'journalVat',
      paymentMethod: 'journalPayment', entryType: 'journalEntry',
    };
    const labels = headers.map((h) => (r[labelKey[h] ?? h] || headingFallback[h]).replace(/\./g, ''));
    const rows = (salesJournal.entries as unknown as Record<string, unknown>[]).map((entry) =>
      Object.fromEntries(headers.map((h, i) => [labels[i], entry[h]]))
    );
    const title = r.salesJournal || 'Sales Journal';
    if (format === 'excel') {
      await downloadExcel(rows, labels, filename);
    } else {
      await downloadPDF(rows, labels, filename, title);
    }
  };

  const handleGenerateZReading = async () => {
    const confirmed = await confirm(
      (dict?.reports?.zReadingConfirm as string | undefined) || 'Generate today\'s Z-Reading?',
      (dict?.reports?.zReadingDesc as string | undefined) || 'The official end-of-day sales report. Generating one locks in today\'s totals against the Grand Total accumulator — only one can be generated per business day.',
      {
        confirmText: (dict?.reports?.generate as string | undefined) || 'Generate',
        cancelText: dict?.common?.cancel || 'Cancel',
        variant: 'warning',
      }
    );
    if (!confirmed) return;

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
      <div className="flex min-h-[60dvh] items-center justify-center">
        <LoadingSpinner size="md" color="#8fe3d0" />
      </div>
    );
  }

  const reportsDict = dict.reports ?? {};
  const noDataLabel = reportsDict.noData || 'No data available for the selected period';

  // The X-Reading covers one business day and the Z-Reading always lists the latest records
  const usesRange = activeTab !== 'x-reading' && activeTab !== 'z-reading';

  const renderEmptyState = (title: string) => (
    <Slip>
      <EmptyState icon="products" title={title} />
    </Slip>
  );

  const renderTabContent = () => {
    if (visibleTabs.length === 0) {
      return renderEmptyState((reportsDict.noPermission as string | undefined) || 'You don\'t have permission to view reports');
    }

    if (status === 'loading') {
      return <ReportsTabSkeleton />;
    }

    if (status === 'error') {
      return (
        <Slip>
          <ErrorState
            title={reportsDict.failedToLoadReports || 'Failed to load report'}
            description={error || undefined}
            onRetry={refetch}
            retryLabel={dict.common.retry || 'Retry'}
          />
        </Slip>
      );
    }

    switch (activeTab) {
      case 'sales':
        return salesReport ? (
          <SalesReportView report={salesReport} dict={dict} />
        ) : (
          renderEmptyState(noDataLabel)
        );
      case 'products':
        return productPerformance.length > 0 ? (
          <ProductPerformanceView data={productPerformance} dict={dict} />
        ) : (
          renderEmptyState(noDataLabel)
        );
      case 'vat':
        return vatReport ? (
          <VATReportView report={vatReport} dict={dict} />
        ) : (
          renderEmptyState(noDataLabel)
        );
      case 'profit-loss':
        return profitLoss ? (
          <ProfitLossView summary={profitLoss} dict={dict} />
        ) : (
          renderEmptyState(noDataLabel)
        );
      case 'cash-drawer':
        return cashDrawerReports.length > 0 ? (
          <CashDrawerReportView key={`${startDate}-${endDate}`} reports={cashDrawerReports} dict={dict} settings={settings} />
        ) : (
          renderEmptyState(reportsDict.noCashDrawerReports || 'No cash drawer reports found')
        );
      case 'sales-journal':
        return salesJournal && salesJournal.entries.length > 0 ? (
          <SalesJournalView key={`${salesJournal.startDate}-${salesJournal.endDate}`} data={salesJournal} dict={dict} onExport={exportSalesJournal} />
        ) : (
          renderEmptyState(noDataLabel)
        );
      case 'x-reading':
        return xReading ? (
          <XReadingView data={xReading} dict={dict} settings={settings} />
        ) : (
          renderEmptyState(noDataLabel)
        );
      case 'z-reading':
        return (
          <ZReadingView
            readings={zReadings}
            dict={dict}
            onGenerate={handleGenerateZReading}
            generating={generatingZReading}
            settings={settings}
            canGenerate={canViewZReading}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            {settings?.companyName && (
              <LineTag no="RP" className="mb-3 text-[#8fe3d0]">{settings.companyName}</LineTag>
            )}
            <h1 className="text-5xl text-paper-white sm:text-6xl lg:text-7xl">
              {reportsDict.title || 'Reports & Analytics'}
            </h1>
            <p className="mt-3 text-paper/70">
              {reportsDict.subtitle || 'View detailed reports and analytics for your business'}
            </p>
          </div>
          {usesRange && (
            <div className="flex items-center gap-3 border border-white/10 bg-black/30 px-4 py-2">
              <span className="mk-led-glow font-led text-4xl leading-none text-[#7df0d6]">
                {rangeDays > 0 ? rangeDays : '---'}
              </span>
              <span className="font-receipt text-xs uppercase tracking-[0.14em] text-white/60">{(reportsDict.days as string | undefined) || 'Days'}</span>
            </div>
          )}
        </div>

        <nav
          className="mt-6 grid grid-cols-2 border-l border-t border-white/25 sm:grid-cols-4 xl:auto-cols-fr xl:grid-flow-col xl:grid-cols-none"
          aria-label={dict.common?.tabs || 'Tabs'}
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-pressed={activeTab === tab}
              className={`flex min-h-[44px] items-center justify-center border-b border-r border-white/25 px-2 py-2 text-center font-receipt text-xs font-medium uppercase transition-colors touch-manipulation ${activeTab === tab ? 'bg-paper-white text-ink' : 'text-paper hover:bg-white/10'}`}
            >
              {reportsDict.tabs?.[tab] || tab.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
            </button>
          ))}
        </nav>

        {activeTab !== 'z-reading' && (
          <div className="mt-3 grid grid-cols-2 gap-3 border border-white/10 bg-black/20 p-3 md:flex md:flex-wrap">
            {usesRange && (
              <div className="md:w-52">
                <label htmlFor="reports-start" className={LABEL}>{reportsDict.startDate || 'Start Date'}</label>
                <input id="reports-start" type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} className={FIELD} />
              </div>
            )}
            <div className={`md:w-52 ${usesRange ? '' : 'col-span-2'}`}>
              <label htmlFor="reports-end" className={LABEL}>
                {usesRange ? (reportsDict.endDate || 'End Date') : ((reportsDict.date as string | undefined) || 'Date')}
              </label>
              <input id="reports-end" type="date" value={endDate} min={usesRange ? startDate || undefined : undefined} onChange={(e) => setEndDate(e.target.value)} className={FIELD} />
            </div>
            {activeTab === 'sales' && (
              <div className="col-span-2 md:w-52">
                <label htmlFor="reports-period" className={LABEL}>{reportsDict.period || 'Period'}</label>
                <select
                  id="reports-period"
                  value={selectedPeriod}
                  onChange={(e) => handlePeriodChange(e.target.value as 'daily' | 'weekly' | 'monthly')}
                  className={FIELD}
                >
                  <option value="daily">{reportsDict.daily || 'Daily'}</option>
                  <option value="weekly">{reportsDict.weekly || 'Weekly'}</option>
                  <option value="monthly">{reportsDict.monthly || 'Monthly'}</option>
                  {selectedPeriod === 'custom' && <option value="custom" disabled>{(reportsDict.custom as string | undefined) || 'Custom'}</option>}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="mt-6">{renderTabContent()}</div>
      </div>
      {confirmDialog}
    </>
  );
}

const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

function SalesTooltip({ active, payload, transactionsLabel }: {
  active?: boolean;
  payload?: readonly { payload?: { date: string; sales: number; transactions: number } }[];
  transactionsLabel: string;
}) {
  const day = payload?.[0]?.payload;
  if (!active || !day) return null;
  return (
    <div className="border border-ink bg-paper-white px-3 py-2 font-receipt text-xs text-ink">
      <p className="font-semibold">{day.date}</p>
      <p className="mt-1 text-sm font-semibold"><Currency amount={day.sales} /></p>
      <p className="text-ink/60">{transactionsLabel}: {day.transactions}</p>
    </div>
  );
}

function SalesReportView({ report, dict }: { report: SalesReport; dict: Dict }) {
  const reduceMotion = useReducedMotion();
  const paymentRows = [
    { label: dict.pos?.cash || 'Cash', value: report.salesByPaymentMethod.cash },
    { label: dict.pos?.card || 'Card', value: report.salesByPaymentMethod.card },
    { label: dict.pos?.digital || 'Digital', value: report.salesByPaymentMethod.digital },
    { label: dict.pos?.onAccount || 'On account', value: report.salesByPaymentMethod.on_account ?? 0 },
  ].filter((row) => row.value > 0);
  const paymentTotal = paymentRows.reduce((sum, row) => sum + row.value, 0);
  const salesByDay = report.salesByDay ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Readout label={dict.reports?.totalSales || 'Total Sales'}><Currency amount={report.totalSales} /></Readout>
        <Readout led label={dict.reports?.totalTransactions || 'Total Transactions'}>{report.totalTransactions}</Readout>
        <Readout label={dict.reports?.averageTransaction || 'Average Transaction'}><Currency amount={report.averageTransaction} /></Readout>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
        {salesByDay.length > 0 && (
          <Slip title={dict.reports?.salesByDay || 'Sales by Day'} className="xl:col-span-8">
            <div className="p-4 sm:p-5">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={salesByDay} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART_INK} strokeOpacity={0.12} strokeDasharray="2 4" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date: string) => date.slice(5)}
                    tick={CHART_TICK}
                    tickLine={false}
                    axisLine={{ stroke: CHART_INK, strokeOpacity: 0.3 }}
                    minTickGap={24}
                  />
                  <YAxis
                    tickFormatter={(value: number) => compactNumber.format(value)}
                    tick={CHART_TICK}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />
                  <Tooltip
                    content={(props) => (
                      <SalesTooltip
                        active={props.active}
                        payload={props.payload as Parameters<typeof SalesTooltip>[0]['payload']}
                        transactionsLabel={dict.reports?.totalTransactions || 'Transactions'}
                      />
                    )}
                    cursor={{ stroke: CHART_INK, strokeOpacity: 0.3 }}
                  />
                  <Line
                    type="linear"
                    dataKey="sales"
                    stroke={CHART_LINE}
                    strokeWidth={2}
                    dot={salesByDay.length === 1 ? { r: 4, fill: CHART_LINE, strokeWidth: 0 } : false}
                    activeDot={{ r: 5, fill: CHART_LINE, stroke: '#fdfbf6', strokeWidth: 2 }}
                    isAnimationActive={!reduceMotion}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Slip>
        )}

        <Slip
          title={dict.reports?.paymentMethods || 'Payment Methods'}
          className={salesByDay.length > 0 ? 'xl:col-span-4' : 'xl:col-span-6'}
        >
          <Bars rows={paymentRows} total={paymentTotal} emptyLabel={dict.reports?.noData || 'No data available for the selected period'} />
        </Slip>
      </div>
    </div>
  );
}

function ProductPerformanceView({ data, dict }: { data: ProductPerformance[]; dict: Dict }) {
  const topProducts = data.slice(0, 10).map((product) => ({
    label: `${product.rank}. ${product.productName}`,
    value: product.totalRevenue,
  }));

  return (
    <div className="space-y-6">
      <Slip title={dict.reports?.topProducts || 'Top Products'}>
        <Bars rows={topProducts} emptyLabel={dict.reports?.noData || 'No data available for the selected period'} />
      </Slip>

      <TableSlip label={dict.reports?.topProducts || 'Top Products'}>
        <thead className="border-b border-dashed border-ink/30">
          <tr>
            <th scope="col" className={`${TH} text-left`}>{dict.reports?.rank || 'Rank'}</th>
            <th scope="col" className={`${TH} text-left`}>{dict.products?.name || 'Product'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.quantitySold || 'Quantity Sold'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.totalRevenue || 'Revenue'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.averagePrice || 'Avg Price'}</th>
          </tr>
        </thead>
        <tbody className={TBODY}>
          {data.map((product, index) => (
            <tr key={product.productId || `product-${index}`} className={TROW}>
              <td className={`${TD} font-medium`}>#{product.rank}</td>
              <td className={TD}>{product.productName}</td>
              <td className={`${TD} text-right text-ink/70`}>{product.quantitySold}</td>
              <td className={`${TD} text-right font-medium`}><Currency amount={product.totalRevenue} /></td>
              <td className={`${TD} text-right text-ink/70`}><Currency amount={product.averagePrice} /></td>
            </tr>
          ))}
        </tbody>
      </TableSlip>
    </div>
  );
}

function VATReportView({ report, dict }: { report: VATReport; dict: Dict }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Readout label={dict.reports?.vatSales || 'VAT Sales'}><Currency amount={report.vatSales} /></Readout>
        <Readout label={dict.reports?.nonVatSales || 'Non-VAT Sales'}><Currency amount={report.nonVatSales} /></Readout>
        <Readout label={dict.reports?.vatAmount || 'VAT Amount'}><Currency amount={report.vatAmount} /></Readout>
        <Readout led label={dict.reports?.vatRate || 'VAT Rate'}>{report.vatRate}%</Readout>
      </div>

      <Slip title={dict.reports?.vatBreakdown || 'VAT Breakdown'} className="max-w-2xl">
        <Bars
          rows={[
            { label: dict.reports?.vatSales || 'VAT Sales', value: report.vatSales },
            { label: dict.reports?.nonVatSales || 'Non-VAT Sales', value: report.nonVatSales },
          ]}
          total={report.vatSales + report.nonVatSales}
          emptyLabel={dict.reports?.noData || 'No data available for the selected period'}
        />
      </Slip>
    </div>
  );
}

function ProfitLossView({ summary, dict }: { summary: ProfitLossSummary; dict: Dict }) {
  const emptyLabel = dict.reports?.noData || 'No data available for the selected period';
  const { total, cash, card, digital } = summary.revenue;
  // The total counts every tender, but only these three are broken out by the API
  const otherRevenue = total - cash - card - digital;
  const revenueRows = [
    { label: dict.pos?.cash || 'Cash', value: cash },
    { label: dict.pos?.card || 'Card', value: card },
    { label: dict.pos?.digital || 'Digital', value: digital },
    ...(otherRevenue > 0.005 ? [{ label: dict.reports?.otherMethods || 'Other methods', value: otherRevenue }] : []),
  ];
  const expenseRows = summary.expenses.byCategory
    .map((category) => ({ label: category.category, value: category.amount }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Readout label={dict.reports?.totalRevenue || 'Total Revenue'}><Currency amount={total} /></Readout>
        <Readout label={dict.reports?.totalExpenses || 'Total Expenses'}><Currency amount={summary.expenses.total} /></Readout>
        <Readout label={dict.reports?.netProfit || 'Net Profit'}><Currency amount={summary.netProfit} /></Readout>
        <Readout led label={dict.reports?.profitMargin || 'Profit Margin'}>{summary.profitMargin.toFixed(2)}%</Readout>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Slip title={dict.reports?.revenueByPaymentMethod || 'Revenue by Payment Method'}>
          <Bars rows={revenueRows} total={total} emptyLabel={emptyLabel} />
        </Slip>
        {expenseRows.length > 0 && (
          <Slip title={dict.reports?.expensesByCategory || 'Expenses by Category'}>
            <Bars rows={expenseRows} total={summary.expenses.total} emptyLabel={emptyLabel} />
          </Slip>
        )}
      </div>
    </div>
  );
}

function CashDrawerReportView({ reports, dict, settings }: { reports: CashDrawerReport[]; dict: Dict; settings: TenantSettings }) {
  const dateSettings = settings || getDefaultTenantSettings();
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(reports.length / DRAWER_ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const firstRow = (currentPage - 1) * DRAWER_ROWS_PER_PAGE;
  return (
    <TableSlip
      label={dict.reports?.tabs?.['cash-drawer'] || 'Cash Drawer'}
      footer={
        <SlipPager
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          label={dict.admin?.page || 'Page'}
          previousLabel={dict.common?.previous || 'Previous'}
          nextLabel={dict.common?.next || 'Next'}
        />
      }
    >
      <thead className="border-b border-dashed border-ink/30">
        <tr>
          <th scope="col" className={`${TH} text-left`}>{dict.reports?.openingTime || 'Opening Time'}</th>
          <th scope="col" className={`${TH} text-left`}>{dict.reports?.closingTime || 'Closing Time'}</th>
          <th scope="col" className={`${TH} text-right`}>{dict.reports?.openingAmount || 'Opening'}</th>
          <th scope="col" className={`${TH} text-right`}>{dict.reports?.expectedAmount || 'Expected'}</th>
          <th scope="col" className={`${TH} text-right`}>{dict.reports?.closingAmount || 'Closing'}</th>
          <th scope="col" className={`${TH} text-right`}>{dict.reports?.shortage || 'Shortage'}</th>
          <th scope="col" className={`${TH} text-right`}>{dict.reports?.overage || 'Overage'}</th>
          <th scope="col" className={`${TH} text-left`}>{dict.reports?.status || 'Status'}</th>
        </tr>
      </thead>
      <tbody className={TBODY}>
        {reports.slice(firstRow, firstRow + DRAWER_ROWS_PER_PAGE).map((report, index) => (
          <tr key={report.sessionId || `session-${firstRow + index}`} className={TROW}>
            <td className={TD}>{formatDateTime(report.openingTime, dateSettings)}</td>
            <td className={`${TD} text-ink/70`}>{report.closingTime ? formatDateTime(report.closingTime, dateSettings) : '-'}</td>
            <td className={`${TD} text-right`}><Currency amount={report.openingAmount} /></td>
            <td className={`${TD} text-right`}>{report.expectedAmount ? <Currency amount={report.expectedAmount} /> : '-'}</td>
            <td className={`${TD} text-right`}>{report.closingAmount ? <Currency amount={report.closingAmount} /> : '-'}</td>
            <td className={`${TD} text-right ${report.shortage ? 'font-semibold text-stamp' : ''}`}>{report.shortage ? <Currency amount={report.shortage} /> : '-'}</td>
            <td className={`${TD} text-right ${report.overage ? 'font-semibold text-brand-hover' : ''}`}>{report.overage ? <Currency amount={report.overage} /> : '-'}</td>
            <td className={TD}>
              <Tag tone={report.status === 'closed' ? 'plain' : 'void'}>{statusLabel(dict, report.status)}</Tag>
            </td>
          </tr>
        ))}
      </tbody>
    </TableSlip>
  );
}

function XReadingView({ data, dict, settings }: { data: XReadingData; dict: Dict; settings: TenantSettings }) {
  const dateSettings = settings || getDefaultTenantSettings();
  const lines: { label: ReactNode; value: ReactNode }[] = [
    { label: dict.reports?.vatableSales || 'VATable Sales', value: <Currency amount={data.vatableSales} /> },
    { label: dict.reports?.vatAmount || 'VAT Amount', value: <Currency amount={data.vatAmount} /> },
    { label: dict.reports?.vatExemptSales || 'VAT-Exempt Sales', value: <Currency amount={data.vatExemptSales} /> },
    { label: dict.reports?.zeroRatedSales || 'Zero-Rated Sales', value: <Currency amount={data.zeroRatedSales} /> },
    { label: dict.reports?.totalDiscounts || 'Total Discounts', value: <Currency amount={data.discountTotal} /> },
    { label: `${dict.reports?.refundsPaid || 'Refunds Paid'} (${data.refundCount})`, value: <Currency amount={data.refundTotal} /> },
    { label: dict.reports?.refundVat || 'VAT on Refunds', value: <Currency amount={data.refundVatAmount} /> },
    { label: dict.reports?.voidedTransactions || 'Voided Transactions', value: data.voidCount },
  ];

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-paper/70">
        {dict.reports?.xReadingDesc || 'A repeatable shift/day sales summary. Does not reset or lock any totals — safe to run any time.'}
      </p>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
          <Readout label={dict.reports?.grossSales || 'Gross Sales (Today)'}><Currency amount={data.grossSales} /></Readout>
          <Readout led label={dict.reports?.totalTransactions || 'Transactions'}>{data.transactionCount}</Readout>
          <div className="sm:col-span-2 lg:col-span-1">
            <Readout
              label={dict.reports?.currentGrandTotal || 'Current Grand Total (all-time)'}
              note={`GT: ${formatGrandTotalRegister(data.currentGrandTotal)}`}
            >
              <Currency amount={data.currentGrandTotal} />
            </Readout>
          </div>
        </div>

        <Slip className="lg:col-span-7">
          <div className="p-5 sm:p-6">
            {settings?.companyName && (
              <p className="font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">{settings.companyName}</p>
            )}
            <h2 className="mt-1 text-4xl">{dict.reports?.tabs?.['x-reading'] || 'X-Reading'}</h2>
            <p className="mt-1 font-receipt text-xs text-ink/60">{formatTenantDate(data.startDate, dateSettings)}</p>

            <div className="mt-4 space-y-1.5 border-t border-dashed border-ink/30 pt-4 font-receipt text-sm">
              {lines.map((line, index) => <ReceiptRow key={index} label={line.label} value={line.value} />)}
            </div>
            <div className="mt-4 border-t border-dashed border-ink/30 pt-4 font-receipt text-lg">
              <ReceiptRow strong label={dict.reports?.netSales || 'Net Sales'} value={<Currency amount={data.netSales} />} />
            </div>
            <Barcode className="mt-5 h-8 w-40 text-ink/80" />
          </div>
        </Slip>
      </div>
    </div>
  );
}

function ZReadingView({ readings, dict, onGenerate, generating, settings, canGenerate }: {
  readings: ZReadingRecord[];
  dict: Dict;
  onGenerate: () => void;
  generating: boolean;
  settings: TenantSettings;
  canGenerate: boolean;
}) {
  const dateSettings = settings || getDefaultTenantSettings();
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-paper/70">
          {dict.reports?.zReadingDesc || 'The official end-of-day sales report. Generating one locks in today\'s totals against the Grand Total accumulator — only one can be generated per business day.'}
        </p>
        {canGenerate && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="flex min-h-[44px] shrink-0 items-center justify-center bg-paper-white px-5 font-receipt text-xs font-medium uppercase text-ink transition-colors hover:bg-paper touch-manipulation disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          >
            {generating ? (dict.common?.loading || 'Generating...') : (dict.reports?.generateZReading || 'Generate Z-Reading for Today')}
          </button>
        )}
      </div>
      <TableSlip label={dict.reports?.tabs?.['z-reading'] || 'Z-Reading'}>
        <thead className="border-b border-dashed border-ink/30">
          <tr>
            <th scope="col" className={`${TH} text-left`}>{dict.reports?.date || 'Date'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.beginningGT || 'Beginning GT'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.endingGT || 'Ending GT'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.grossSales || 'Gross Sales'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.refundsPaid || 'Refunds Paid'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.netSales || 'Net Sales'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.vatAmount || 'VAT'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.totalTransactions || 'Txns'}</th>
            <th scope="col" className={`${TH} text-left`}>{dict.reports?.generatedBy || 'Generated By'}</th>
          </tr>
        </thead>
        <tbody className={TBODY}>
          {readings.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center font-receipt text-sm text-ink/60">
                {dict.reports?.noZReadings || 'No Z-Readings generated yet'}
              </td>
            </tr>
          ) : (
            readings.map((r) => (
              <tr key={r._id} className={TROW}>
                <td className={TD}>{formatTenantDate(r.businessDate, dateSettings)}</td>
                <td className={`${TD} text-right text-ink/70`}><Currency amount={r.beginningGT} /></td>
                <td className={`${TD} text-right font-semibold`}><Currency amount={r.endingGT} /></td>
                <td className={`${TD} text-right`}><Currency amount={r.grossSales} /></td>
                <td className={`${TD} text-right text-ink/70`}><Currency amount={r.refundTotal ?? 0} /></td>
                <td className={`${TD} text-right`}><Currency amount={r.netSales ?? r.grossSales} /></td>
                <td className={`${TD} text-right text-ink/70`}><Currency amount={r.vatAmount} /></td>
                <td className={`${TD} text-right text-ink/70`}>{r.transactionCount}</td>
                <td className={`${TD} text-ink/70`}>{r.autoGenerated ? (dict.reports?.generatedAutomatically || 'Automatic') : typeof r.generatedBy === 'object' ? r.generatedBy?.name : '-'}</td>
              </tr>
            ))
          )}
        </tbody>
      </TableSlip>
    </div>
  );
}

function SalesJournalView({ data, dict, onExport }: { data: SalesJournalData; dict: Dict; onExport: (format: 'csv' | 'excel' | 'pdf') => void }) {
  // Only the table pages. The summary and exports always cover the whole date range.
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.entries.length / JOURNAL_ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const firstRow = (currentPage - 1) * JOURNAL_ROWS_PER_PAGE;
  const exports = [
    { format: 'csv', label: 'CSV', title: dict.reports?.exportCSV || 'Export CSV' },
    { format: 'excel', label: 'Excel', title: dict.reports?.exportExcel || 'Export Excel' },
    { format: 'pdf', label: 'PDF', title: dict.reports?.exportPDF || 'Export PDF' },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Readout led label={dict.reports?.totalTransactions || 'Transactions'}>{data.summary.totalTransactions}</Readout>
        <Readout label={dict.reports?.totalSales || 'Total Sales'}><Currency amount={data.summary.totalSales} /></Readout>
        <Readout label={dict.reports?.totalTax || 'Total Tax'}><Currency amount={data.summary.totalTax} /></Readout>
        <Readout label={dict.reports?.totalDiscounts || 'Total Discounts'}><Currency amount={data.summary.totalDiscounts} /></Readout>
        <Readout label={dict.reports?.totalTaxExempt || 'Tax Exempt'}><Currency amount={data.summary.totalTaxExempt} /></Readout>
      </div>

      <div role="group" aria-label={dict.transactions?.exportLabel || 'Export'} className="flex divide-x divide-white/25 border border-white/25 sm:inline-flex">
        <span className="flex items-center px-3 text-white/60" title={dict.transactions?.exportLabel || 'Export'}>
          <Download className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        {exports.map(({ format, label, title }) => (
          <button
            key={format}
            type="button"
            onClick={() => onExport(format)}
            title={title}
            aria-label={title}
            className="flex min-h-[44px] flex-1 items-center justify-center px-4 font-receipt text-xs font-medium uppercase text-paper transition-colors hover:bg-white/10 touch-manipulation sm:flex-none"
          >
            {label}
          </button>
        ))}
      </div>

      <TableSlip
        label={dict.reports?.tabs?.['sales-journal'] || 'Sales Journal'}
        footer={
          <SlipPager
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
            label={dict.admin?.page || 'Page'}
            previousLabel={dict.common?.previous || 'Previous'}
            nextLabel={dict.common?.next || 'Next'}
          />
        }
      >
        <thead className="border-b border-dashed border-ink/30">
          <tr>
            <th scope="col" className={`${TH} text-left`}>{dict.reports?.receiptNo || 'Receipt #'}</th>
            <th scope="col" className={`${TH} text-left`}>{dict.reports?.date || 'Date'}</th>
            <th scope="col" className={`${TH} text-left`}>{dict.reports?.time || 'Time'}</th>
            <th scope="col" className={`${TH} text-left`}>{dict.reports?.items || 'Items'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.subtotal || 'Subtotal'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.discount || 'Discount'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.tax || 'Tax'}</th>
            <th scope="col" className={`${TH} text-right`}>{dict.reports?.total || 'Total'}</th>
            <th scope="col" className={`${TH} text-left`}>{dict.reports?.payment || 'Payment'}</th>
            <th scope="col" className={`${TH} text-left`}>{dict.reports?.status || 'Status'}</th>
          </tr>
        </thead>
        <tbody className={TBODY}>
          {data.entries.slice(firstRow, firstRow + JOURNAL_ROWS_PER_PAGE).map((entry, index) => {
            const refund = entry.entryType === 'refund';
            const tone = refund || entry.status === 'refunded' ? 'stamp' : entry.status === 'completed' ? 'plain' : 'void';
            return (
              <tr key={`${entry.receiptNumber}-${entry.entryType}-${firstRow + index}`} className={TROW}>
                <td className={`${TD} font-medium`}>{entry.receiptNumber || '-'}</td>
                <td className={TD}>{entry.date}</td>
                <td className={`${TD} text-ink/70`}>{entry.time}</td>
                <td className={`${TD} max-w-xs truncate text-ink/70`} title={entry.items}>{entry.items || '-'}</td>
                <td className={`${TD} text-right`}><Currency amount={entry.subtotal} /></td>
                <td className={`${TD} text-right`}>
                  {entry.discountAmount !== 0 ? <><Currency amount={entry.discountAmount} /> {entry.discountCategory && <span className="text-xs text-ink/60">({entry.discountCategory})</span>}</> : '-'}
                </td>
                <td className={`${TD} text-right`}>
                  {entry.taxAmount !== 0 ? <Currency amount={entry.taxAmount} /> : entry.taxExemptAmount !== 0 ? <span className="text-xs uppercase text-ink/60">{dict.reports?.exempt || 'Exempt'}</span> : '-'}
                </td>
                <td className={`${TD} text-right font-semibold`}><Currency amount={entry.total} /></td>
                <td className={`${TD} text-ink/70`}>{paymentLabel(dict, entry.paymentMethod)}</td>
                <td className={TD}>
                  <Tag tone={tone}>{statusLabel(dict, refund ? 'refund' : entry.status)}</Tag>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableSlip>
    </div>
  );
}
