import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

function toDiscountJSON(d: {
  id: string;
  value: Prisma.Decimal;
  minPurchaseAmount: Prisma.Decimal | null;
  maxDiscountAmount: Prisma.Decimal | null;
  [key: string]: unknown;
}) {
  return {
    ...d,
    _id: d.id,
    value: Number(d.value),
    minPurchaseAmount: d.minPurchaseAmount != null ? Number(d.minPurchaseAmount) : undefined,
    maxDiscountAmount: d.maxDiscountAmount != null ? Number(d.maxDiscountAmount) : undefined,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess(request);
    const { id } = await params;

    const discount = await prisma.discount.findFirst({ where: { id, tenantId } });
    if (!discount) {
      return NextResponse.json({ success: false, error: 'Discount not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toDiscountJSON(discount) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch discount');
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'discounts.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:discounts:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const discount = await prisma.discount.findFirst({ where: { id, tenantId } });
    if (!discount) {
      return NextResponse.json({ success: false, error: t('validation.discountNotFound', 'Discount not found') }, { status: 404 });
    }

    const body = await request.json();
    const updates: Prisma.DiscountUpdateInput = {};

    // Code is immutable after creation — prevent accidental duplicate codes
    if (body.code !== undefined && body.code !== discount.code) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeImmutable', 'Discount code cannot be changed after creation') },
        { status: 400 }
      );
    }

    // Input length validation
    if (body.name !== undefined) {
      if (typeof body.name === 'string' && body.name.length > 100) {
        return NextResponse.json({ success: false, error: 'Name must be 100 characters or less' }, { status: 400 });
      }
      updates.name = body.name;
    }
    if (body.description !== undefined) {
      if (typeof body.description === 'string' && body.description.length > 500) {
        return NextResponse.json({ success: false, error: 'Description must be 500 characters or less' }, { status: 400 });
      }
      updates.description = body.description;
    }
    if (body.category !== undefined) updates.category = body.category;
    if (body.requiresIdVerification !== undefined) updates.requiresIdVerification = body.requiresIdVerification;
    if (body.value !== undefined) {
      if (discount.type === 'percentage' && (body.value < 0 || body.value > 100)) {
        return NextResponse.json(
          { success: false, error: t('validation.percentageDiscountRange', 'Percentage discount must be between 0 and 100') },
          { status: 400 }
        );
      }
      if (discount.type === 'fixed' && body.value < 0) {
        return NextResponse.json(
          { success: false, error: t('validation.fixedDiscountPositive', 'Fixed discount must be positive') },
          { status: 400 }
        );
      }
      updates.value = body.value;
    }
    if (body.minPurchaseAmount !== undefined) updates.minPurchaseAmount = body.minPurchaseAmount;
    if (body.maxDiscountAmount !== undefined) updates.maxDiscountAmount = body.maxDiscountAmount;
    if (body.validFrom !== undefined) updates.validFrom = new Date(body.validFrom);
    if (body.validUntil !== undefined) updates.validUntil = new Date(body.validUntil);

    // Validate date range
    const effectiveFrom = (updates.validFrom as Date | undefined) || discount.validFrom;
    const effectiveUntil = (updates.validUntil as Date | undefined) || discount.validUntil;
    if (effectiveFrom && effectiveUntil && new Date(effectiveFrom) >= new Date(effectiveUntil)) {
      return NextResponse.json(
        { success: false, error: t('validation.validUntilAfterFrom', 'End date must be after start date') },
        { status: 400 }
      );
    }

    if (body.usageLimit !== undefined) updates.usageLimit = body.usageLimit;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const updated = await prisma.discount.update({
      where: { id: discount.id },
      data: updates,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DISCOUNT_UPDATE,
      entityType: 'discount',
      entityId: id,
      changes: updates,
    });

    return NextResponse.json({ success: true, data: toDiscountJSON(updated) });
  } catch (error) {
    return handleApiError(error, 'Failed to update discount');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'discounts.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:discounts:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const discount = await prisma.discount.findFirst({ where: { id, tenantId } });
    if (!discount) {
      return NextResponse.json({ success: false, error: t('validation.discountNotFound', 'Discount not found') }, { status: 404 });
    }

    // Preserve audit trail: a discount already applied to past transactions must not be hard-deleted.
    if (discount.usageCount > 0) {
      const errorMsg = t(
        'validation.discountInUse',
        'Cannot delete discount "{code}": it has been used {count} time(s) in transactions. Deactivate it instead (set isActive = false).'
      ).replace('{code}', discount.code).replace('{count}', String(discount.usageCount));
      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
    }

    await prisma.discount.delete({ where: { id: discount.id } });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DISCOUNT_DELETE,
      entityType: 'discount',
      entityId: id,
      changes: { code: discount.code },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete discount');
  }
}
