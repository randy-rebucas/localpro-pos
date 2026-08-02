import prisma from '@/lib/prisma';

export function customerToApi(customer: any) {
  const { id, totalSpent, accountBalance, creditLimit, ...rest } = customer;
  return {
    _id: id,
    ...rest,
    totalSpent: totalSpent !== undefined ? Number(totalSpent) : undefined,
    accountBalance: accountBalance !== undefined ? Number(accountBalance) : undefined,
    creditLimit: creditLimit !== undefined && creditLimit !== null ? Number(creditLimit) : creditLimit,
  };
}

export async function getCustomerProfileStats(tenantId: string, customerId: string) {
  // Last 10 completed transactions
  const recentTransactions = await prisma.transaction.findMany({
    where: { tenantId, customerId, status: 'completed' },
    select: { id: true, receiptNumber: true, total: true, paymentMethod: true, createdAt: true, items: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // Total order count + lifetime value + avg order value
  const agg = await prisma.transaction.aggregate({
    where: { tenantId, customerId, status: 'completed' },
    _count: { _all: true },
    _sum: { total: true },
    _avg: { total: true },
  });

  const orderCount = agg._count._all;
  const lifetimeValue = Number(agg._sum.total ?? 0);
  const avgOrderValue = Number(agg._avg.total ?? 0);

  // Top 5 products by quantity bought
  const allCompletedTxIds = await prisma.transaction.findMany({
    where: { tenantId, customerId, status: 'completed' },
    select: { id: true },
  });
  const txIds = allCompletedTxIds.map((t) => t.id);

  let topProducts: Array<{ _id: string | null; name: string; totalQty: number; totalSpent: number }> = [];
  if (txIds.length > 0) {
    const items = await prisma.transactionItem.findMany({
      where: { transactionId: { in: txIds } },
      select: { productId: true, name: true, quantity: true, subtotal: true },
    });
    const byProduct = new Map<string, { name: string; totalQty: number; totalSpent: number }>();
    for (const item of items) {
      const key = item.productId ?? item.name;
      const existing = byProduct.get(key);
      if (existing) {
        existing.totalQty += item.quantity;
        existing.totalSpent += Number(item.subtotal);
      } else {
        byProduct.set(key, { name: item.name, totalQty: item.quantity, totalSpent: Number(item.subtotal) });
      }
    }
    topProducts = Array.from(byProduct.entries())
      .map(([key, v]) => ({ _id: key, ...v }))
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 5);
  }

  // Loyalty history
  const loyaltyHistory = await prisma.loyaltyTransaction.findMany({
    where: { tenantId, customerId },
    select: { type: true, points: true, description: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return {
    recentTransactions: recentTransactions.map((tx) => {
      const { id, total, ...rest } = tx;
      return { _id: id, ...rest, total: Number(total) };
    }),
    topProducts,
    loyaltyHistory,
    orderCount,
    lifetimeValue,
    avgOrderValue,
  };
}
