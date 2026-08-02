import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import type { Prisma } from '@prisma/client';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * GET /api/services?tenantId={{tenantId}}
 * Public endpoint to list services (products with productType='service') for a tenant.
 */
export async function GET(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    t = await getValidationTranslatorFromRequest(request);

    const tenantId = request.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantIdRequired', 'tenantId is required') },
        { status: 400 }
      );
    }

    // Resolve tenant (accept slug or UUID)
    const tenant = await prisma.tenant.findFirst({
      where: {
        isActive: true,
        OR: [{ slug: tenantId }, ...(UUID_RE.test(tenantId) ? [{ id: tenantId }] : [])],
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    const categoryId = request.nextUrl.searchParams.get('categoryId');
    const search = request.nextUrl.searchParams.get('search');

    const where: Prisma.ProductWhereInput = {
      tenantId: tenant.id,
      productType: 'service',
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const services = await prisma.product.findMany({
      where,
      select: { id: true, name: true, description: true, price: true, image: true, category: true, categoryId: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: services.map(({ id, price, ...rest }) => ({ _id: id, ...rest, price: Number(price) })),
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch services' },
      { status: 500 }
    );
  }
}
