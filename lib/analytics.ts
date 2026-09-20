/**
 * Analytics and Reporting Utilities
 */

import prisma from '@/lib/db';
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
  closingTime?: Date | null;
  openingAmount: number;
  closingAmount?: number | null;
  expectedAmount?: number | null;
  shortage?: number | null;
  overage?: number | null;
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
      case 'weekly': {
        const dayOfWeek = now.getDay();
        start = new Date(now);
        start.setDate(now.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);
        break;
      }
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
      isActive: { not: false },
    },
    select: {
      total: true,
      paymentMethod: true,
      createdAt: true,
    },
  });

  const totals = transactions.map((t) => ({ ...t, total: Number(t.total) }));

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

    totals.forEach((t) => {
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
  // Aggregate transaction items directly, scoped to this tenant's transactions
  // in the window, via a relation filter on the parent Transaction.
  const grouped = await prisma.transactionItem.groupBy({
    by: ['productId', 'name'],
    where: {
      transaction: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
        status: 'completed',
        isActive: { not: false },
      },
    },
    _sum: {
      subtotal: true,
      quantity: true,
    },
    _count: {
      _all: true,
    },
  });

  // Resolve current product names for items that still reference a product
  // (falls back to the stored line-item name for deleted/variant items).
  const productIds = Array.from(
    new Set(grouped.map((g) => g.productId).filter((id): id is string => !!id))
  );
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds }, tenantId },
        select: { id: true, name: true },
      })
    : [];
  const productNameMap = new Map(products.map((p) => [p.id, p.name]));

  const performances: ProductPerformance[] = grouped
    .map((g) => {
      const quantitySold = g._sum.quantity ?? 0;
      const totalRevenue = Number(g._sum.subtotal ?? 0);
      const productId = g.productId || 'unknown';
      const productName = (g.productId && productNameMap.get(g.productId)) || g.name || 'Unknown';
      return {
        productId,
        productName,
        totalSold: quantitySold,
        totalRevenue,
        averagePrice: quantitySold > 0 ? totalRevenue / quantitySold : 0,
        quantitySold,
        rank: 0,
      };
    })
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
  const aggregate = await prisma.transaction.aggregate({
    where: {
      tenantId,
      createdAt: { gte: startDate, lte: endDate },
      status: 'completed',
      isActive: { not: false },
    },
    _sum: { total: true },
  });

  const vatRate = settings.taxEnabled && settings.taxRate ? settings.taxRate / 100 : 0;

  const totalSales = Number(aggregate._sum.total ?? 0);

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
  const [transactions, expenses] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
        status: 'completed',
        isActive: { not: false },
      },
      select: { total: true, paymentMethod: true },
    }),
    prisma.expense.findMany({
      where: {
        tenantId,
        date: { gte: startDate, lte: endDate },
        isActive: { not: false },
      },
      select: { name: true, amount: true },
    }),
  ]);

  const totals = transactions.map((t) => ({ ...t, total: Number(t.total) }));

  const revenue = {
    total: totals.reduce((sum, t) => sum + t.total, 0),
    cash: totals.filter((t) => t.paymentMethod === 'cash').reduce((sum, t) => sum + t.total, 0),
    card: totals.filter((t) => t.paymentMethod === 'card').reduce((sum, t) => sum + t.total, 0),
    digital: totals.filter((t) => t.paymentMethod === 'digital').reduce((sum, t) => sum + t.total, 0),
  };

  const expenseAmounts = expenses.map((e) => ({ ...e, amount: Number(e.amount) }));
  const expenseTotal = expenseAmounts.reduce((sum, e) => sum + e.amount, 0);

  const expenseByCategory = new Map<string, number>();
  expenseAmounts.forEach((expense) => {
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

    const [cashSalesAgg, cashExpensesAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          tenantId,
          paymentMethod: 'cash',
          createdAt: { gte: session.openingTime, lte: sessionEnd },
          status: 'completed',
          isActive: { not: false },
        },
        _sum: { total: true },
      }),
      prisma.expense.aggregate({
        where: {
          tenantId,
          paymentMethod: 'cash',
          date: { gte: session.openingTime, lte: sessionEnd },
          isActive: { not: false },
        },
        _sum: { amount: true },
      }),
    ]);

    const cashSales = Number(cashSalesAgg._sum.total ?? 0);
    const cashExpensesTotal = Number(cashExpensesAgg._sum.amount ?? 0);

    const openingAmount = Number(session.openingAmount);
    const closingAmount = session.closingAmount != null ? Number(session.closingAmount) : 0;
    const netCash = openingAmount + cashSales - cashExpensesTotal - closingAmount;

    reports.push({
      sessionId: session.id,
      userId: session.userId,
      userName: session.user?.name || 'Unknown',
      openingTime: session.openingTime,
      closingTime: session.closingTime,
      openingAmount,
      closingAmount: session.closingAmount != null ? Number(session.closingAmount) : null,
      expectedAmount: session.expectedAmount != null ? Number(session.expectedAmount) : null,
      shortage: session.shortage != null ? Number(session.shortage) : null,
      overage: session.overage != null ? Number(session.overage) : null,
      status: session.status,
      cashSales,
      cashExpenses: cashExpensesTotal,
      netCash,
    });
  }

  return reports;
}

export interface LaundryReport {
  period: string;
  startDate: Date;
  endDate: Date;
  totalOrders: number;
  totalRevenue: number;
  ordersByStatus: Record<string, number>;
  revenueByPricingMethod: {
    weight: number;
    item: number;
  };
  averageTurnaroundHours: number | null;
}

/**
 * Laundry order report: orders by status, turnaround time (booked -> completed),
 * and revenue split by pricing method. Follows getSalesReport's period/date-range
 * convention.
 */
export async function getLaundryReport(
  tenantId: string,
  period: 'daily' | 'weekly' | 'monthly',
  startDate?: Date,
  endDate?: Date
): Promise<LaundryReport> {
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
      case 'weekly': {
        const dayOfWeek = now.getDay();
        start = new Date(now);
        start.setDate(now.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);
        break;
      }
      case 'monthly':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }
  }

  const orders = await prisma.laundryOrder.findMany({
    where: {
      tenantId,
      createdAt: { gte: start, lte: end },
      isActive: { not: false },
    },
    select: {
      status: true,
      totalAmount: true,
      pricingMethod: true,
      createdAt: true,
      completedAt: true,
    },
  });

  const ordersByStatus: Record<string, number> = {};
  const revenueByPricingMethod = { weight: 0, item: 0 };
  let totalRevenue = 0;
  let turnaroundTotalMs = 0;
  let turnaroundCount = 0;

  for (const order of orders) {
    ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;
    const amount = Number(order.totalAmount);
    totalRevenue += amount;
    revenueByPricingMethod[order.pricingMethod] += amount;

    if (order.completedAt) {
      turnaroundTotalMs += order.completedAt.getTime() - order.createdAt.getTime();
      turnaroundCount++;
    }
  }

  return {
    period,
    startDate: start,
    endDate: end,
    totalOrders: orders.length,
    totalRevenue,
    ordersByStatus,
    revenueByPricingMethod,
    averageTurnaroundHours: turnaroundCount > 0 ? turnaroundTotalMs / turnaroundCount / (1000 * 60 * 60) : null,
  };
}
