import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { setBypassContext } from '@/lib/tenant-context';

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

    // Intentionally cross-tenant: public store directory, not scoped to one tenant.
    setBypassContext();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search')?.trim() ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
    const skip = (page - 1) * limit;

    const where = {
      isActive: true,
      settings: { businessType: { in: ['retail', 'general'] } },
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
    };

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        select: {
          id: true,
          slug: true,
          name: true,
          settings: {
            select: {
              businessType: true,
              logo: true,
              phone: true,
              addressStreet: true,
              addressCity: true,
              addressState: true,
              addressZipCode: true,
              addressCountry: true,
            },
          },
        },
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
      select: {
        id: true,
        tenantId: true,
        name: true,
        street: true,
        city: true,
        state: true,
        zipCode: true,
        country: true,
      },
      orderBy: { name: 'asc' },
    });

    // Group branches by tenantId for quick lookup
    const branchMap = new Map<string, typeof branches>();
    for (const b of branches) {
      if (!branchMap.has(b.tenantId)) branchMap.set(b.tenantId, []);
      branchMap.get(b.tenantId)!.push(b);
    }

    const stores = tenants.map((t) => {
      const tenantBranches = branchMap.get(t.id) ?? [];
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        businessType: t.settings?.businessType ?? 'general',
        logo: t.settings?.logo ?? null,
        phone: t.settings?.phone ?? null,
        address: formatAddress({
          street: t.settings?.addressStreet,
          city: t.settings?.addressCity,
          state: t.settings?.addressState,
          zipCode: t.settings?.addressZipCode,
          country: t.settings?.addressCountry,
        }),
        branches: tenantBranches.map((b) => ({
          id: b.id,
          branchId: b.id,
          tenantId: t.id,
          name: b.name,
          address: formatAddress(b),
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
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    country?: string | null;
  } | null
): string | null {
  if (!address) return null;
  return (
    [address.street, address.city, address.state, address.zipCode, address.country]
      .filter(Boolean)
      .join(', ') || null
  );
}
