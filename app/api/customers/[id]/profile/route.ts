import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const { id } = await params;

    const customer = await prisma.customer.findFirst({ where: { id, tenantId } });
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    // Last 10 transactions
    const recentTransactionsRaw = await prisma.transaction.findMany({
      where: { tenantId, customerId: id, status: 'completed' },
      select: {
        id: true,
        receiptNumber: true,
        total: true,
        paymentMethod: true,
        createdAt: true,
        items: { select: { id: true, productId: true, name: true, price: true, quantity: true, subtotal: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const recentTransactions = recentTransactionsRaw.map((tx) => ({
      ...tx,
      _id: tx.id,
      total: Number(tx.total),
      items: tx.items.map((it) => ({
        ...it,
        _id: it.id,
        product: it.productId,
        price: Number(it.price),
        subtotal: Number(it.subtotal),
      })),
    }));

    // Total order count + lifetime value
    const statsAgg = await prisma.transaction.aggregate({
      where: { tenantId, customerId: id, status: 'completed' },
      _count: { _all: true },
      _sum: { total: true },
      _avg: { total: true },
    });
    const stats = {
      orderCount: statsAgg._count._all,
      totalSpent: Number(statsAgg._sum.total ?? 0),
      avgOrderValue: Number(statsAgg._avg.total ?? 0),
    };

    // Top 5 products by quantity bought
    const itemGroups = await prisma.transactionItem.groupBy({
      by: ['productId'],
      where: {
        transaction: { tenantId, customerId: id, status: 'completed' },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });
    const topProductNames = await prisma.transactionItem.findMany({
      where: { productId: { in: itemGroups.map((g) => g.productId).filter((v): v is string => !!v) } },
      distinct: ['productId'],
      select: { productId: true, name: true },
    });
    const nameByProductId = new Map(topProductNames.map((p) => [p.productId, p.name]));
    const topProducts = itemGroups.map((g) => ({
      _id: g.productId,
      name: g.productId ? nameByProductId.get(g.productId) : undefined,
      totalQty: g._sum.quantity ?? 0,
      totalSpent: Number(g._sum.subtotal ?? 0),
    }));

    // Loyalty history
    const loyaltyHistoryRaw = await prisma.loyaltyTransaction.findMany({
      where: { tenantId, customerId: id },
      select: { id: true, type: true, points: true, description: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const loyaltyHistory = loyaltyHistoryRaw.map((l) => ({ ...l, _id: l.id, points: Number(l.points) }));

    // RFM — compute segment
    const now = new Date();
    const daysSinceLastPurchase = customer.lastPurchaseDate
      ? Math.floor((now.getTime() - new Date(customer.lastPurchaseDate).getTime()) / 86400000)
      : null;
    const orderCount: number = stats.orderCount;
    const lifetimeValue: number = stats.totalSpent;

    let segment: 'new' | 'regular' | 'vip' | 'at_risk' | 'lapsed' | 'prospect';
    if (orderCount === 0) {
      segment = 'prospect';
    } else if (daysSinceLastPurchase !== null && daysSinceLastPurchase > 90) {
      segment = 'lapsed';
    } else if (daysSinceLastPurchase !== null && daysSinceLastPurchase > 30 && orderCount < 5) {
      segment = 'at_risk';
    } else if (lifetimeValue >= 5000 || Number(customer.loyaltyPointsBalance ?? 0) >= 500 || orderCount >= 20) {
      segment = 'vip';
    } else if (orderCount <= 2) {
      segment = 'new';
    } else {
      segment = 'regular';
    }

    return NextResponse.json({
      success: true,
      data: {
        customer: {
          ...customer,
          _id: customer.id,
          totalSpent: Number(customer.totalSpent),
          loyaltyPointsBalance: Number(customer.loyaltyPointsBalance),
          accountBalance: Number(customer.accountBalance),
          creditLimit: customer.creditLimit != null ? Number(customer.creditLimit) : undefined,
        },
        recentTransactions,
        topProducts,
        loyaltyHistory,
        stats: {
          orderCount,
          lifetimeValue,
          avgOrderValue: stats.avgOrderValue,
          daysSinceLastPurchase,
          segment,
        },
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch customer profile');
  }
}
