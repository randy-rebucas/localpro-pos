import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { logger } from '@/lib/logger';

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
    const exists = await Product.exists({ tenantId, sku: candidate });
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
    await connectDB();

    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`scan-update:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid product ID' }, { status: 400 });
    }

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

    const product = await Product.findOne({
      _id: id,
      tenantId,
      isActive: { $ne: false },
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
      const conflict = await Product.exists({
        tenantId,
        sku: resolvedSku,
        _id: { $ne: id },
      });
      if (conflict) {
        return NextResponse.json(
          { success: false, error: 'SKU already in use by another product' },
          { status: 409 }
        );
      }
    }

    const updates: Record<string, unknown> = { sku: resolvedSku };
    if (barcode !== undefined) updates.barcode = barcode.trim();
    if (name !== undefined && name.trim()) updates.name = name.trim();
    if (price !== undefined && price >= 0) updates.price = price;
    if (stock !== undefined && stock >= 0) updates.stock = stock;
    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
      updates.categoryId = new mongoose.Types.ObjectId(categoryId);
    }
    if (imageUrl !== undefined) updates.image = imageUrl;
    if (notes !== undefined) updates.description = notes;

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: updates },
      { new: true, lean: true }
    );

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
      data: { product: updatedProduct, skuGenerated },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to update product');
  }
}
