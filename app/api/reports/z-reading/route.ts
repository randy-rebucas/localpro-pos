import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDailySalesAggregate, startOfBusinessDay } from '@/lib/bir-readings';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeZReading(z: any): Record<string, unknown> {
  const { id, generatedByUser, ...rest } = z;
  const out: Record<string, unknown> = { _id: id, ...rest };
  for (const key of ['beginningGT', 'endingGT', 'grossSales', 'vatableSales', 'vatAmount', 'vatExemptSales', 'zeroRatedSales', 'discountTotal']) {
    if (out[key] !== null && out[key] !== undefined) out[key] = Number(out[key]);
  }
  if (generatedByUser) out.generatedBy = { _id: z.generatedBy, name: generatedByUser.name, email: generatedByUser.email };
  return out;
}

/** List historical Z-Readings for the tenant. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'reports.z_reading'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);

    const readings = await prisma.zReading.findMany({
      where: { tenantId },
      orderBy: { businessDate: 'desc' },
      take: limit,
      include: { generatedByUser: { select: { name: true, email: true } } },
    });

    return NextResponse.json({ success: true, data: readings.map(serializeZReading) });
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
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'reports.z_reading'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const rl = checkRateLimit(`z-reading:${tenantId}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const businessDate = startOfBusinessDay(body.date ? new Date(body.date) : new Date());

    const existing = await prisma.zReading.findFirst({
      where: { tenantId, businessDate },
      include: { generatedByUser: { select: { name: true, email: true } } },
    });
    if (existing) {
      await createAuditLog(request, {
        tenantId,
        userId: user.userId,
        action: AuditActions.Z_READING_VIEW,
        entityType: 'z_reading',
        entityId: existing.id,
        metadata: { businessDate: businessDate.toISOString(), reprint: true },
      });
      return NextResponse.json({ success: true, data: serializeZReading(existing), reprint: true });
    }

    const [aggregate, tenant] = await Promise.all([
      getDailySalesAggregate(tenantId, businessDate),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { grandTotalSales: true } }),
    ]);

    const endingGT = tenant?.grandTotalSales ? Number(tenant.grandTotalSales) : 0;
    const beginningGT = Math.max(0, endingGT - aggregate.grossSales);

    let zReading;
    try {
      zReading = await prisma.zReading.create({
        data: {
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
        },
      });
    } catch (createErr: unknown) {
      // Unique index race: another request generated it first — return that one as a reprint.
      if (createErr instanceof Prisma.PrismaClientKnownRequestError && createErr.code === 'P2002') {
        const race = await prisma.zReading.findFirst({
          where: { tenantId, businessDate },
          include: { generatedByUser: { select: { name: true, email: true } } },
        });
        if (race) {
          return NextResponse.json({ success: true, data: serializeZReading(race), reprint: true });
        }
      }
      throw createErr;
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.Z_READING_GENERATE,
      entityType: 'z_reading',
      entityId: zReading.id,
      changes: {
        businessDate: businessDate.toISOString(),
        grossSales: aggregate.grossSales,
        beginningGT,
        endingGT,
        transactionCount: aggregate.transactionCount,
      },
    });

    return NextResponse.json({ success: true, data: serializeZReading(zReading), reprint: false }, { status: 201 });
  } catch (error: unknown) {
    logger.error('Error generating Z-Reading:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate Z-Reading';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
