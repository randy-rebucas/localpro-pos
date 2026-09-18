import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';

/**
 * Live duplicate-name check used by the product form while typing/on blur, so a
 * duplicate is caught before submit instead of only at create time.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const tenantId = authResult.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const name = (searchParams.get('name') || '').trim();
    const excludeId = searchParams.get('excludeId') || undefined;

    if (!name) {
      return NextResponse.json({ success: true, exists: false });
    }

    const where: Prisma.ProductWhereInput = {
      tenantId,
      isActive: { not: false },
      name: { equals: name, mode: 'insensitive' },
    };
    if (excludeId) {
      where.id = { not: excludeId };
    }

    const existing = await prisma.product.findFirst({
      where,
      select: { id: true, name: true, sku: true, stock: true },
    });

    return NextResponse.json({
      success: true,
      exists: !!existing,
      product: existing ? { ...existing, _id: existing.id } : undefined,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to check for duplicate product');
  }
}
