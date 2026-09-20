import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { setTenantContext } from '@/lib/tenant-context';

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

    // Resolve tenant (accept slug or id)
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [{ slug: tenantId }, { id: tenantId }],
        isActive: true,
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }
    setTenantContext(tenant.id);

    const categoryId = request.nextUrl.searchParams.get('categoryId');
    const search = request.nextUrl.searchParams.get('search');

    const where: Record<string, unknown> = {
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
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        image: true,
        category: true,
        categoryId: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, data: services });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch services' },
      { status: 500 }
    );
  }
}
