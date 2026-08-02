import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import type { Prisma } from '@prisma/client';

/**
 * GET /api/stores/retail
 *
 * Returns all active retail and general-store tenants, each with their
 * active branches. No auth required — used by the mobile login screen
 * so users can pick their store before they have a token.
 *
 * Query params:
 *   ?search=<string>   — filter by tenant name (case-insensitive)
 *   ?page=<n>          — 1-based page (default 1)
 *   ?limit=<n>         — results per page (default 50, max 100)
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`stores-retail:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search')?.trim() ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
    const skip = (page - 1) * limit;

    const where: Prisma.TenantWhereInput = {
      isActive: true,
      OR: [
        { settings: { path: ['businessType'], equals: 'retail' } },
        { settings: { path: ['businessType'], equals: 'general' } },
      ],
    };

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        select: { id: true, slug: true, name: true, settings: true },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.tenant.count({ where }),
    ]);

    if (tenants.length === 0) {
      return NextResponse.json({
        success: true,
        data: { stores: [], total: 0, page, limit },
      });
    }

    // Fetch all active branches for the matched tenants in one query
    const tenantIds = tenants.map((t) => t.id);
    const branches = await prisma.branch.findMany({
      where: { tenantId: { in: tenantIds }, isActive: true },
      select: { id: true, tenantId: true, name: true, address: true },
      orderBy: { name: 'asc' },
    });

    // Group branches by tenantId for quick lookup
    const branchMap = new Map<string, typeof branches>();
    for (const b of branches) {
      if (!branchMap.has(b.tenantId)) branchMap.set(b.tenantId, []);
      branchMap.get(b.tenantId)!.push(b);
    }

    const stores = tenants.map((t) => {
      const settings = t.settings as {
        businessType?: string;
        logo?: string;
        phone?: string;
        address?: Record<string, unknown>;
        businessName?: string;
      } | null;
      const tenantBranches = branchMap.get(t.id) ?? [];
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        businessType: settings?.businessType ?? 'general',
        logo: settings?.logo ?? null,
        phone: settings?.phone ?? null,
        address: formatAddress(settings?.address as any), // eslint-disable-line @typescript-eslint/no-explicit-any
        branches: tenantBranches.map((b) => ({
          id: b.id,
          branchId: b.id,
          tenantId: t.id,
          name: b.name,
          address: formatAddress(b.address as any), // eslint-disable-line @typescript-eslint/no-explicit-any
        })),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        stores,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch retail stores');
  }
}

function formatAddress(
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  } | null
): string | null {
  if (!address) return null;
  return (
    [address.street, address.city, address.state, address.zipCode, address.country]
      .filter(Boolean)
      .join(', ') || null
  );
}
