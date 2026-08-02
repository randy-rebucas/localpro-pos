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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const savedCart = await prisma.savedCart.findFirst({
      where: {
        id,
        tenantId,
        userId: user.userId,
      },
    });

    if (!savedCart) {
      return NextResponse.json({ success: false, error: t('validation.savedCartNotFound', 'Saved cart not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: savedCartToApi(savedCart) });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching saved cart:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const result = await prisma.savedCart.updateMany({
      where: { id, tenantId, userId: user.userId, isActive: true },
      data: { isActive: false },
    });

    if (result.count === 0) {
      return NextResponse.json({ success: false, error: t('validation.savedCartNotFound', 'Saved cart not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: t('validation.savedCartDeleted', 'Saved cart deleted successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error deleting saved cart:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
