import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

function toSavedCartJSON(c: {
  id: string;
  subtotal: unknown;
  discountAmount: unknown;
  total: unknown;
  items?: Array<{ id: string; price: unknown; [key: string]: unknown }>;
  [key: string]: unknown;
}) {
  return {
    ...c,
    _id: c.id,
    subtotal: Number(c.subtotal),
    discountAmount: c.discountAmount != null ? Number(c.discountAmount) : undefined,
    total: Number(c.total),
    items: c.items?.map((item) => ({ ...item, _id: item.id, price: Number(item.price) })),
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
      include: { items: true },
    });

    if (!savedCart) {
      return NextResponse.json({ success: false, error: t('validation.savedCartNotFound', 'Saved cart not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toSavedCartJSON(savedCart) });
  } catch (error: unknown) {
    logger.error('Error fetching saved cart:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch saved cart' }, { status: 500 });
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

    const existing = await prisma.savedCart.findFirst({
      where: { id, tenantId, userId: user.userId, isActive: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: t('validation.savedCartNotFound', 'Saved cart not found') }, { status: 404 });
    }

    await prisma.savedCart.update({
      where: { id: existing.id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, message: t('validation.savedCartDeleted', 'Saved cart deleted successfully') });
  } catch (error: unknown) {
    logger.error('Error deleting saved cart:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to delete saved cart' }, { status: 500 });
  }
}
