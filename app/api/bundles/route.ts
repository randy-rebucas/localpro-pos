import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProductBundle from '@/models/ProductBundle';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const isActive = searchParams.get('isActive');

    const query: any = { tenantId };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
      ];
    }
    if (isActive !== null) {
      query.isActive = isActive === 'true';
    }

    const bundles = await ProductBundle.find(query)
      .populate('items.productId', 'name price stock')
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: bundles });
  } catch (error: any) {
    console.error('Error fetching bundles:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, price, items, sku, categoryId, image, trackInventory } = body;

    if (!name || !price || !items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Name, price, and at least one item are required' },
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
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Bundle with this SKU already exists' },
        { status: 400 }
      );
    }
    console.error('Error creating bundle:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

