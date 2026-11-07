import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ZReading from '@/models/ZReading';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { generateZReading } from '@/lib/z-reading';
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
    if (body.date && isNaN(new Date(body.date).getTime())) {
      return NextResponse.json({ success: false, error: t('validation.invalidDate', 'Invalid date') }, { status: 400 });
    }

    const { reading, created, businessDate } = await generateZReading({
      tenantId,
      day: body.date || new Date(),
      generatedBy: user.userId,
    });

    if (!created) {
      await createAuditLog(request, {
        tenantId,
        userId: user.userId,
        action: AuditActions.Z_READING_VIEW,
        entityType: 'z_reading',
        entityId: reading._id.toString(),
        metadata: { businessDate: businessDate.toISOString(), reprint: true },
      });
      return NextResponse.json({ success: true, data: reading, reprint: true });
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.Z_READING_GENERATE,
      entityType: 'z_reading',
      entityId: reading._id.toString(),
      changes: {
        businessDate: businessDate.toISOString(),
        grossSales: reading.grossSales,
        beginningGT: reading.beginningGT,
        endingGT: reading.endingGT,
        transactionCount: reading.transactionCount,
      },
    });

    return NextResponse.json({ success: true, data: reading, reprint: false }, { status: 201 });
  } catch (error: unknown) {
    logger.error('Error generating Z-Reading:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate Z-Reading';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
