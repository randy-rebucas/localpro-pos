/**
 * Analytics and Reporting Utilities
 */

import mongoose from 'mongoose';
import Transaction from '@/models/Transaction';
import Expense from '@/models/Expense';
import CashDrawerSession from '@/models/CashDrawerSession';
import Product from '@/models/Product';
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

  const tenantObjectId = toObjectId(tenantId);
  const digitalLike = ['digital', 'tap_to_pay', 'wallet', 'qr_code', 'bnpl'];

  // Totals are computed in the database — only the grouped rows come back
  const [result] = await Transaction.aggregate<{
    byMethod: Array<{ _id: string | null; sales: number; count: number }>;
    byDay: Array<{ _id: string; sales: number; transactions: number }>;
  }>([
    { $match: completedSalesMatch(tenantObjectId, start, end) },
    {
      $facet: {
        byMethod: [
          { $group: { _id: '$paymentMethod', sales: { $sum: '$total' }, count: { $sum: 1 } } },
        ],
        // Sales by day only for detailed (daily/weekly) reports
        ...(period === 'daily' || period === 'weekly'
          ? {
            byDay: [
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                  sales: { $sum: '$total' },
                  transactions: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ],
          }
          : {}),
      },
    },
  ]);

  const byMethod = result?.byMethod ?? [];
  const sumFor = (methods: string[]) =>
    byMethod.filter((m) => m._id && methods.includes(m._id)).reduce((sum, m) => sum + m.sales, 0);

  const totalSales = byMethod.reduce((sum, m) => sum + m.sales, 0);
  const totalTransactions = byMethod.reduce((sum, m) => sum + m.count, 0);
  const averageTransaction = totalTransactions > 0 ? totalSales / totalTransactions : 0;

  const salesByPaymentMethod = {
    cash: sumFor(['cash']),
    card: sumFor(['card']),
    digital: sumFor(digitalLike),
    on_account: sumFor(['on_account']),
  };

  // Sales by day for detailed reports
  const salesByDay = (result?.byDay ?? []).map((d) => ({
    date: d._id,
    sales: d.sales,
    transactions: d.transactions,
  }));

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
  // Group line items in the database, then look up current names for the top
  // `limit` products only (previously every product of every sale was populated)
  const rows = await Transaction.aggregate<{
    _id: mongoose.Types.ObjectId | null;
    itemName: string | null;
    totalRevenue: number;
    quantitySold: number;
  }>([
    { $match: completedSalesMatch(toObjectId(tenantId), startDate, endDate) },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        itemName: { $first: '$items.name' },
        totalRevenue: { $sum: '$items.subtotal' },
        quantitySold: { $sum: '$items.quantity' },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: limit },
  ]);

  const productIds = rows.map((r) => r._id).filter(Boolean);
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds }, tenantId }).select('name').lean()
    : [];
  const nameById = new Map(products.map((p) => [String(p._id), p.name]));

  return rows.map((r, index) => ({
    productId: r._id ? String(r._id) : '',
    productName: (r._id && nameById.get(String(r._id))) || r.itemName || 'Unknown',
    totalSold: r.quantitySold,
    totalRevenue: r.totalRevenue,
    averagePrice: r.quantitySold > 0 ? r.totalRevenue / r.quantitySold : 0,
    quantitySold: r.quantitySold,
    rank: index + 1,
  }));
}

