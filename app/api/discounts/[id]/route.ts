import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Discount from '@/models/Discount';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const discount = await Discount.findOne({ _id: id, tenantId }).lean();
    if (!discount) {
      return NextResponse.json({ success: false, error: 'Discount not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: discount });
  } catch (error: unknown) {
    logger.error('Error fetching discount:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch discount' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    await requireRole(request, ['admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const discount = await Discount.findOne({ _id: id, tenantId });
    if (!discount) {
      return NextResponse.json({ success: false, error: t('validation.discountNotFound', 'Discount not found') }, { status: 404 });
    }

    const body = await request.json();
    const updates: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

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
    const effectiveFrom = updates.validFrom || discount.validFrom;
    const effectiveUntil = updates.validUntil || discount.validUntil;
    if (effectiveFrom && effectiveUntil && new Date(effectiveFrom) >= new Date(effectiveUntil)) {
      return NextResponse.json(
        { success: false, error: t('validation.validUntilAfterFrom', 'End date must be after start date') },
        { status: 400 }
      );
    }

    if (body.usageLimit !== undefined) updates.usageLimit = body.usageLimit;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    Object.assign(discount, updates);
    await discount.save();

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DISCOUNT_UPDATE,
      entityType: 'discount',
      entityId: id,
      changes: updates,
    });

    return NextResponse.json({ success: true, data: discount });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    await requireRole(request, ['admin', 'manager']);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const discount = await Discount.findOne({ _id: id, tenantId });
    if (!discount) {
      return NextResponse.json({ success: false, error: t('validation.discountNotFound', 'Discount not found') }, { status: 404 });
    }

    await discount.deleteOne();

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DISCOUNT_DELETE,
      entityType: 'discount',
      entityId: id,
      changes: { code: discount.code },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

