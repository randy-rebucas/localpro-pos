import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SavedCart from '@/models/SavedCart';
import Product from '@/models/Product';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import mongoose from 'mongoose';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    
    const savedCarts = await SavedCart.find({
      tenantId: tenantObjectId,
      userId: user.userId,
      isActive: { $ne: false },
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: savedCarts });
  } catch (error: unknown) {
    logger.error('Error fetching saved carts:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch saved carts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const body = await request.json();
    const { name, items, subtotal, discountCode, discountAmount, total } = body;

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: t('validation.cartNameRequired', 'Cart name is required') },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: t('validation.cartItemsRequired', 'Cart must contain at least one item') },
        { status: 400 }
      );
    }

    // Validate items
    for (const item of items) {
      if (!item.productId || !item.name || item.price === undefined || !item.quantity || item.stock === undefined) {
        return NextResponse.json(
          { success: false, error: t('validation.invalidCartItem', 'Invalid cart item data') },
          { status: 400 }
        );
      }
    }

    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    // Validate all product IDs belong to this tenant and use DB-authoritative price/stock
    const productIds = items.map((item: { productId: string }) => item.productId);
    const dbProducts = await Product.find({
      _id: { $in: productIds },
      tenantId: tenantObjectId,
    }).lean();
    const dbProductMap = new Map(dbProducts.map(p => [p._id.toString(), p]));

    const validatedItems: Array<{ productId: mongoose.Types.ObjectId; name: string; price: number; quantity: number; stock: number }> = [];
    for (const item of items as Array<{ productId: string; quantity: unknown }>) {
      const dbProduct = dbProductMap.get(item.productId);
      if (!dbProduct) {
        return NextResponse.json(
          { success: false, error: t('validation.productNotFoundInTransaction', 'Product {productId} not found').replace('{productId}', item.productId) },
          { status: 404 }
        );
      }
      validatedItems.push({
        productId: new mongoose.Types.ObjectId(item.productId),
        name: dbProduct.name,
        price: dbProduct.price,
        quantity: parseInt(String(item.quantity)),
        stock: dbProduct.stock ?? 0,
      });
    }

    // Recalculate subtotal from DB prices
    const dbSubtotal = validatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const savedCart = await SavedCart.create({
      tenantId: tenantObjectId,
      name: name.trim(),
      items: validatedItems,
      subtotal: Math.round(dbSubtotal * 100) / 100,
      discountCode: discountCode?.trim().toUpperCase() || undefined,
      discountAmount: discountAmount ? parseFloat(discountAmount) : undefined,
      total: parseFloat(total) || 0,
      userId: user.userId,
    });

    return NextResponse.json({ success: true, data: savedCart }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error saving cart:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

