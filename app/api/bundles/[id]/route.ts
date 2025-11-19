import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProductBundle from '@/models/ProductBundle';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const bundle = await ProductBundle.findOne({ _id: id, tenantId })
      .populate('items.productId', 'name price stock')
      .populate('categoryId', 'name')
      .lean();

    if (!bundle) {
      return NextResponse.json({ success: false, error: 'Bundle not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: bundle });
  } catch (error: any) {
    console.error('Error fetching bundle:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const bundle = await ProductBundle.findOne({ _id: id, tenantId });
    if (!bundle) {
      return NextResponse.json({ success: false, error: 'Bundle not found' }, { status: 404 });
    }

    const body = await request.json();
    const oldData = bundle.toObject();

    if (body.name) bundle.name = body.name;
    if (body.description !== undefined) bundle.description = body.description;
    if (body.price !== undefined) bundle.price = body.price;
    if (body.items) bundle.items = body.items;
    if (body.sku !== undefined) bundle.sku = body.sku;
    if (body.categoryId !== undefined) bundle.categoryId = body.categoryId;
    if (body.image !== undefined) bundle.image = body.image;
    if (body.trackInventory !== undefined) bundle.trackInventory = body.trackInventory;
    if (body.isActive !== undefined) bundle.isActive = body.isActive;

    await bundle.save();

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'bundle',
      entityId: bundle._id.toString(),
      changes: { before: oldData, after: bundle.toObject() },
    });

    return NextResponse.json({ success: true, data: bundle });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Bundle with this SKU already exists' },
        { status: 400 }
      );
    }
    console.error('Error updating bundle:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const bundle = await ProductBundle.findOne({ _id: id, tenantId });
    if (!bundle) {
      return NextResponse.json({ success: false, error: 'Bundle not found' }, { status: 404 });
    }

    // Soft delete - set isActive to false
    bundle.isActive = false;
    await bundle.save();

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'bundle',
      entityId: bundle._id.toString(),
      changes: { name: bundle.name },
    });

    return NextResponse.json({ success: true, message: 'Bundle deactivated' });
  } catch (error: any) {
    console.error('Error deleting bundle:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

