import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import Branch from '@/models/Branch';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

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

    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search')?.trim() ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      isActive: true,
      'settings.businessType': { $in: ['retail', 'general'] },
    };

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.name = { $regex: escaped, $options: 'i' };
    }

    const [tenants, total] = await Promise.all([
      Tenant.find(query, {
        slug: 1,
        name: 1,
        'settings.businessType': 1,
        'settings.logo': 1,
        'settings.phone': 1,
        'settings.address': 1,
        'settings.businessName': 1,
      })
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Tenant.countDocuments(query),
    ]);

    if (tenants.length === 0) {
      return NextResponse.json({
        success: true,
        data: { stores: [], total: 0, page, limit },
      });
    }

    // Fetch all active branches for the matched tenants in one query
    const tenantIds = tenants.map((t) => t._id);
    const branches = await Branch.find(
      { tenantId: { $in: tenantIds }, isActive: true },
      { tenantId: 1, name: 1, address: 1 }
    )
      .sort({ name: 1 })
      .lean();

    // Group branches by tenantId string for quick lookup
    const branchMap = new Map<string, typeof branches>();
    for (const b of branches) {
      const key = b.tenantId.toString();
      if (!branchMap.has(key)) branchMap.set(key, []);
      branchMap.get(key)!.push(b);
    }

    const stores = tenants.map((t) => {
      const tenantBranches = branchMap.get(t._id.toString()) ?? [];
      return {
        id: t._id.toString(),
        name: t.name,
        slug: t.slug,
        businessType: t.settings?.businessType ?? 'general',
        logo: t.settings?.logo ?? null,
        phone: t.settings?.phone ?? null,
        address: formatAddress(t.settings?.address),
        branches: tenantBranches.map((b) => ({
          id: b._id.toString(),
          branchId: b._id.toString(),
          tenantId: t._id.toString(),
          name: b.name,
          address: formatAddress(b.address),
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
