import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProductBundle from '@/models/ProductBundle';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const isActive = searchParams.get('isActive');
    const categoryId = searchParams.get('categoryId');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const query: Record<string, unknown> = { tenantId };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
      ];
    }
    if (isActive !== null && isActive !== '') {
      query.isActive = isActive === 'true';
    }
    if (categoryId) {
      query.categoryId = categoryId;
    }
    if (minPrice || maxPrice) {
      const priceFilter: { $gte?: number; $lte?: number } = {};
      if (minPrice) priceFilter.$gte = parseFloat(minPrice);
      if (maxPrice) priceFilter.$lte = parseFloat(maxPrice);
      query.price = priceFilter;
    }
    if (startDate || endDate) {
      const dateFilter: { $gte?: Date; $lte?: Date } = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      query.createdAt = dateFilter;
    }

    const bundles = await ProductBundle.find(query)
      .populate('items.productId', 'name price stock')
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: bundles });
  } catch (error: unknown) {
    console.error('Error fetching bundles:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch bundles';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, price, items, sku, categoryId, image, trackInventory } = body;

    if (!name || !price || !items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: t('validation.bundleFieldsRequired', 'Name, price, and at least one item are required') },
        { status: 400 }
      );
    }

    const bundle = await ProductBundle.create({
      tenantId,
      name,
      description,
      price,
      items,
      sku,
      categoryId,
      image,
      trackInventory: trackInventory !== false,
      isActive: true,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'bundle',
      entityId: bundle._id.toString(),
      changes: body,
    });

    return NextResponse.json({ success: true, data: bundle }, { status: 201 });
  } catch (error: unknown) {
    const t = await getValidationTranslatorFromRequest(request);
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        { success: false, error: t('validation.bundleSkuExists', 'Bundle with this SKU already exists') },
        { status: 400 }
      );
    }
    console.error('Error creating bundle:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create bundle';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
  }
}

