import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Discount from '@/models/Discount';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkFeatureAccess } from '@/lib/subscription';
import { ensureLegalDiscounts } from '@/lib/discount-seeds';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:discounts:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    // Auto-seed legal discounts (SC20, PWD20) for this tenant
    await ensureLegalDiscounts(tenantId);

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const query: any = { tenantId }; // eslint-disable-line @typescript-eslint/no-explicit-any
    
    if (code) {
      query.code = code.toUpperCase();
    }
    
    if (activeOnly) {
      query.isActive = true;
      query.validFrom = { $lte: new Date() };
      query.validUntil = { $gte: new Date() };
    }

    const discounts = await Discount.find(query).sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: discounts });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch discounts');
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);
    if (!(await hasTenantPermission(user.role, tenantId, 'discounts.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:discounts:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    // Check if discounts feature is enabled in subscription
    try {
      await checkFeatureAccess(tenantId.toString(), 'enableDiscounts');
    } catch (featureError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      return NextResponse.json(
        { success: false, error: featureError.message },
        { status: 403 }
      );
    }

    const t = await getValidationTranslatorFromRequest(request);

    const body = await request.json();
    const {
      code,
      name,
      description,
      type,
      value,
      category,
      requiresIdVerification,
      minPurchaseAmount,
      maxDiscountAmount,
      validFrom,
      validUntil,
      usageLimit,
      isActive = true,
    } = body;

    // Validate required fields
    if (!code || !type || value === undefined || !validFrom || !validUntil) {
      return NextResponse.json(
        { success: false, error: t('validation.missingRequiredFields', 'Missing required fields') },
        { status: 400 }
      );
    }

    // Input length validation
    if (typeof code === 'string' && code.length > 50) {
      return NextResponse.json({ success: false, error: 'Code must be 50 characters or less' }, { status: 400 });
    }
    if (name && typeof name === 'string' && name.length > 100) {
      return NextResponse.json({ success: false, error: 'Name must be 100 characters or less' }, { status: 400 });
    }
    if (description && typeof description === 'string' && description.length > 500) {
      return NextResponse.json({ success: false, error: 'Description must be 500 characters or less' }, { status: 400 });
    }

    // Validate date range
    if (new Date(validFrom) >= new Date(validUntil)) {
      return NextResponse.json(
        { success: false, error: t('validation.validUntilAfterFrom', 'End date must be after start date') },
        { status: 400 }
      );
    }

    // Validate value based on type
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

    // Check if code already exists for this tenant
    const existing = await Discount.findOne({ tenantId, code: code.toUpperCase() });
    if (existing) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeExists', 'Discount code already exists') },
        { status: 400 }
      );
    }

    const discount = await Discount.create({
      tenantId,
      code: code.toUpperCase(),
      name,
      description,
      type,
      value,
      category: category || 'general',
      requiresIdVerification: requiresIdVerification || false,
      minPurchaseAmount,
      maxDiscountAmount,
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      usageLimit,
      isActive,
      usageCount: 0,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DISCOUNT_CREATE,
      entityType: 'discount',
      entityId: discount._id.toString(),
      changes: { code, type, value },
    });

    return NextResponse.json({ success: true, data: discount }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.code === 11000) {
      const t = await getValidationTranslatorFromRequest(request);
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeExists', 'Discount code already exists') },
        { status: 400 }
      );
    }
    return handleApiError(error, 'Failed to create discount');
  }
}

