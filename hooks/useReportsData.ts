'use client';

import { useCallback, useEffect, useState } from 'react';

export type ReportTab = 'sales' | 'products' | 'vat' | 'profit-loss' | 'cash-drawer' | 'sales-journal';
export type ReportsStatus = 'loading' | 'ready' | 'error';

export interface SalesReport {
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
    on_account: number;
  };
  salesByDay?: Array<{
    date: string;
    sales: number;
    transactions: number;
  }>;
}

export interface ProductPerformance {
  productId: string;
  productName: string;
  totalSold: number;
  totalRevenue: number;
  averagePrice: number;
  quantitySold: number;
  rank: number;
}

export interface VATReport {
  vatSales: number;
  nonVatSales: number;
  vatAmount: number;
  totalSales: number;
  vatRate: number;
}

export interface ProfitLossSummary {
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
    byCategory: Array<{ category: string; amount: number }>;
  };
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
}

export interface CashDrawerReport {
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

export interface SalesJournalEntry {
  receiptNumber: string;
  date: string;
  time: string;
  items: string;
  itemCount: number;
  subtotal: number;
  discountCategory: string;
  discountAmount: number;
  taxExemptAmount: number;
  taxAmount: number;
  total: number;
  paymentMethod: string;
  status: string;
}

export interface SalesJournalData {
  entries: SalesJournalEntry[];
  summary: {
    totalTransactions: number;
    totalSales: number;
    totalTax: number;
    totalDiscounts: number;
    totalTaxExempt: number;
  };
  startDate: string;
  endDate: string;
}

interface UseReportsDataOptions {
  tenant: string;
  activeTab: ReportTab;
  period: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  enabled: boolean;
}

async function fetchJson(url: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const res = await fetch(url);
  return res.json();
}

export function useReportsData({
  tenant,
  activeTab,
  period,
  startDate,
  endDate,
  enabled,
}: UseReportsDataOptions) {
  const [status, setStatus] = useState<ReportsStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [productPerformance, setProductPerformance] = useState<ProductPerformance[]>([]);
  const [vatReport, setVatReport] = useState<VATReport | null>(null);
  const [profitLoss, setProfitLoss] = useState<ProfitLossSummary | null>(null);
  const [cashDrawerReports, setCashDrawerReports] = useState<CashDrawerReport[]>([]);
  const [salesJournal, setSalesJournal] = useState<SalesJournalData | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled || !startDate || !endDate) return;

    setStatus('loading');
    setError(null);

    const dateParams = new URLSearchParams({
      tenant,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
    });

    try {
      switch (activeTab) {
        case 'sales': {
          const params = new URLSearchParams({ ...Object.fromEntries(dateParams), period });
          const data = await fetchJson(`/api/reports/sales?${params}`);
          if (data.success) {
            setSalesReport(data.data as SalesReport);
            setStatus('ready');
          } else {
            setSalesReport(null);
            setError(data.error || 'Failed to load sales report');
            setStatus('error');
          }
          break;
        }
        case 'products': {
          const params = new URLSearchParams({ ...Object.fromEntries(dateParams), limit: '20' });
          const data = await fetchJson(`/api/reports/products?${params}`);
          if (data.success) {
            setProductPerformance((data.data as ProductPerformance[]) || []);
            setStatus('ready');
          } else {
            setProductPerformance([]);
            setError(data.error || 'Failed to load product report');
            setStatus('error');
          }
          break;
        }
        case 'vat': {
          const data = await fetchJson(`/api/reports/vat?${dateParams}`);
          if (data.success) {
            setVatReport(data.data as VATReport);
            setStatus('ready');
          } else {
            setVatReport(null);
            setError(data.error || 'Failed to load VAT report');
            setStatus('error');
          }
          break;
        }
        case 'profit-loss': {
          const data = await fetchJson(`/api/reports/profit-loss?${dateParams}`);
          if (data.success) {
            setProfitLoss(data.data as ProfitLossSummary);
            setStatus('ready');
          } else {
            setProfitLoss(null);
            setError(data.error || 'Failed to load profit & loss report');
            setStatus('error');
          }
          break;
        }
        case 'cash-drawer': {
          const data = await fetchJson(`/api/reports/cash-drawer?${dateParams}`);
          if (data.success) {
            setCashDrawerReports((data.data as CashDrawerReport[]) || []);
            setStatus('ready');
          } else {
            setCashDrawerReports([]);
            setError(data.error || 'Failed to load cash drawer reports');
            setStatus('error');
          }
          break;
        }
        case 'sales-journal': {
          const data = await fetchJson(`/api/reports/sales-journal?${dateParams}`);
          if (data.success) {
            setSalesJournal(data.data as SalesJournalData);
            setStatus('ready');
          } else {
            setSalesJournal(null);
            setError(data.error || 'Failed to load sales journal');
            setStatus('error');
          }
          break;
        }
      }
    } catch (err) {
      console.error('Error loading reports:', err);
      setError('Failed to load report');
      setStatus('error');
    }
  }, [activeTab, enabled, endDate, period, startDate, tenant]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    status,
    error,
    refetch,
    salesReport,
    productPerformance,
    vatReport,
    profitLoss,
    cashDrawerReports,
    salesJournal,
  };
}
