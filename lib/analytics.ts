/**
 * Analytics and Reporting Utilities
 */

import prisma from '@/lib/prisma';
import { ITenantSettings } from '@/types/tenant';

export interface SalesReport {
  period: string;
  startDate: Date;
  endDate: Date;
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
  startDate: Date;
  endDate: Date;
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

export interface CashDrawerReport {
  sessionId: string;
  userId: string;
  userName?: string;
  openingTime: Date;
  closingTime?: Date;
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

export async function getSalesReport(
  tenantId: string,
  period: 'daily' | 'weekly' | 'monthly',
  startDate?: Date,
  endDate?: Date
): Promise<SalesReport> {
  const now = new Date();
  let start: Date;
  let end: Date = now;

  if (startDate && endDate) {
    start = startDate;
    end = endDate;
  } else {
    switch (period) {
      case 'daily':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        const dayOfWeek = now.getDay();
        start = new Date(now);
        start.setDate(now.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      tenantId,
      createdAt: { gte: start, lte: end },
      status: 'completed',
    },
    select: {
      total: true,
      paymentMethod: true,
      createdAt: true,
    },
  });

  const totals = transactions.map((t) => ({
    total: Number(t.total),
    paymentMethod: t.paymentMethod,
    createdAt: t.createdAt,
  }));

  const totalSales = totals.reduce((sum, t) => sum + t.total, 0);
  const totalTransactions = totals.length;
  const averageTransaction = totalTransactions > 0 ? totalSales / totalTransactions : 0;

  const digitalLike = ['digital', 'tap_to_pay', 'wallet', 'qr_code', 'bnpl'] as const;
  const salesByPaymentMethod = {
    cash: totals.filter((t) => t.paymentMethod === 'cash').reduce((sum, t) => sum + t.total, 0),
    card: totals.filter((t) => t.paymentMethod === 'card').reduce((sum, t) => sum + t.total, 0),
    digital: totals
      .filter((t) => digitalLike.includes(t.paymentMethod as (typeof digitalLike)[number]))
      .reduce((sum, t) => sum + t.total, 0),
    on_account: totals
      .filter((t) => t.paymentMethod === 'on_account')
      .reduce((sum, t) => sum + t.total, 0),
  };

  // Sales by day for detailed reports
  const salesByDay: Array<{ date: string; sales: number; transactions: number }> = [];
  if (period === 'daily' || period === 'weekly') {
    const dayMap = new Map<string, { sales: number; transactions: number }>();

    totals.forEach(t => {
      const dateStr = new Date(t.createdAt).toISOString().split('T')[0];
      const existing = dayMap.get(dateStr) || { sales: 0, transactions: 0 };
      dayMap.set(dateStr, {
        sales: existing.sales + t.total,
        transactions: existing.transactions + 1,
      });
    });

    dayMap.forEach((value, date) => {
      salesByDay.push({ date, ...value });
    });

    salesByDay.sort((a, b) => a.date.localeCompare(b.date));
  }

  return {
    period,
    startDate: start,
    endDate: end,
    totalSales,
    totalTransactions,
    averageTransaction,
    salesByPaymentMethod,
    salesByDay: salesByDay.length > 0 ? salesByDay : undefined,
  };
}

export async function getProductPerformance(
  tenantId: string,
  startDate: Date,
  endDate: Date,
  limit: number = 10
): Promise<ProductPerformance[]> {
  const items = await prisma.transactionItem.findMany({
    where: {
      transaction: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
        status: 'completed',
      },
    },
    select: {
      productId: true,
      name: true,
      subtotal: true,
      quantity: true,
    },
  });

  const productMap = new Map<string, {
    productId: string;
    productName: string;
    totalRevenue: number;
    quantitySold: number;
    transactions: number;
  }>();

  items.forEach(item => {
    const productId = item.productId || 'unknown';
    const productName = item.name || 'Unknown';

    const existing = productMap.get(productId) || {
      productId,
      productName,
      totalRevenue: 0,
      quantitySold: 0,
      transactions: 0,
    };

    existing.totalRevenue += Number(item.subtotal);
    existing.quantitySold += item.quantity;
    existing.transactions += 1;

    productMap.set(productId, existing);
  });

