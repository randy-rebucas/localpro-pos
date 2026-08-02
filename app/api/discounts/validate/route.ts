import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantSettingsById } from '@/lib/tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { ensureLegalDiscounts, findDiscountByCode, LEGAL_DISCOUNT_CODES } from '@/lib/data/discounts';

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);

    // Rate limit: 20 attempts per minute per IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateCheck = checkRateLimit(`discount-validate:${ip}`, 20, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rateCheck.resetAfterMs / 1000)) } }
      );
    }

    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const body = await request.json();
    const { code, subtotal } = body;

    if (!code) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeRequired', 'Discount code is required') },
        { status: 400 }
      );
    }

    const upperCode = code.toUpperCase();
    const isLegalDiscount = LEGAL_DISCOUNT_CODES.includes(upperCode);

    // Auto-seed legal discounts for this tenant on first use
    if (isLegalDiscount) {
      await ensureLegalDiscounts(tenantId);
    }

    // Check if discounts feature is enabled (skip for legally-required discounts)
    if (!isLegalDiscount) {
      const tenantSettings = await getTenantSettingsById(tenantId);
      if (tenantSettings && tenantSettings.enableDiscounts === false) {
        return NextResponse.json(
          { success: false, error: t('validation.discountsNotEnabled', 'Discounts are not enabled for this tenant') },
          { status: 400 }
        );
      }
    }

    const discount = await findDiscountByCode(tenantId, upperCode, true);

    if (!discount) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidDiscountCode', 'Invalid or inactive discount code') },
        { status: 400 }
      );
    }

    // Check validity dates
    const now = new Date();
    if (now < discount.validFrom || now > discount.validUntil) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeNotValid', 'Discount code is not valid at this time') },
        { status: 400 }
      );
    }

    // Check usage limit (legal discounts have no usage limit)
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
      return NextResponse.json(
        { success: false, error: t('validation.discountCodeUsageLimit', 'Discount code has reached its usage limit') },
        { status: 400 }
      );
    }

    const minPurchaseAmount = discount.minPurchaseAmount != null ? Number(discount.minPurchaseAmount) : null;
    const maxDiscountAmount = discount.maxDiscountAmount != null ? Number(discount.maxDiscountAmount) : null;
    const value = Number(discount.value);

    // Check minimum purchase amount
    if (minPurchaseAmount && subtotal < minPurchaseAmount) {
      const errorMsg = t('validation.minimumPurchaseAmount', 'Minimum purchase amount of {amount} required').replace('{amount}', minPurchaseAmount.toString());
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 400 }
      );
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (discount.type === 'percentage') {
      discountAmount = Math.round((subtotal * value) / 100 * 100) / 100;
      if (maxDiscountAmount) {
        discountAmount = Math.min(discountAmount, maxDiscountAmount);
      }
    } else {
      discountAmount = Math.min(value, subtotal);
    }

    return NextResponse.json({
      success: true,
      data: {
        code: discount.code,
        name: discount.name,
        type: discount.type,
        value,
        category: discount.category,
        requiresIdVerification: discount.requiresIdVerification,
        discountAmount,
        finalTotal: Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100),
      },
    });
  } catch (error: unknown) {
    logger.error('Error validating discount:', error);
    return NextResponse.json({ success: false, error: 'Failed to validate discount' }, { status: 500 });
  }
}
