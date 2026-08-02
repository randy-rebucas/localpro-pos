import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasTenantPermission(user.role, user.tenantId, 'expiry_tracking.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Get tenant's configured alert days, fallback to query param or 90
    const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { settings: true } });
    const settings = (tenant?.settings ?? {}) as { pharmacyCompliance?: { expiryAlertDays?: number } };
    const defaultAlertDays = settings.pharmacyCompliance?.expiryAlertDays ?? 90;
    const { searchParams } = new URL(request.url);
    const alertDays = Number(searchParams.get('days') ?? defaultAlertDays);
    const scheduleFilter = searchParams.get('schedule'); // otc | rx | dangerous

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const alertDate = new Date(today);
    alertDate.setDate(alertDate.getDate() + alertDays);

    const baseWhere: Prisma.ProductWhereInput = {
      tenantId: user.tenantId,
      isActive: true,
      expiryDate: { not: null },
    };
    if (scheduleFilter) baseWhere.drugSchedule = scheduleFilter as Prisma.ProductWhereInput['drugSchedule'];

    const select = {
      id: true,
      name: true,
      genericName: true,
      sku: true,
      batchNumber: true,
      expiryDate: true,
      stock: true,
      drugSchedule: true,
    } satisfies Prisma.ProductSelect;

    // Fetch both already-expired and expiring-within-alertDays
    const [expired, expiring] = await Promise.all([
      prisma.product.findMany({
        where: { ...baseWhere, expiryDate: { lt: today } },
        select,
        orderBy: { expiryDate: 'asc' },
      }),
      prisma.product.findMany({
        where: { ...baseWhere, expiryDate: { gte: today, lte: alertDate } },
        select,
        orderBy: { expiryDate: 'asc' },
      }),
    ]);

    const now = Date.now();

    const mapProduct = (p: (typeof expired)[number]) => {
      const expiryDate = p.expiryDate as Date;
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now) / 86400000);
      let status: 'expired' | 'critical' | 'warning';
      if (daysUntilExpiry < 0) status = 'expired';
      else if (daysUntilExpiry <= 30) status = 'critical';
      else status = 'warning';
      return { ...p, _id: p.id, stock: Number(p.stock), daysUntilExpiry, status };
    };

    await createAuditLog(request, {
      tenantId: user.tenantId,
      userId: user.userId,
      action: AuditActions.EXPIRY_REPORT_VIEW,
      entityType: 'expiry_report',
      metadata: { alertDays },
    });

    return NextResponse.json({
      success: true,
      data: {
        alertDays,
        totalExpired: expired.length,
        totalExpiring: expiring.length,
        expired: expired.map(mapProduct),
        expiring: expiring.map(mapProduct),
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch expiry report');
  }
}
