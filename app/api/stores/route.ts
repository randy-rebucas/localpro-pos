import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/stores
 *
 * Two modes:
 *
 * 1. Unauthenticated + ?slug=<tenantSlug>
 *    Returns the branches of that tenant so the mobile login screen can let
 *    users pick a store/branch before they have a token.
 *    Response: { success, data: { stores: [{ id, name, tenantId, branchId, address }] } }
 *
 * 2. Authenticated (Bearer token)
 *    Returns all active branches for the authenticated user's tenant.
 *    Same response shape.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`stores:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    let tenantId: string | null = null;

    // Try authenticated path first
    const user = await getCurrentUser(request).catch(() => null);
    if (user) {
      tenantId = user.tenantId;
    }

    // Fall back to ?slug= param for pre-login store picker
    if (!tenantId) {
      const slug = request.nextUrl.searchParams.get('slug');
      if (!slug) {
        return NextResponse.json(
          { success: false, error: 'Provide a tenant slug (?slug=) or a valid auth token' },
          { status: 400 }
        );
      }
      const tenant = await prisma.tenant.findFirst({ where: { slug, isActive: true } });
      if (!tenant) {
        return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 });
      }
      tenantId = tenant.id;
    }

    const branches = await prisma.branch.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });

    const stores = branches.map((b) => {
      const address = b.address as { street?: string; city?: string; state?: string } | null;
      return {
        id: b.id,
        name: b.name,
        tenantId: b.tenantId,
        branchId: b.id,
        address: address
          ? [address.street, address.city, address.state].filter(Boolean).join(', ') || undefined
          : undefined,
      };
    });

    return NextResponse.json({ success: true, data: { stores } });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch stores');
  }
}
