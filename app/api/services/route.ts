import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type ProductFilter } from '@/lib/db';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

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

    // Resolve tenant (accept slug or ObjectId)
    const tenant = await getRepos().tenants.findActiveBySlugOrId(tenantId, { select: '_id' });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    const categoryId = request.nextUrl.searchParams.get('categoryId');
    const search = request.nextUrl.searchParams.get('search');

    const filter: ProductFilter = { productType: 'service' };

    if (categoryId) {
      filter.categoryId = categoryId;
    }

    if (search) {
      filter.search = search;
      filter.searchFields = ['name', 'description'];
    }

    const services = await getRepos().products.list(tenant._id, filter, {
      select: 'name description price image category categoryId',
      sort: 'name',
    });

    return NextResponse.json({ success: true, data: services });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch services' },
      { status: 500 }
    );
  }
}
