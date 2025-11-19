/**
 * Analytics and Reporting Utilities
 */

import mongoose from 'mongoose';
import Transaction from '@/models/Transaction';
import Expense from '@/models/Expense';
import CashDrawerSession from '@/models/CashDrawerSession';
import Product from '@/models/Product';
import { ITenantSettings } from '@/models/Tenant';

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

  const transactions = await Transaction.find({
    tenantId,
    createdAt: { $gte: start, $lte: end },
    status: 'completed',
  }).lean();

  const totalSales = transactions.reduce((sum, t) => sum + t.total, 0);
  const totalTransactions = transactions.length;
  const averageTransaction = totalTransactions > 0 ? totalSales / totalTransactions : 0;

  const salesByPaymentMethod = {
    cash: transactions.filter(t => t.paymentMethod === 'cash').reduce((sum, t) => sum + t.total, 0),
    card: transactions.filter(t => t.paymentMethod === 'card').reduce((sum, t) => sum + t.total, 0),
    digital: transactions.filter(t => t.paymentMethod === 'digital').reduce((sum, t) => sum + t.total, 0),
  };

  // Sales by day for detailed reports
  const salesByDay: Array<{ date: string; sales: number; transactions: number }> = [];
  if (period === 'daily' || period === 'weekly') {
    const dayMap = new Map<string, { sales: number; transactions: number }>();
    
    transactions.forEach(t => {
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
  // Ensure Product model is registered before using populate
  // This is necessary in Next.js serverless functions where models might not be registered yet
  // Accessing the model ensures its registration code has executed
  if (!mongoose.models.Product) {
    // The Product model should be registered when imported, but if it's not,
    // we need to ensure it's registered. Accessing Product.modelName forces evaluation.
    const _ = Product.modelName;
  }
  
  const transactions = await Transaction.find({
    tenantId,
    createdAt: { $gte: startDate, $lte: endDate },
    status: 'completed',
  }).populate('items.product', 'name').lean();

  const productMap = new Map<string, {
    productId: string;
    productName: string;
    totalRevenue: number;
    quantitySold: number;
    transactions: number;
  }>();

  transactions.forEach(transaction => {
    transaction.items.forEach((item: any) => {
      const productId = item.product?._id?.toString() || item.product?.toString();
      const productName = item.product?.name || item.name || 'Unknown';
      
      const existing = productMap.get(productId) || {
        productId,
        productName,
        totalRevenue: 0,
        quantitySold: 0,
        transactions: 0,
      };

      existing.totalRevenue += item.subtotal;
      existing.quantitySold += item.quantity;
      existing.transactions += 1;

      productMap.set(productId, existing);
    });
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
  const transactions = await Transaction.find({
    tenantId,
    createdAt: { $gte: startDate, $lte: endDate },
    status: 'completed',
  }).lean();

  const vatRate = settings.taxEnabled && settings.taxRate ? settings.taxRate / 100 : 0;
  
  // For simplicity, we'll assume all sales are VAT sales if tax is enabled
  // In a real system, you'd have a flag on products/transactions
  const totalSales = transactions.reduce((sum, t) => sum + t.total, 0);
  
  let vatSales = 0;
  let nonVatSales = 0;
  
  if (vatRate > 0) {
    // Calculate VAT sales (total includes VAT)
    vatSales = totalSales;
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
  const transactions = await Transaction.find({
    tenantId,
    createdAt: { $gte: startDate, $lte: endDate },
    status: 'completed',
  }).lean();

  const expenses = await Expense.find({
    tenantId,
    date: { $gte: startDate, $lte: endDate },
  }).lean();

  const revenue = {
    total: transactions.reduce((sum, t) => sum + t.total, 0),
    cash: transactions.filter(t => t.paymentMethod === 'cash').reduce((sum, t) => sum + t.total, 0),
    card: transactions.filter(t => t.paymentMethod === 'card').reduce((sum, t) => sum + t.total, 0),
    digital: transactions.filter(t => t.paymentMethod === 'digital').reduce((sum, t) => sum + t.total, 0),
  };

  const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  
  const expenseByCategory = new Map<string, number>();
  expenses.forEach(expense => {
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
  const sessions = await CashDrawerSession.find({
    tenantId,
    openingTime: { $gte: startDate, $lte: endDate },
  })
    .populate('userId', 'name email')
    .sort({ openingTime: -1 })
    .lean();

  const reports: CashDrawerReport[] = [];

  for (const session of sessions) {
    // Get cash sales for this session period
    const sessionEnd = session.closingTime || new Date();
    const cashTransactions = await Transaction.find({
      tenantId,
      paymentMethod: 'cash',
      createdAt: { $gte: session.openingTime, $lte: sessionEnd },
      status: 'completed',
    }).lean();

    const cashSales = cashTransactions.reduce((sum, t) => sum + t.total, 0);

    // Get cash expenses for this session period
    const cashExpenses = await Expense.find({
      tenantId,
      paymentMethod: 'cash',
      date: { $gte: session.openingTime, $lte: sessionEnd },
    }).lean();

    const cashExpensesTotal = cashExpenses.reduce((sum, e) => sum + e.amount, 0);

    const netCash = session.openingAmount + cashSales - cashExpensesTotal - (session.closingAmount || 0);

    reports.push({
      sessionId: session._id.toString(),
      userId: session.userId.toString(),
      userName: (session.userId as any)?.name || 'Unknown',
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
    });
  }

  return reports;
}

