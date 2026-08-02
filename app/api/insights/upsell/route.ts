import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';

const HISTORY_DAYS = 90;
const MAX_SUGGESTIONS = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const cartProductIds = productIdsParam
      .split(',')
      .filter(Boolean)
      .filter((id) => UUID_RE.test(id));

    if (cartProductIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const since = new Date();
    since.setDate(since.getDate() - HISTORY_DAYS);

    // Transactions (in the window) that contain at least one cart product,
    // then count co-occurrence frequency of other products within those
    // same transactions. Genuinely multi-stage (transaction filter ->
    // sibling item aggregation), so done as a single parameterized raw query.
    const coOccurrences = await prisma.$queryRaw<{ product_id: string; score: bigint }[]>`
      SELECT ti2.product_id AS product_id, COUNT(*) AS score
      FROM transaction_items ti2
      JOIN transactions t ON t.id = ti2.transaction_id
      WHERE t.tenant_id = ${tenantId}::uuid
        AND t.status = 'completed'
        AND t.created_at >= ${since}
        AND ti2.transaction_id IN (
          SELECT DISTINCT ti1.transaction_id
          FROM transaction_items ti1
          JOIN transactions t1 ON t1.id = ti1.transaction_id
          WHERE t1.tenant_id = ${tenantId}::uuid
            AND t1.status = 'completed'
            AND t1.created_at >= ${since}
            AND ti1.product_id = ANY(${cartProductIds}::uuid[])
        )
        AND ti2.product_id IS NOT NULL
        AND NOT (ti2.product_id = ANY(${cartProductIds}::uuid[]))
      GROUP BY ti2.product_id
      ORDER BY score DESC
      LIMIT ${MAX_SUGGESTIONS * 2}
    `;

    if (coOccurrences.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const suggestedIds = coOccurrences.map((c) => c.product_id);
    const scoreMap = new Map<string, number>(
      coOccurrences.map((c) => [c.product_id, Number(c.score)])
    );

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
        stock: Number(p.stock),
        image: p.image ?? null,
        category: p.category ?? null,
        score: scoreMap.get(p.id) ?? 0,
      }));

    return NextResponse.json({ success: true, data: sorted });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch upsell suggestions');
  }
}
