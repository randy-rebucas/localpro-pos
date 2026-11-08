import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Discount from '@/models/Discount';
import Tenant from '@/models/Tenant';
import { tenantDayEdge, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { isLegalDiscountCode, LOCKED_LEGAL_DISCOUNT_FIELDS } from '@/lib/legal-discounts';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const { id } = await params;

    const discount = await Discount.findOne({ _id: id, tenantId }).lean();
    if (!discount) {
      return NextResponse.json({ success: false, error: 'Discount not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: discount });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch discount');
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
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

    const discount = await Discount.findOne({ _id: id, tenantId });
    if (!discount) {
      return NextResponse.json({ success: false, error: t('validation.discountNotFound', 'Discount not found') }, { status: 404 });
    }

    const body = await request.json();
    const updates: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

    // SC20 / PWD20: the 20% rate, its category and ID check are set by law
    // (RA 9994, RA 10754) and the discount must stay available; only the
    // wording can be edited.
    if (isLegalDiscountCode(discount.code)) {
      const locked = LOCKED_LEGAL_DISCOUNT_FIELDS.find((field) => {
        if (body[field] === undefined) return false;
        const current = (discount as unknown as Record<string, unknown>)[field];
        if (field === 'validUntil' || field === 'validFrom') return true;
        // Turning a switched-off statutory discount back on is always allowed
        if (field === 'isActive' && body.isActive === true) return false;
        return String(body[field]) !== String(current);
      });
      if (locked) {
        return NextResponse.json(
          { success: false, error: t('validation.legalDiscountLocked', 'This discount is required by law; only its name and description can be changed') },
          { status: 400 }
        );
      }
    }

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
    // The edit form can switch between percentage and fixed; check the value
    // against the type it will have after this save, not the old one.
    if (body.type !== undefined) {
      if (body.type !== 'percentage' && body.type !== 'fixed') {
        return NextResponse.json({ success: false, error: t('validation.invalidDiscountType', 'Invalid discount type') }, { status: 400 });
      }
      updates.type = body.type;
    }
    if (body.value !== undefined || updates.type !== undefined) {
      const type = updates.type ?? discount.type;
      const value = body.value !== undefined ? Number(body.value) : discount.value;
      if (!Number.isFinite(value)) {
        return NextResponse.json({ success: false, error: t('validation.invalidValue', 'Invalid value') }, { status: 400 });
      }
      if (type === 'percentage' && (value < 0 || value > 100)) {
        return NextResponse.json(
          { success: false, error: t('validation.percentageDiscountRange', 'Percentage discount must be between 0 and 100') },
          { status: 400 }
        );
      }
      if (type === 'fixed' && value < 0) {
        return NextResponse.json(
          { success: false, error: t('validation.fixedDiscountPositive', 'Fixed discount must be positive') },
          { status: 400 }
        );
      }
      if (body.value !== undefined) updates.value = value;
    }
    if (body.minPurchaseAmount !== undefined) updates.minPurchaseAmount = body.minPurchaseAmount;
    if (body.maxDiscountAmount !== undefined) updates.maxDiscountAmount = body.maxDiscountAmount;
    if (body.validFrom !== undefined || body.validUntil !== undefined) {
      // A picked day runs from the start of validFrom to the end of validUntil at the store
      const tenantDoc = await Tenant.findById(tenantId).select('settings.timezone').lean();
      const tz = tenantDoc?.settings?.timezone || DEFAULT_TENANT_TIMEZONE;
      if (body.validFrom !== undefined) updates.validFrom = tenantDayEdge(body.validFrom, 'start', tz);
      if (body.validUntil !== undefined) updates.validUntil = tenantDayEdge(body.validUntil, 'end', tz);
    }

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
  } catch (error) {
    return handleApiError(error, 'Failed to update discount');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
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

    const discount = await Discount.findOne({ _id: id, tenantId });
    if (!discount) {
      return NextResponse.json({ success: false, error: t('validation.discountNotFound', 'Discount not found') }, { status: 404 });
    }

    if (isLegalDiscountCode(discount.code)) {
      return NextResponse.json(
        { success: false, error: t('validation.legalDiscountLocked', 'This discount is required by law; only its name and description can be changed') },
        { status: 400 }
      );
    }

    // Preserve audit trail: a discount already applied to past transactions must not be hard-deleted.
    if (discount.usageCount > 0) {
      const errorMsg = t(
        'validation.discountInUse',
        'Cannot delete discount "{code}": it has been used {count} time(s) in transactions. Deactivate it instead (set isActive = false).'
      ).replace('{code}', discount.code).replace('{count}', String(discount.usageCount));
      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
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
  } catch (error) {
    return handleApiError(error, 'Failed to delete discount');
  }
}

