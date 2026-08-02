import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

function savedCartToApi(cart: { id: string; subtotal: unknown; discountAmount: unknown; total: unknown; [key: string]: unknown }) {
  const { id, subtotal, discountAmount, total, ...rest } = cart;
  return {
    _id: id,
    ...rest,
    subtotal: Number(subtotal),
    discountAmount: discountAmount !== null && discountAmount !== undefined ? Number(discountAmount) : discountAmount,
    total: Number(total),
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const savedCarts = await prisma.savedCart.findMany({
      where: {
        tenantId,
        userId: user.userId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: savedCarts.map(savedCartToApi) });
  } catch (error: unknown) {
    logger.error('Error fetching saved carts:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch saved carts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const body = await request.json();
    const { name, items, discountCode, discountAmount, total } = body;

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

    // Validate all product IDs belong to this tenant and use DB-authoritative price/stock
    const productIds = items.map((item: { productId: string }) => item.productId);
    const dbProducts = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId },
    });
    const dbProductMap = new Map(dbProducts.map((p) => [p.id, p]));

    const validatedItems: Array<{ productId: string; name: string; price: number; quantity: number; stock: number }> = [];
    for (const item of items as Array<{ productId: string; quantity: unknown }>) {
      const dbProduct = dbProductMap.get(item.productId);
      if (!dbProduct) {
        return NextResponse.json(
          { success: false, error: t('validation.productNotFoundInTransaction', 'Product {productId} not found').replace('{productId}', item.productId) },
          { status: 404 }
        );
      }
      validatedItems.push({
        productId: item.productId,
        name: dbProduct.name,
        price: Number(dbProduct.price),
        quantity: parseInt(String(item.quantity)),
        stock: Number(dbProduct.stock ?? 0),
      });
    }

    // Recalculate subtotal from DB prices
    const dbSubtotal = validatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const savedCart = await prisma.savedCart.create({
      data: {
        tenantId,
        name: name.trim(),
        items: validatedItems,
        subtotal: Math.round(dbSubtotal * 100) / 100,
        discountCode: discountCode?.trim().toUpperCase() || undefined,
        discountAmount: discountAmount ? parseFloat(discountAmount) : undefined,
        total: parseFloat(total) || 0,
        userId: user.userId,
      },
    });

    return NextResponse.json({ success: true, data: savedCartToApi(savedCart) }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error saving cart:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
