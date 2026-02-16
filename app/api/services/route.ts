import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

/**
 * GET /api/services?tenantId={{tenantId}}
 * Public endpoint to list services (products with productType='service') for a tenant.
 */
export async function GET(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    await connectDB();
    t = await getValidationTranslatorFromRequest(request);

    const tenantId = request.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantIdRequired', 'tenantId is required') },
        { status: 400 }
      );
    }

    // Resolve tenant (accept slug or ObjectId)
    const tenant = await Tenant.findOne({
      $or: [{ slug: tenantId }, ...(tenantId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: tenantId }] : [])],
      isActive: true,
    }).lean();

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    const categoryId = request.nextUrl.searchParams.get('categoryId');
    const search = request.nextUrl.searchParams.get('search');

    const filter: Record<string, any> = {
      tenantId: tenant._id,
      productType: 'service',
    };

    if (categoryId) {
      filter.categoryId = categoryId;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const services = await Product.find(filter)
      .select('name description price image category categoryId')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, data: services });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch services' },
      { status: 500 }
    );
  }
}
