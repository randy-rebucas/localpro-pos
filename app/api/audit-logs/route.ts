import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import { requireAuth } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    await connectDB();

    // Get translation function
    const t = await getValidationTranslatorFromRequest(request);

    // Only admin and owner can view audit logs
    if (user.role !== 'admin' && user.role !== 'owner') {
      return NextResponse.json(
        { success: false, error: t('validation.forbiddenAdminAccess', 'Forbidden: Admin access required') },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    // Filters
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build query
    const query: { tenantId: string; action?: string; entityType?: string; userId?: string; createdAt?: { $gte?: Date; $lte?: Date } } = { tenantId: user.tenantId };

    if (action) {
      query.action = action;
    }

    if (entityType) {
      query.entityType = entityType;
    }

    if (userId) {
      query.userId = userId;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    // Fetch audit logs with pagination
    const [auditLogs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: auditLogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    console.error('Get audit logs error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    const errorMessage = error instanceof Error ? error.message : t('validation.failedToFetchAuditLogs', 'Failed to fetch audit logs');
    return NextResponse.json(
      { success: false, error: errorMessage }, 
      { status: errorMessage === 'Unauthorized' ? 401 : 500 }
    );
  }
}

