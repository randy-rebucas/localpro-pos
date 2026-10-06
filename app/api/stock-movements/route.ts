import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdForUser } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:stock-movements:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const user = await requireAuth(request);
    const tenantId = await getTenantIdForUser(request, user);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'stock_movements.view'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get('productId');
    const type = searchParams.get('type');
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 200);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const skip = (page - 1) * limit;

    const where: any = { tenantId }; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (productId) {
      where.productId = productId;
    }
    if (type) {
      where.type = type;
    }

    const [movements, total] = await prisma.$transaction([
      prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          user: { select: { name: true, email: true } },
          transaction: { select: { receiptNumber: true } },
        },
      }),
      prisma.stockMovement.count({ where }),
    ]);

    // Legacy client shape (hooks/useStockMovementsList.ts): `_id` plus populated productId/userId/transactionId.
    const data = movements.map(({ product, user, transaction, variationSize, variationColor, variationType, ...m }) => ({
      ...m,
      _id: m.id,
      productId: product ? { _id: product.id, name: product.name, sku: product.sku ?? undefined } : m.productId,
      userId: user ? { name: user.name, email: user.email } : m.userId ?? undefined,
      transactionId: transaction ? { receiptNumber: transaction.receiptNumber } : m.transactionId ?? undefined,
      variation:
        variationSize || variationColor || variationType
          ? { size: variationSize ?? undefined, color: variationColor ?? undefined, type: variationType ?? undefined }
          : undefined,
    }));

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch stock movements');
  }
}

