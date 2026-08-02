import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';
import { getTenantBySlugAny } from '@/lib/data/tenants';
import type { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const tenantSlug = searchParams.get('tenantSlug') || '';
    const role = searchParams.get('role') || '';
    const search = searchParams.get('search') || '';

    // Build query — always exclude super_admin accounts
    const where: Prisma.UserWhereInput = { role: { not: 'super_admin' } };

    if (role) where.role = role as Prisma.UserWhereInput['role'];

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Resolve tenantSlug → tenantId
    if (tenantSlug) {
      const tenant = await getTenantBySlugAny(tenantSlug);
      if (tenant) {
        where.tenantId = tenant.id;
      } else {
        return NextResponse.json({
          success: true,
          data: [],
          pagination: { page, limit, total: 0, pages: 0 },
        });
      }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
          tenant: { select: { id: true, slug: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    const data = users.map(({ id, tenant, ...rest }) => ({
      _id: id,
      ...rest,
      tenantId: tenant ? { _id: tenant.id, slug: tenant.slug, name: tenant.name } : null,
    }));

    return NextResponse.json({
      success: true,
      data,
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
