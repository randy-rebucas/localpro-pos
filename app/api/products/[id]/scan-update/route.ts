import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { updateStock } from '@/lib/stock';

const SKU_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SKU_LENGTH = 8;

function generateSkuCandidate(): string {
  let result = 'SKU-';
  for (let i = 0; i < SKU_LENGTH; i++) {
    result += SKU_CHARSET[Math.floor(Math.random() * SKU_CHARSET.length)];
  }
  return result;
}

async function generateUniqueSku(tenantId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateSkuCandidate();
    const exists = await prisma.product.findFirst({ where: { tenantId, sku: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  // Fallback: timestamp-based to guarantee uniqueness
  return `SKU-${Date.now().toString(36).toUpperCase()}`;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    if (!(await hasTenantPermission(authResult.user.role, tenantId, 'products.manage'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`scan-update:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { id } = await params;

    const body = await request.json();
    const {
      barcode,
      name,
      sku,
      price,
      stock,
      categoryId,
      imageUrl,
      notes,
      sessionId,
    } = body as {
      barcode?: string;
      name?: string;
      sku?: string;
      price?: number;
      stock?: number;
      categoryId?: string;
      imageUrl?: string;
      notes?: string;
      sessionId?: string;
    };

    const product = await prisma.product.findFirst({
      where: { id, tenantId, isActive: { not: false } },
    });

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    let skuGenerated = false;
    let resolvedSku = sku;

    if (!resolvedSku) {
      resolvedSku = await generateUniqueSku(tenantId);
      skuGenerated = true;
    } else {
      // Ensure provided SKU is unique within tenant (excluding this product)
      const conflict = await prisma.product.findFirst({
        where: { tenantId, sku: resolvedSku, id: { not: id } },
        select: { id: true },
      });
      if (conflict) {
        return NextResponse.json(
          { success: false, error: 'SKU already in use by another product' },
          { status: 409 }
        );
      }
    }

    const updates: Prisma.ProductUncheckedUpdateInput = { sku: resolvedSku };
    if (barcode !== undefined) updates.barcode = barcode.trim();
    if (name !== undefined && name.trim()) updates.name = name.trim();
    if (price !== undefined && price >= 0) updates.price = price;
    if (categoryId) updates.categoryId = categoryId;
    if (imageUrl !== undefined) updates.image = imageUrl;
    if (notes !== undefined) updates.description = notes;

    await prisma.product.update({
      where: { id },
      data: updates,
    });

    // Route stock changes through updateStock() so a StockMovement record is created
    // and the allowOutOfStockSales guard is applied consistently.
    if (stock !== undefined && stock >= 0) {
      const delta = stock - product.stock;
      if (delta !== 0) {
        await updateStock(id, tenantId, delta, 'adjustment', {
          userId: authResult.user.userId,
          reason: 'Scan-update stock correction',
          notes: sessionId ? `Session: ${sessionId}` : undefined,
        });
      }
    }

    const updatedProduct = await prisma.product.findFirst({ where: { id, tenantId } });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'product',
      entityId: id,
      changes: { ...updates, sessionId, skuGenerated },
    });

    logger.info(`scan-update: product ${id} updated in session ${sessionId ?? 'unknown'}`);

    return NextResponse.json({
      success: true,
      data: {
        product: updatedProduct
          ? { ...updatedProduct, _id: updatedProduct.id, price: Number(updatedProduct.price) }
          : null,
        skuGenerated,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to update product');
  }
}
