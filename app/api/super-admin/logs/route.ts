import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import Tenant from '@/models/Tenant';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const tenantId = searchParams.get('tenantId') || '';
    const tenantSlug = searchParams.get('tenantSlug') || '';
    const action = searchParams.get('action') || '';
    const entityType = searchParams.get('entityType') || '';
    const userId = searchParams.get('userId') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    const query: Record<string, unknown> = {};

    // Resolve tenantSlug → tenantId if provided
    if (tenantSlug) {
      const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id').lean();
      if (tenant) {
        query.tenantId = (tenant as { _id: unknown })._id;
      } else {
        return NextResponse.json({ success: true, data: [], pagination: { page, limit, total: 0, pages: 0 } });
      }
    } else if (tenantId) {
      query.tenantId = tenantId;
    }
    // If neither provided, no tenantId filter → returns all tenants' logs

    if (action) query.action = { $regex: action, $options: 'i' };
    if (entityType) query.entityType = entityType;
    if (userId) query.userId = userId;

    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      query.createdAt = dateFilter;
    }

    const format = searchParams.get('format') || 'json';
    const csvLimit = format === 'csv' ? 5000 : limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('tenantId', 'slug name')
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip(format === 'csv' ? 0 : (page - 1) * limit)
        .limit(csvLimit)
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    if (format === 'csv') {
      type LogEntry = {
        createdAt: Date;
        tenantId?: { slug?: string; name?: string };
        action?: string;
        entityType?: string;
        entityId?: string;
        userId?: { name?: string; email?: string };
        ipAddress?: string;
      };
      const csvRows = [
        'Timestamp,Tenant,Action,Entity Type,Entity ID,User,IP',
        ...logs.map((l) => {
          const log = l as LogEntry;
          const ts = new Date(log.createdAt).toISOString();
          const tenant = log.tenantId ? `${(log.tenantId as { slug?: string }).slug || ''}` : '';
          const user = log.userId ? `${(log.userId as { email?: string }).email || ''}` : '';
          return `"${ts}","${tenant}","${log.action || ''}","${log.entityType || ''}","${log.entityId || ''}","${user}","${log.ipAddress || ''}"`;
        }),
      ].join('\n');

      return new NextResponse(csvRows, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}
