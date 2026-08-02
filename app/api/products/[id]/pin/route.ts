import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { getProductById, serializeProduct } from '@/lib/data/products';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const product = await getProductById(tenantId, id);
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    // Toggle pinned status
    const newPinnedStatus = !product.pinned;
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: { pinned: newPinnedStatus },
    });

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

    return NextResponse.json({ success: true, data: serializeProduct(updatedProduct) });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error toggling product pin:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
