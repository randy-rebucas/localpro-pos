import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';

const HISTORY_DAYS = 90;
const MAX_SUGGESTIONS = 5;

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const searchParams = request.nextUrl.searchParams;
    const productIdsParam = searchParams.get('productIds') ?? '';

    if (!productIdsParam) {
      return NextResponse.json({ success: true, data: [] });
    }

    const cartProductIds = productIdsParam.split(',').filter(Boolean);

    if (cartProductIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const since = new Date();
    since.setDate(since.getDate() - HISTORY_DAYS);

    // Find transactions (scoped to this tenant) that contain at least one
    // cart product within the history window.
    const cartTransactionItems = await prisma.transactionItem.findMany({
      where: {
        productId: { in: cartProductIds },
        transaction: {
          tenantId,
          status: 'completed',
          createdAt: { gte: since },
        },
      },
      select: { transactionId: true },
      distinct: ['transactionId'],
    });

    if (cartTransactionItems.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const transactionIds = cartTransactionItems.map((t) => t.transactionId);

    // Items from those same transactions that are NOT already in the cart —
    // frequency of co-occurrence becomes the suggestion score.
    const coOccurringItems = await prisma.transactionItem.findMany({
      where: {
        transactionId: { in: transactionIds },
        productId: { notIn: cartProductIds },
        NOT: { productId: null },
      },
      select: { productId: true },
    });

    if (coOccurringItems.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const scoreMap = new Map<string, number>();
    for (const item of coOccurringItems) {
      if (!item.productId) continue;
      scoreMap.set(item.productId, (scoreMap.get(item.productId) ?? 0) + 1);
    }

    const suggestedIds = Array.from(scoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_SUGGESTIONS * 2) // fetch extras to filter out-of-stock
      .map(([productId]) => productId);

    const suggestedProducts = await prisma.product.findMany({
      where: {
        id: { in: suggestedIds },
        tenantId,
        isActive: true,
        OR: [{ stock: { gt: 0 } }, { allowOutOfStockSales: true }],
      },
      select: { id: true, name: true, price: true, stock: true, image: true, category: true },
    });

    const sorted = suggestedProducts
      .sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0))
      .slice(0, MAX_SUGGESTIONS)
      .map((p) => ({
        productId: p.id,
        name: p.name,
        price: Number(p.price),
        stock: p.stock,
        image: p.image ?? null,
        category: p.category ?? null,
        score: scoreMap.get(p.id) ?? 0,
      }));

    return NextResponse.json({ success: true, data: sorted });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch upsell suggestions');
  }
}
