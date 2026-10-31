import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import ZReading from '@/models/ZReading';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDailySalesAggregate, getBusinessDayRange, parseBusinessDateInput } from '@/lib/bir-readings';
import { getTenantSettingsById } from '@/lib/tenant';
import { getTenantTimezone } from '@/lib/timezone';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/** List historical Z-Readings for the tenant. */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'reports.z_reading'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);

    const readings = await ZReading.find({ tenantId })
      .sort({ businessDate: -1 })
      .limit(limit)
      .populate('generatedBy', 'name email')
      .lean();

    return NextResponse.json({ success: true, data: readings });
  } catch (error: unknown) {
    logger.error('Error fetching Z-Readings:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch Z-Readings';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * BIR Z-Reading: generates (once per business day) the official end-of-day
 * sales report. Locks in the day's totals against the non-resettable Grand
 * Total accumulator. Re-requesting the same business date returns the
 * existing record (reprint) rather than creating a second one.
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'reports.z_reading'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const rl = checkRateLimit(`z-reading:${tenantId}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    // body.date 'YYYY-MM-DD' means that calendar day in the tenant's timezone; the business
    // day is [local 00:00, next local 00:00) and businessDate is stored as the UTC instant of
    // local midnight (e.g. Manila 2026-10-30 -> 2026-10-29T16:00:00.000Z).
    const requestedDate = parseBusinessDateInput(body?.date);
    if (requestedDate === null) {
      return NextResponse.json({ success: false, error: t('validation.invalidDate', 'Invalid date') }, { status: 400 });
    }
    const tz = getTenantTimezone(await getTenantSettingsById(tenantId));
    const { start: businessDate, end: nextBusinessDay, ymd } = getBusinessDayRange(requestedDate, tz);
    // Z-Readings are currently tenant-wide: the aggregate and Grand Total accumulator below are
    // not branch-scoped and create() stores no branchId. The unique index is
    // {tenantId, branchId, businessDate}, where a missing branchId indexes as null — so match
    // branchId: null (missing or null) to hit exactly that key and never return a
    // branch-scoped reading for the same date.
    // The duplicate check matches any businessDate inside the local day window, not only the
    // exact local-midnight key: readings generated before business days were tenant-timezone
    // aware were keyed at UTC midnight (08:00 Manila of the same calendar day), and must still
    // be returned as a reprint rather than allowing a second Z-Reading for that day.
    const tenantReadingFilter = {
      tenantId,
      branchId: null,
      businessDate: { $gte: businessDate, $lt: nextBusinessDay },
    };

    const existing = await ZReading.findOne(tenantReadingFilter).populate('generatedBy', 'name email').lean();
    if (existing) {
      await createAuditLog(request, {
        tenantId,
        userId: user.userId,
        action: AuditActions.Z_READING_VIEW,
        entityType: 'z_reading',
        entityId: existing._id.toString(),
        metadata: { businessDate: businessDate.toISOString(), businessDay: ymd, timezone: tz, reprint: true },
      });
      return NextResponse.json({ success: true, data: existing, reprint: true });
    }

    const [aggregate, tenant] = await Promise.all([
      getDailySalesAggregate(tenantId, ymd, tz),
      Tenant.findById(tenantId).select('grandTotalSales').lean(),
    ]);

    const endingGT = tenant?.grandTotalSales ?? 0;
    const beginningGT = Math.max(0, endingGT - aggregate.grossSales);

    let zReading;
    try {
      zReading = await ZReading.create({
        tenantId,
        businessDate,
        beginningGT,
        endingGT,
        grossSales: aggregate.grossSales,
        vatableSales: aggregate.vatableSales,
        vatAmount: aggregate.vatAmount,
        vatExemptSales: aggregate.vatExemptSales,
        zeroRatedSales: aggregate.zeroRatedSales,
        discountTotal: aggregate.discountTotal,
        transactionCount: aggregate.transactionCount,
        voidCount: aggregate.voidCount,
        generatedBy: user.userId,
        generatedAt: new Date(),
      });
    } catch (createErr: unknown) {
      // Unique index race: another request generated it first — return that one as a reprint.
      if (createErr instanceof Error && 'code' in createErr && (createErr as { code?: number }).code === 11000) {
        const race = await ZReading.findOne(tenantReadingFilter).populate('generatedBy', 'name email').lean();
        if (race) {
          return NextResponse.json({ success: true, data: race, reprint: true });
        }
      }
      throw createErr;
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.Z_READING_GENERATE,
      entityType: 'z_reading',
      entityId: zReading._id.toString(),
      changes: {
        businessDate: businessDate.toISOString(),
        businessDay: ymd,
        timezone: tz,
        grossSales: aggregate.grossSales,
        beginningGT,
        endingGT,
        transactionCount: aggregate.transactionCount,
      },
    });

    return NextResponse.json({ success: true, data: zReading, reprint: false }, { status: 201 });
  } catch (error: unknown) {
    logger.error('Error generating Z-Reading:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate Z-Reading';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