export async function getVATReport(
  tenantId: string,
  startDate: Date,
  endDate: Date,
  settings: ITenantSettings
): Promise<VATReport> {
  const [totals] = await Transaction.aggregate<{ totalSales: number }>([
    { $match: completedSalesMatch(toObjectId(tenantId), startDate, endDate) },
    { $group: { _id: null, totalSales: { $sum: '$total' } } },
  ]);

  const vatRate = settings.taxEnabled && settings.taxRate ? settings.taxRate / 100 : 0;

  // For simplicity, we'll assume all sales are VAT sales if tax is enabled
  // In a real system, you'd have a flag on products/transactions
  const totalSales = totals?.totalSales ?? 0;

  if (vatRate > 0) {
    // Calculate base amount (without VAT) — total includes VAT
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
  const tenantObjectId = toObjectId(tenantId);

  const [byMethod, expenseByName] = await Promise.all([
    Transaction.aggregate<{ _id: string | null; sales: number }>([
      { $match: completedSalesMatch(tenantObjectId, startDate, endDate) },
      { $group: { _id: '$paymentMethod', sales: { $sum: '$total' } } },
    ]),
    // Use expense name as category since Expense model doesn't have a category field
    Expense.aggregate<{ _id: string | null; amount: number }>([
      { $match: { tenantId: tenantObjectId, date: { $gte: startDate, $lte: endDate }, isActive: { $ne: false } } },
      { $group: { _id: '$name', amount: { $sum: '$amount' } } },
    ]),
  ]);

  const sumFor = (method: string) => byMethod.find((m) => m._id === method)?.sales ?? 0;
  const revenue = {
    total: byMethod.reduce((sum, m) => sum + m.sales, 0),
    cash: sumFor('cash'),
    card: sumFor('card'),
    digital: sumFor('digital'),
  };

  // Merge null/empty names into "Other" as before
  const expenseByCategory = new Map<string, number>();
  for (const row of expenseByName) {
    const category = row._id || 'Other';
    expenseByCategory.set(category, (expenseByCategory.get(category) || 0) + row.amount);
  }
  const expenseTotal = expenseByName.reduce((sum, e) => sum + e.amount, 0);

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
  const sessions = await CashDrawerSession.find({
    tenantId,
    openingTime: { $gte: startDate, $lte: endDate },
  })
    .populate('userId', 'name email')
    .sort({ openingTime: -1 })
    .lean();

  if (sessions.length === 0) return [];

  // Load cash sales and cash expenses for the whole span once (only the fields
  // needed), instead of two queries per session over overlapping ranges
  const now = new Date();
  const spanStart = new Date(Math.min(...sessions.map((s) => new Date(s.openingTime).getTime())));
  const spanEnd = new Date(Math.max(...sessions.map((s) => new Date(s.closingTime || now).getTime())));

  const [cashTransactions, cashExpenses] = await Promise.all([
    Transaction.find({
      tenantId,
      paymentMethod: 'cash',
      createdAt: { $gte: spanStart, $lte: spanEnd },
      status: 'completed',
      isActive: { $ne: false },
    }).select('total createdAt').lean(),
    Expense.find({
      tenantId,
      paymentMethod: 'cash',
      date: { $gte: spanStart, $lte: spanEnd },
      isActive: { $ne: false },
    }).select('amount date').lean(),
  ]);

  return sessions.map((session) => {
    const open = new Date(session.openingTime).getTime();
    const close = new Date(session.closingTime || now).getTime();
    const inSession = (d: Date) => {
      const t = new Date(d).getTime();
      return t >= open && t <= close;
    };

    const cashSales = cashTransactions
      .filter((t) => inSession(t.createdAt))
      .reduce((sum, t) => sum + t.total, 0);
    const cashExpensesTotal = cashExpenses
      .filter((e) => inSession(e.date))
      .reduce((sum, e) => sum + e.amount, 0);

    const netCash = session.openingAmount + cashSales - cashExpensesTotal - (session.closingAmount || 0);

    return {
      sessionId: session._id.toString(),
      // userId is populated (lean → plain object), so read its _id
      userId: String((session.userId as any)?._id ?? session.userId), // eslint-disable-line @typescript-eslint/no-explicit-any
      userName: (session.userId as any)?.name || 'Unknown', // eslint-disable-line @typescript-eslint/no-explicit-any
      openingTime: session.openingTime,
      closingTime: session.closingTime,
      openingAmount: session.openingAmount,
      closingAmount: session.closingAmount,
      expectedAmount: session.expectedAmount,
      shortage: session.shortage,
      overage: session.overage,
      status: session.status,
      cashSales,
      cashExpenses: cashExpensesTotal,
      netCash,
    };
  });
}

// aggregate() doesn't cast like find() does — match on ObjectId explicitly
function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(String(id));
}

function completedSalesMatch(tenantId: mongoose.Types.ObjectId, start: Date, end: Date) {
  return {
    tenantId,
    createdAt: { $gte: start, $lte: end },
    status: 'completed',
    isActive: { $ne: false },
  };
}
