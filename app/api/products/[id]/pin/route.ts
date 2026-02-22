import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }
    
    const product = await Product.findOne({ _id: id, tenantId });
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    // Toggle pinned status
    const newPinnedStatus = !product.pinned;
    const updatedProduct = await Product.findOneAndUpdate(
      { _id: id, tenantId },
      { pinned: newPinnedStatus },
      { new: true, runValidators: true }
    );

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'product',
      entityId: id,
      changes: {
        pinned: {
          old: product.pinned,
          new: newPinnedStatus,
        },
      },
    });

    return NextResponse.json({ success: true, data: updatedProduct });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error toggling product pin:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
