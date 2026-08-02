import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { updateStock } from '@/lib/stock';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const body = await request.json();
    const { quantity, notes } = body;

    if (!quantity || quantity <= 0) {
      return NextResponse.json(
        { success: false, error: t('validation.quantityGreaterThanZero', 'Quantity must be greater than 0') },
        { status: 400 }
      );
    }

    // Get product before update to track previous stock
    const productBefore = await prisma.product.findFirst({ where: { id, tenantId } });

    if (!productBefore) {
      return NextResponse.json({ success: false, error: t('validation.productNotFound', 'Product not found') }, { status: 404 });
    }

    const previousStock = Number(productBefore.stock);

    // Update stock using the stock utility function
    await updateStock(
      id,
      tenantId,
      quantity, // Positive quantity for refill
      'purchase',
      {
        userId: user.userId,
        reason: 'Stock refill',
        notes: notes || undefined,
      }
    );

    // Get updated product
    const product = await prisma.product.findFirst({ where: { id, tenantId } });

    if (!product) {
      return NextResponse.json({ success: false, error: t('validation.productNotFound', 'Product not found') }, { status: 404 });
    }

    // Push updated stock to connected storefronts (fire-and-forget)
    {
      const { pushChannelInventoryForProduct } = await import('@/lib/ecommerce/inventory-push');
      void pushChannelInventoryForProduct(tenantId, id, { stockReason: 'purchase' });
    }

    const newStock = Number(product.stock);

    // Create audit log
    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'product',
      entityId: id,
      changes: {
        stock: {
          old: previousStock,
          new: newStock,
        },
        refillQuantity: quantity,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        product: { ...product, _id: product.id, stock: newStock, price: Number(product.price) },
        refilledQuantity: quantity,
        newStock,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Product not found') {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    return handleApiError(error);
  }
}
