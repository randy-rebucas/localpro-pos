import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Tenant from '@/models/Tenant';
import { getCurrentUser } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!['owner', 'admin', 'manager'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    // Get tenant's configured alert days, fallback to query param or 90
    const tenant = await Tenant.findOne({ _id: user.tenantId }).lean();
    const defaultAlertDays = tenant?.settings?.pharmacyCompliance?.expiryAlertDays ?? 90;
    const { searchParams } = new URL(request.url);
    const alertDays = Number(searchParams.get('days') ?? defaultAlertDays);
    const scheduleFilter = searchParams.get('schedule'); // otc | rx | dangerous

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const alertDate = new Date(today);
    alertDate.setDate(alertDate.getDate() + alertDays);

    const baseFilter: Record<string, unknown> = {
      tenantId: user.tenantId,
      isActive: true,
      expiryDate: { $exists: true, $ne: null },
    };
    if (scheduleFilter) baseFilter.drugSchedule = scheduleFilter;

    // Fetch both already-expired and expiring-within-alertDays
    const [expired, expiring] = await Promise.all([
      Product.find({ ...baseFilter, expiryDate: { $lt: today } })
        .select('name genericName sku batchNumber expiryDate stock drugSchedule')
        .sort({ expiryDate: 1 })
        .lean(),
      Product.find({ ...baseFilter, expiryDate: { $gte: today, $lte: alertDate } })
        .select('name genericName sku batchNumber expiryDate stock drugSchedule')
        .sort({ expiryDate: 1 })
        .lean(),
    ]);

    const now = Date.now();

    const mapProduct = (p: Record<string, unknown>) => {
      const expiryDate = p.expiryDate as Date;
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now) / 86400000);
      let status: 'expired' | 'critical' | 'warning';
      if (daysUntilExpiry < 0) status = 'expired';
      else if (daysUntilExpiry <= 30) status = 'critical';
      else status = 'warning';
      return { ...p, daysUntilExpiry, status };
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