  const performances: ProductPerformance[] = Array.from(productMap.values())
    .map(p => ({
      productId: p.productId,
      productName: p.productName,
      totalSold: p.quantitySold,
      totalRevenue: p.totalRevenue,
      averagePrice: p.quantitySold > 0 ? p.totalRevenue / p.quantitySold : 0,
      quantitySold: p.quantitySold,
      rank: 0, // Will be set after sorting
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit)
    .map((p, index) => ({ ...p, rank: index + 1 }));

  return performances;
}

export async function getVATReport(
  tenantId: string,
  startDate: Date,
  endDate: Date,
  settings: ITenantSettings
): Promise<VATReport> {
  const agg = await prisma.transaction.aggregate({
    where: {
      tenantId,
      createdAt: { gte: startDate, lte: endDate },
      status: 'completed',
    },
    _sum: { total: true },
  });

  const vatRate = settings.taxEnabled && settings.taxRate ? settings.taxRate / 100 : 0;

  const totalSales = Number(agg._sum.total || 0);

  if (vatRate > 0) {
    // Calculate base amount (without VAT)
    const baseAmount = totalSales / (1 + vatRate);
    const vatAmount = totalSales - baseAmount;

    return {
      vatSales: baseAmount,
      nonVatSales: 0,
      vatAmount,
      totalSales,
      vatRate: vatRate * 100,
    };
  } else {
    return {
      vatSales: 0,
      nonVatSales: totalSales,
      vatAmount: 0,
      totalSales,
      vatRate: 0,
    };
  }
}

export async function getProfitLossSummary(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<ProfitLossSummary> {
  const transactions = await prisma.transaction.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate, lte: endDate },
      status: 'completed',
    },
    select: {
      total: true,
      paymentMethod: true,
    },
  });

  const expenses = await prisma.expense.findMany({
    where: {
      tenantId,
      date: { gte: startDate, lte: endDate },
      isActive: true,
    },
    select: {
      name: true,
      amount: true,
    },
  });

  const totals = transactions.map((t) => ({ total: Number(t.total), paymentMethod: t.paymentMethod }));

  const revenue = {
    total: totals.reduce((sum, t) => sum + t.total, 0),
    cash: totals.filter(t => t.paymentMethod === 'cash').reduce((sum, t) => sum + t.total, 0),
    card: totals.filter(t => t.paymentMethod === 'card').reduce((sum, t) => sum + t.total, 0),
    digital: totals.filter(t => t.paymentMethod === 'digital').reduce((sum, t) => sum + t.total, 0),
  };

  const expenseAmounts = expenses.map((e) => ({ name: e.name, amount: Number(e.amount) }));
  const expenseTotal = expenseAmounts.reduce((sum, e) => sum + e.amount, 0);

  const expenseByCategory = new Map<string, number>();
  expenseAmounts.forEach(expense => {
    // Use expense name as category since Expense model doesn't have a category field
    const category = expense.name || 'Other';
    const existing = expenseByCategory.get(category) || 0;
    expenseByCategory.set(category, existing + expense.amount);
  });

  const expensesData = {
    total: expenseTotal,
    byCategory: Array.from(expenseByCategory.entries()).map(([category, amount]) => ({
      category,
      amount,
    })),
  };

  const grossProfit = revenue.total;
  const netProfit = revenue.total - expenseTotal;
  const profitMargin = revenue.total > 0 ? (netProfit / revenue.total) * 100 : 0;

  return {
    period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
    startDate,
    endDate,
    revenue,
    expenses: expensesData,
    grossProfit,
    netProfit,
    profitMargin,
  };
}

export async function getCashDrawerReports(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<CashDrawerReport[]> {
  const sessions = await prisma.cashDrawerSession.findMany({
    where: {
      tenantId,
      openingTime: { gte: startDate, lte: endDate },
    },
    include: {
      user: { select: { name: true, email: true } },
    },
    orderBy: { openingTime: 'desc' },
  });

  const reports: CashDrawerReport[] = [];

  for (const session of sessions) {
    // Get cash sales for this session period
    const sessionEnd = session.closingTime || new Date();
    const cashTransactions = await prisma.transaction.findMany({
      where: {
        tenantId,
        paymentMethod: 'cash',
        createdAt: { gte: session.openingTime, lte: sessionEnd },
        status: 'completed',
      },
      select: { total: true },
    });

    const cashSales = cashTransactions.reduce((sum, t) => sum + Number(t.total), 0);

    // Get cash expenses for this session period
    const cashExpenses = await prisma.expense.findMany({
      where: {
        tenantId,
        paymentMethod: 'cash',
        date: { gte: session.openingTime, lte: sessionEnd },
        isActive: true,
      },
      select: { amount: true },
    });

    const cashExpensesTotal = cashExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const openingAmount = Number(session.openingAmount);
    const closingAmount = session.closingAmount !== null ? Number(session.closingAmount) : undefined;
    const netCash = openingAmount + cashSales - cashExpensesTotal - (closingAmount || 0);

    reports.push({
      sessionId: session.id,
      userId: session.userId,
      userName: session.user?.name || 'Unknown',
      openingTime: session.openingTime,
      closingTime: session.closingTime || undefined,
      openingAmount,
      closingAmount,
      expectedAmount: session.expectedAmount !== null ? Number(session.expectedAmount) : undefined,
      shortage: session.shortage !== null ? Number(session.shortage) : undefined,
      overage: session.overage !== null ? Number(session.overage) : undefined,
      status: session.status,
      cashSales,
      cashExpenses: cashExpensesTotal,
      netCash,
    });
  }

  return reports;
}
