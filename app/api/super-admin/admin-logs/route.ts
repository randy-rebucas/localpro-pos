import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import type { Prisma } from '@prisma/client';

// GET /api/super-admin/admin-logs
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || '';
    const targetType = searchParams.get('targetType') || '';
    const adminId = searchParams.get('adminId') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));

    const where: Prisma.SuperAdminActionWhereInput = {};
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (targetType) where.targetType = targetType;
    if (adminId) where.adminUserId = adminId;
    if (startDate || endDate) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      where.createdAt = dateFilter;
    }

    const [logs, total] = await Promise.all([
      prisma.superAdminAction.findMany({
        where,
        include: { adminUser: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.superAdminAction.count({ where }),
    ]);

    const data = logs.map(({ id, adminUserId, adminUser, ...rest }) => ({
      _id: id,
      ...rest,
      adminUserId: adminUser ? { _id: adminUserId, name: adminUser.name, email: adminUser.email } : adminUserId,
    }));

    return NextResponse.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}
