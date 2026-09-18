import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getTenantDayBoundaries, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';
import type { DrugSchedule } from '@prisma/client';

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
    const tenantSettings = await prisma.tenantSettings.findUnique({
      where: { tenantId: user.tenantId },
      select: { expiryAlertDays: true, timezone: true },
    });
    const defaultAlertDays = tenantSettings?.expiryAlertDays ?? 90;
    const { searchParams } = new URL(request.url);
    const alertDays = Number(searchParams.get('days') ?? defaultAlertDays);
    const scheduleFilter = searchParams.get('schedule') as DrugSchedule | null; // otc | rx | dangerous

    const today = getTenantDayBoundaries(new Date(), tenantSettings?.timezone || DEFAULT_TENANT_TIMEZONE).start;
    const alertDate = new Date(today);
    alertDate.setDate(alertDate.getDate() + alertDays);

    // Pharmacy fields (expiryDate, drugSchedule, genericName, batchNumber) live
    // on the ProductPharmacyDetails child table in Postgres, not on Product.
    const pharmacyDetailsWhere = scheduleFilter ? { drugSchedule: scheduleFilter } : {};

    const select = {
      id: true,
      name: true,
      sku: true,
      stock: true,
      pharmacyDetails: {
        select: {
          genericName: true,
          batchNumber: true,
          expiryDate: true,
          drugSchedule: true,
        },
      },
    } as const;

    // Fetch both already-expired and expiring-within-alertDays
    const [expired, expiring] = await Promise.all([
      prisma.product.findMany({
        where: {
          tenantId: user.tenantId,
          isActive: true,
          pharmacyDetails: { expiryDate: { not: null, lt: today }, ...pharmacyDetailsWhere },
        },
        select,
        orderBy: { pharmacyDetails: { expiryDate: 'asc' } },
      }),
      prisma.product.findMany({
        where: {
          tenantId: user.tenantId,
          isActive: true,
          pharmacyDetails: { expiryDate: { not: null, gte: today, lte: alertDate }, ...pharmacyDetailsWhere },
        },
        select,
        orderBy: { pharmacyDetails: { expiryDate: 'asc' } },
      }),
    ]);

    const now = Date.now();

    const mapProduct = (p: (typeof expired)[number]) => {
      const expiryDate = p.pharmacyDetails!.expiryDate!;
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now) / 86400000);
      let status: 'expired' | 'critical' | 'warning';
      if (daysUntilExpiry < 0) status = 'expired';
      else if (daysUntilExpiry <= 30) status = 'critical';
      else status = 'warning';
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        genericName: p.pharmacyDetails!.genericName,
        batchNumber: p.pharmacyDetails!.batchNumber,
        expiryDate: p.pharmacyDetails!.expiryDate,
        drugSchedule: p.pharmacyDetails!.drugSchedule,
        daysUntilExpiry,
        status,
      };
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
